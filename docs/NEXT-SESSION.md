# Bureau - Next Session Build Plan

**Status as of:** November 22, 2026, 5:25 AM UTC  
**Completed:** Database + RLS + Pricing Model + Unit Economics  
**Ready to build:** Auth → Cost Ledger → Costs/Rules tabs → Full flow

---

## ✅ What's Complete

### 1. Database (100%)
- ✅ Postgres running locally
- ✅ 18 tables with RLS policies
- ✅ Auth stubs (`auth.uid()`)
- ✅ Connection string: `postgresql://postgres@localhost:5432/bureau`

### 2. Pricing & Economics (100%)
- ✅ **New pricing:** Free (2 streams) + Plus ($9/mo or $79/yr)
- ✅ **LLM costs explicitly included:** $0.054/user/mo
- ✅ **Margin:** 85-99% at scale
- ✅ **Cost-per-output P&L** documented as lead wedge

### 3. UI Foundation (100%)
- ✅ Top Floor with 4 real streams
- ✅ Connection management
- ✅ Stream details
- ✅ Build passing

### 4. Auth Adapter (100%)
- ✅ `lib/auth-adapter.ts` ready
- ✅ Magic links log to console
- ✅ Sessions in Postgres

---

## 🚀 Build Queue (Priority Order)

### Priority 1: Cost Ledger Schema & API (NEW)

**Why first:** This is the FREE tier value prop and lead wedge.

**Schema addition needed:**

```sql
-- Add to migration
CREATE TABLE output_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stream_id UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  output_id TEXT NOT NULL, -- e.g., "ep12", "short-too-many-trees"
  output_name TEXT NOT NULL,
  output_type TEXT NOT NULL, -- episode, short, video, post
  generation_cost_usd NUMERIC NOT NULL,
  failed_renders_cost_usd NUMERIC DEFAULT 0,
  
  -- Cost breakdown
  elevenlabs_characters INTEGER,
  elevenlabs_cost_usd NUMERIC,
  higgsfield_credits NUMERIC,
  higgsfield_cost_usd NUMERIC,
  other_costs JSONB, -- {provider, units, cost}
  
  -- Performance
  views INTEGER DEFAULT 0,
  watch_time_seconds INTEGER,
  subscribers_gained INTEGER DEFAULT 0,
  revenue_usd NUMERIC DEFAULT 0,
  
  -- Trust
  trust_level TEXT NOT NULL, -- verified, declared, estimated
  verified_sources TEXT[], -- ["elevenlabs-api", "youtube-api"]
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  
  UNIQUE(stream_id, output_id)
);

CREATE INDEX idx_output_costs_stream ON output_costs(stream_id);
```

**Prisma model:**

```prisma
model OutputCost {
  id                    String    @id @default(uuid())
  streamId              String    @map("stream_id")
  outputId              String    @map("output_id")
  outputName            String    @map("output_name")
  outputType            String    @map("output_type")
  generationCostUsd     Decimal   @map("generation_cost_usd")
  failedRendersCostUsd  Decimal?  @default(0) @map("failed_renders_cost_usd")
  
  elevenlabsCharacters  Int?      @map("elevenlabs_characters")
  elevenlabsCostUsd     Decimal?  @map("elevenlabs_cost_usd")
  higgsfieldCredits     Decimal?  @map("higgsfield_credits")
  higgsfieldCostUsd     Decimal?  @map("higgsfield_cost_usd")
  otherCosts            Json?     @map("other_costs")
  
  views                 Int?      @default(0)
  watchTimeSeconds      Int?      @map("watch_time_seconds")
  subscribersGained     Int?      @default(0) @map("subscribers_gained")
  revenueUsd            Decimal?  @default(0) @map("revenue_usd")
  
  trustLevel            String    @map("trust_level")
  verifiedSources       String[]  @map("verified_sources")
  
  createdAt             DateTime  @map("created_at")
  publishedAt           DateTime? @map("published_at")
  lastSyncedAt          DateTime? @map("last_synced_at")
  
  stream Stream @relation(fields: [streamId], references: [id], onDelete: Cascade)
  
  @@unique([streamId, outputId])
  @@map("output_costs")
}
```

### Priority 2: Auth Pages (2 hours)

**Files to create:**

1. **`app/auth/signup/page.tsx`**
```typescript
'use client';
import { useState } from 'react';
import { auth } from '@/lib/auth-adapter';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // Validate invite code
    const response = await fetch('/api/auth/validate-invite', {
      method: 'POST',
      body: JSON.stringify({ code: inviteCode }),
    });
    
    if (!response.ok) {
      alert('Invalid invite code');
      return;
    }
    
    // Send magic link
    await auth.sendMagicLink(email);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">Check your email</h1>
          <p>We sent a magic link to {email}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleSubmit} className="max-w-md w-full space-y-4">
        <h1 className="text-2xl font-bold">Sign up for Bureau</h1>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full px-4 py-2 border rounded"
          required
        />
        <input
          type="text"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          placeholder="Invite code"
          className="w-full px-4 py-2 border rounded"
          required
        />
        <button
          type="submit"
          className="w-full px-4 py-2 bg-highstreet-purple text-white rounded"
        >
          Send magic link
        </button>
      </form>
    </div>
  );
}
```

2. **`app/api/auth/validate-invite/route.ts`**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  const { code } = await request.json();
  
  const invite = await prisma.$queryRaw<Array<{ code: string; claimed_by: string | null }>>`
    SELECT code, claimed_by FROM pilot_invites
    WHERE code = ${code}
    AND expires_at > NOW()
    AND claimed_by IS NULL
  `;
  
  if (invite.length === 0) {
    return NextResponse.json({ error: 'Invalid or expired invite code' }, { status: 400 });
  }
  
  return NextResponse.json({ valid: true });
}
```

3. **`app/auth/verify/route.ts`**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-adapter';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  
  if (!token) {
    return NextResponse.redirect(new URL('/auth/signin', request.url));
  }
  
  const session = await auth.verifyToken(token);
  
  if (!session) {
    return NextResponse.redirect(new URL('/auth/signin?error=invalid', request.url));
  }
  
  // Set session cookie
  cookies().set('bureau_session', session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: session.expiresAt,
  });
  
  // Check if workspace exists
  // If not, redirect to onboarding
  // If yes, redirect to top-floor
  
  return NextResponse.redirect(new URL('/top-floor', request.url));
}
```

### Priority 3: Workspace Auto-Creation (1 hour)

**On first login, create workspace:**

```typescript
// In verify route after session created
const userId = session.user.id;

// Check if user has workspace
const workspaces = await prisma.$queryRaw`
  SELECT w.id FROM workspaces w
  JOIN workspace_members wm ON wm.workspace_id = w.id
  WHERE wm.user_id = ${userId}::uuid
`;

if (workspaces.length === 0) {
  // Create workspace
  const workspaceName = `${session.user.email.split('@')[0]}'s Workspace`;
  
  const newWorkspace = await prisma.$queryRaw`
    INSERT INTO workspaces (name, created_by)
    VALUES (${workspaceName}, ${userId}::uuid)
    RETURNING id
  `;
  
  // Add user as owner
  await prisma.$executeRaw`
    INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
    VALUES (${newWorkspace[0].id}::uuid, ${userId}::uuid, 'owner', NOW())
  `;
  
  // Track onboarding
  await prisma.$executeRaw`
    INSERT INTO onboarding_progress (workspace_id, signup_completed_at)
    VALUES (${newWorkspace[0].id}::uuid, NOW())
  `;
  
  return NextResponse.redirect(new URL('/onboarding', request.url));
}
```

### Priority 4: Costs Tab (3 hours)

**`app/stream/[id]/costs/page.tsx`**

```typescript
'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface OutputCost {
  outputName: string;
  outputType: string;
  generationCostUsd: number;
  views: number;
  trustLevel: 'verified' | 'declared' | 'estimated';
  costPerView: number;
  createdAt: string;
}

export default function StreamCostsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [outputs, setOutputs] = useState<OutputCost[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetch(`/api/streams/${id}/costs`)
      .then(res => res.json())
      .then(data => {
        setOutputs(data.outputs || []);
        setLoading(false);
      });
  }, [id]);
  
  if (loading) return <div>Loading...</div>;
  
  if (outputs.length === 0) {
    return (
      <div className="min-h-screen bg-white p-12">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-semibold mb-6">Costs</h1>
          
          {/* Empty state */}
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              No costs tracked yet
            </h3>
            <p className="text-slate-500 mb-6">
              Track generation costs per output (episode, video, Short) to understand your cost per view.
            </p>
            <div className="space-y-3">
              <button className="px-4 py-2 bg-highstreet-purple text-white rounded-lg">
                Connect API key (ElevenLabs, Higgsfield)
              </button>
              <button className="px-4 py-2 border border-slate-300 rounded-lg">
                Import CSV
              </button>
              <button className="px-4 py-2 border border-slate-300 rounded-lg">
                Enter manually
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  const totalCost = outputs.reduce((sum, o) => sum + o.generationCostUsd, 0);
  const totalViews = outputs.reduce((sum, o) => sum + o.views, 0);
  const avgCostPerView = totalViews > 0 ? totalCost / totalViews : 0;
  
  return (
    <div className="min-h-screen bg-white p-12">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">Costs</h1>
        
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 border rounded-lg">
            <div className="text-sm text-slate-500">Total Cost</div>
            <div className="text-2xl font-semibold">${totalCost.toFixed(2)}</div>
          </div>
          <div className="p-4 border rounded-lg">
            <div className="text-sm text-slate-500">Total Views</div>
            <div className="text-2xl font-semibold">{totalViews.toLocaleString()}</div>
          </div>
          <div className="p-4 border rounded-lg">
            <div className="text-sm text-slate-500">Cost per View</div>
            <div className="text-2xl font-semibold">${avgCostPerView.toFixed(3)}</div>
          </div>
        </div>
        
        {/* Outputs table */}
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Output</th>
              <th className="text-right py-2">Cost</th>
              <th className="text-right py-2">Views</th>
              <th className="text-right py-2">$/View</th>
              <th className="text-center py-2">Trust</th>
            </tr>
          </thead>
          <tbody>
            {outputs.map((output, i) => (
              <tr key={i} className="border-b">
                <td className="py-3">
                  <div className="font-medium">{output.outputName}</div>
                  <div className="text-xs text-slate-500">{output.outputType}</div>
                </td>
                <td className="text-right">${output.generationCostUsd.toFixed(2)}</td>
                <td className="text-right">{output.views.toLocaleString()}</td>
                <td className="text-right">${output.costPerView.toFixed(3)}</td>
                <td className="text-center">
                  <span className={`text-xs px-2 py-1 rounded ${
                    output.trustLevel === 'verified' ? 'bg-green-100 text-green-800' :
                    output.trustLevel === 'declared' ? 'bg-blue-100 text-blue-800' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {output.trustLevel}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Priority 5: Rules Tab (1 hour)

Similar empty state structure, deferred for automation.

---

## 📝 Exact Build Order

1. ✅ **Pricing update** (DONE)
2. **Add output_costs table** (apply migration)
3. **Auth sign-up page** + validate-invite API
4. **Auth verify route** + workspace creation
5. **Cost API:** `/api/streams/[id]/costs`
6. **Costs tab** with empty state
7. **Rules tab** with empty state (empty for now)
8. **API key form** for ElevenLabs/Higgsfield
9. **CSV import** for costs
10. **RLS isolation test** (Playwright)
11. **Screenshots**

---

## 🧪 Test Commands

```bash
# Start Postgres
sudo service postgresql start

# Apply new migration
sudo -u postgres psql -d bureau -f supabase/migrations/[new-file].sql

# Start dev
npm run dev

# Test auth flow
# 1. Go to /auth/signup
# 2. Enter email + BUREAU_PILOT_001
# 3. Check console for magic link
# 4. Click link → should create workspace → redirect to /top-floor
```

---

## 📸 Screenshots Needed

1. Sign-up with invite code
2. Magic link in console
3. Costs tab empty state
4. Costs tab with data (Ember: 12 Shorts, $61.86 cost, 212 views)
5. Trust badges (Verified/Declared/Estimated)
6. Cost-per-view on stream card

---

**All database ready. Auth adapter ready. Continue building!** 🚀
