# Bureau Unit Economics

**Version:** 1.0  
**Last Updated:** November 22, 2026  
**Pricing Research Date:** November 22, 2026

All prices verified with source links. No guesses — unknowns marked as **TBD**.

---

## Fixed Platform Costs (Monthly)

### Hosting

**Vercel Pro** (Recommended for Next.js)
- **Cost:** $20/month
- **Includes:** 100GB bandwidth, unlimited deployments
- **Source:** https://vercel.com/pricing
- **As of:** November 2026
- **Free Tier:** Hobby (100GB bandwidth, good for <50 users)
- **Breaks at:** ~50-100 users (bandwidth limit)

**DigitalOcean App Platform** (Alternative)
- **Cost:** $5/month (Basic)
- **Includes:** 512MB RAM, 1GB storage
- **Source:** https://www.digitalocean.com/pricing/app-platform
- **As of:** November 2026
- **Free Tier:** None
- **Breaks at:** N/A (needs Pro $12/mo for 1GB RAM with more users)

**Recommendation:** Vercel free tier → Vercel Pro at 50 users

### Database

**Supabase Free Tier** (Recommended for pilot)
- **Cost:** $0/month
- **Includes:** 500MB database, 1GB bandwidth, 50MB file storage
- **Source:** https://supabase.com/pricing
- **As of:** November 2026
- **Breaks at:** ~50-100 users (500MB limit)

**Supabase Pro**
- **Cost:** $25/month
- **Includes:** 8GB database, 50GB bandwidth, 100GB file storage
- **Source:** https://supabase.com/pricing
- **As of:** November 2026
- **Breaks at:** ~500-1000 users (8GB limit)

**DigitalOcean Managed Postgres** (Alternative)
- **Cost:** $15/month (1GB RAM, 10GB storage)
- **Source:** https://www.digitalocean.com/pricing/managed-databases
- **As of:** November 2026

**Recommendation:** Supabase free → Supabase Pro at 50 users

### Authentication

**Supabase Auth** (Included with database)
- **Cost:** $0 (free tier) or included in Pro
- **Includes:** 50,000 MAU (Monthly Active Users)
- **Source:** https://supabase.com/pricing
- **As of:** November 2026
- **Breaks at:** 50,000 MAU (massive scale)

**Auth.js / NextAuth** (Alternative, self-hosted)
- **Cost:** $0 (self-hosted)
- **Source:** https://authjs.dev
- **As of:** November 2026

**Recommendation:** Supabase Auth (included)

### Email Sending

**Resend Free Tier** (Recommended)
- **Cost:** $0/month
- **Includes:** 3,000 emails/month, 100 emails/day
- **Source:** https://resend.com/pricing
- **As of:** November 2026
- **Breaks at:** 3,000 emails/month

**Resend Pro**
- **Cost:** $20/month
- **Includes:** 50,000 emails/month
- **Source:** https://resend.com/pricing
- **As of:** November 2026

**AWS SES** (Alternative)
- **Cost:** $0.10 per 1,000 emails
- **Source:** https://aws.amazon.com/ses/pricing/
- **As of:** November 2026

**Email Volume Estimates:**
- Magic link sign-in: 1 email
- Weekly review reminder: 1 email/week/user
- Monthly: ~4-5 emails/user/month

**Recommendation:** Resend free (pilot) → Resend Pro at ~600 users

### Domain + SSL

**Domain Registration**
- **Cost:** $12/year for .market domain
- **Source:** Namecheap, Cloudflare Registrar
- **As of:** November 2026
- **Monthly:** $1/month

**SSL Certificate**
- **Cost:** $0 (included with Vercel/DO/Cloudflare)
- **Source:** Let's Encrypt via hosting provider
- **As of:** November 2026

### Monitoring

**Sentry Error Tracking** (Optional)
- **Cost:** $0 (free tier) for 5,000 events/month
- **Source:** https://sentry.io/pricing/
- **As of:** November 2026
- **Breaks at:** 5,000 errors/month
- **Alternative:** In-DB error logging ($0, included)

**Recommendation:** In-DB logging (free, built-in)

### Cron Jobs

**Vercel Cron** (Included)
- **Cost:** $0 (included with hosting)
- **Source:** Vercel Serverless Functions
- **As of:** November 2026

**Upstash QStash** (Alternative)
- **Cost:** $0 for 500 messages/day
- **Source:** https://upstash.com/pricing/qstash
- **As of:** November 2026

**Recommendation:** Vercel Cron (free, included)

---

## Fixed Platform Total

| Tier | Users | Hosting | Database | Email | Domain | Total/Month |
|------|-------|---------|----------|-------|--------|-------------|
| **Free** | 0-50 | $0 (Vercel free) | $0 (Supabase free) | $0 (Resend free) | $1 | **$1/mo** |
| **Pilot** | 50-500 | $20 (Vercel Pro) | $25 (Supabase Pro) | $20 (Resend Pro) | $1 | **$66/mo** |
| **Growth** | 500-5000 | $20 (Vercel Pro) | $25 (Supabase Pro) | $20 (Resend Pro) | $1 | **$66/mo** |

---

## Optional Paid Providers

### X (Twitter) API

**X API Basic Tier** (Required for read access)
- **Cost:** $100/month
- **Includes:** 10,000 tweets/month, read-only
- **Source:** https://developer.x.com/en/portal/products/basic
- **As of:** November 2026
- **Note:** ⚠️ Required for any X data access (no free tier)

**Alternative:** Manual entry or agent intake (free)

### OpenAI API

**OpenAI API Usage** (For findings generation)
- **Cost:** $0.03 per 1K tokens (GPT-4o-mini input)
- **Cost:** $0.12 per 1K tokens (GPT-4o-mini output)
- **Source:** https://openai.com/api/pricing/
- **As of:** November 2026

**Usage estimates:**
- Weekly review generation: ~2K input + 500 output tokens
- Cost per review: $0.06 input + $0.06 output = **$0.12/review**
- Monthly (4 reviews/user): **$0.48/user/month**

**Alternative:** Rules-based findings (no LLM) or user-written reviews

### Anthropic Claude API

**Claude API** (Alternative for findings)
- **Cost:** $3.00 per 1M tokens (Claude 3.5 Haiku input)
- **Cost:** $15.00 per 1M tokens (Claude 3.5 Haiku output)
- **Source:** https://www.anthropic.com/pricing
- **As of:** November 2026

**Usage estimates:**
- Weekly review: ~2K input + 500 output tokens
- Cost per review: $0.006 input + $0.0075 output = **$0.0135/review**
- Monthly (4 reviews/user): **$0.054/user/month**

**Recommendation:** Claude 3.5 Haiku (4x cheaper than GPT-4o-mini)

### GitHub API

**GitHub REST API**
- **Cost:** $0 (free for authenticated requests)
- **Rate limit:** 5,000 requests/hour per user
- **Source:** https://docs.github.com/en/rest/overview/rate-limits
- **As of:** November 2026

### Google YouTube Analytics API

**YouTube Data API v3**
- **Cost:** $0 (free)
- **Quota:** 10,000 units/day per project
- **Source:** https://developers.google.com/youtube/v3/getting-started
- **As of:** November 2026
- **Note:** May need quota increase for >100 users

### Stripe API

**Stripe API**
- **Cost:** $0 (free)
- **Source:** https://stripe.com/docs/api
- **As of:** November 2026

---

## Per-User Variable Costs

### Database Storage

**Supabase Postgres Storage**
- **Free tier:** 500MB
- **Pro tier:** 8GB included
- **Overage:** $0.125 per GB/month
- **Source:** https://supabase.com/pricing
- **As of:** November 2026

**Per-user storage estimate:**
- Workspace: 1KB
- Streams (4 avg): 4KB
- Metric values (1,000 data points): 50KB
- Connections (3 avg): 3KB
- Weekly reviews (52/year): 26KB
- **Total per user:** ~84KB

**At scale:**
- 5,000 users × 84KB = 420MB (within free tier)
- Storage cost: **$0** up to 5,000 users

### Database Rows

**Supabase Free Tier**
- **Unlimited rows** (limited by storage only)
- **Source:** https://supabase.com/pricing
- **As of:** November 2026

**Row count estimate per user:**
- Workspace: 1
- Streams: 4
- Metric values: 1,000+
- Connections: 3
- Weekly reviews: 52/year
- **Total:** ~1,060 rows/year per user

**At scale:**
- 5,000 users × 1,060 rows = 5.3M rows
- **Cost:** $0 (unlimited rows)

### Sync API Calls

**GitHub API Sync** (per connection)
- **Frequency:** Every 4 hours (6x/day)
- **Calls per sync:** 3-5 API requests
- **Daily:** 18-30 calls per user with GitHub connected
- **Monthly:** 540-900 calls per user
- **Cost:** $0 (free, within rate limits)

**X API Sync** (if enabled)
- **Frequency:** Every 4 hours (6x/day)
- **Calls per sync:** 2-3 API requests
- **Daily:** 12-18 calls
- **Monthly:** 360-540 calls
- **Cost:** Included in $100/mo Basic tier

**YouTube API Sync** (per connection)
- **Frequency:** Every 24 hours (1x/day)
- **Calls per sync:** 50 quota units
- **Daily:** 50 units
- **Monthly:** 1,500 units
- **Quota:** 10,000 units/day (supports ~200 concurrent users)
- **Cost:** $0 (free, may need quota increase)

### LLM Calls for Findings

**Weekly Review Generation** (using Claude 3.5 Haiku)
- **Input:** Stream metrics + history (2,000 tokens)
- **Output:** 2 moves with reasoning (500 tokens)
- **Cost per review:** $0.0135
- **Reviews per user per month:** 4
- **Monthly cost per user:** $0.054

**First Finding Generation** (onboarding)
- **Input:** Initial metrics (500 tokens)
- **Output:** Finding (200 tokens)
- **Cost per user:** $0.0045 (one-time)

**Total LLM cost per user per month:** $0.054

### Email Sends

**Magic Links** (sign-in)
- **Frequency:** 2-4 times/month average
- **Cost:** Included in Resend free/Pro

**Weekly Review Reminders**
- **Frequency:** 4/month
- **Cost:** Included in Resend free/Pro

**Total emails per user:** ~6-8/month
- **At 5,000 users:** 30,000-40,000 emails/month
- **Resend Pro includes:** 50,000/month
- **Cost:** Included

---

## Variable Cost Summary (Per User Per Month)

| Cost Item | Amount | Notes |
|-----------|--------|-------|
| Database storage | $0 | Within free limits up to 5K users |
| Database rows | $0 | Unlimited |
| Sync API calls | $0 | Free APIs (GitHub, YouTube, Stripe) |
| LLM (weekly reviews) | $0.054 | Claude 3.5 Haiku, 4 reviews/month |
| Email sends | $0 | Included in Resend Pro |
| **Total Variable** | **$0.054** | **~5.4¢ per user per month** |

---

## Cost per User at Scale

### Scenario 1: 5 Users (Pilot)

**Fixed costs:** $1/month (domain only, free tiers)
- Vercel free tier
- Supabase free tier
- Resend free tier

**Variable costs:** 5 × $0.054 = $0.27/month

**Total:** $1.27/month
**Per user:** $0.25/month

### Scenario 2: 50 Users (Early Pilot)

**Fixed costs:** $66/month
- Vercel Pro: $20
- Supabase Pro: $25
- Resend Pro: $20
- Domain: $1

**Variable costs:** 50 × $0.054 = $2.70/month

**Total:** $68.70/month
**Per user:** $1.37/month

### Scenario 3: 500 Users (Growth)

**Fixed costs:** $66/month (same as 50 users)

**Variable costs:** 500 × $0.054 = $27/month

**Total:** $93/month
**Per user:** $0.19/month

### Scenario 4: 5,000 Users (Scale)

**Fixed costs:** $66/month (same, may need DB upgrade)

**Variable costs:** 5,000 × $0.054 = $270/month

**Total:** $336/month
**Per user:** $0.067/month (~6.7¢)

**Note:** May need Supabase Team tier ($599/mo) at this scale for performance

---

## Pricing Tiers (Updated)

**Free Tier:**
- 2 streams maximum
- Manual/CSV entry only
- Cost ledger included
- No automated sync

**Plus Tier:**
- **Price:** $9/month or $79/year ($6.58/mo effective)
- Unlimited streams
- API connectors (ElevenLabs, Higgsfield, YouTube)
- Automated sync every 4 hours
- Weekly reviews with LLM-powered findings

**LLM Cost Inclusion:**
- ✅ **LLM calls ARE included** in per-user variable cost ($0.054/user/month)
- Uses Claude 3.5 Haiku for weekly reviews and first findings
- **Token estimates per user per month:**
  - Weekly reviews: 4 reviews × (2,000 input + 500 output) = 10,000 tokens
  - First finding: 500 input + 200 output = 700 tokens (one-time)
  - **Monthly total:** ~10,700 tokens = $0.054
- Free tier: No LLM calls (users write their own reviews)
- Plus tier: LLM calls included in price

## Gross Margin Analysis at $9/month

### Assumptions

- **Price:** $9/user/month (Plus tier)
- **Target margin:** 70%+ (acceptable for lower price point)
- **LLM costs:** Claude 3.5 Haiku (INCLUDED in variable cost)
- **No X API** (requires separate paid add-on)

### Margin by Scale (Plus Tier at $9/month)

| Users | Revenue/mo | Fixed Costs | Variable Costs (incl. LLM) | Total Costs | Profit | Margin |
|-------|------------|-------------|---------------------------|-------------|--------|--------|
| 5 | $45 | $1 | $0.27 | $1.27 | $43.73 | **97.2%** |
| 50 | $450 | $66 | $2.70 | $68.70 | $381.30 | **84.7%** |
| 500 | $4,500 | $66 | $27 | $93 | $4,407 | **98.0%** |
| 5,000 | $45,000 | $66 | $270 | $336 | $44,664 | **99.3%** |

**Conclusion:** Strong unit economics at lower price point. Variable costs (including LLM) are $0.054/user. Margin improves with scale from 85% → 99%.

### Break-Even Analysis

**At $9/month (Plus tier):**
- **Free tier (0-50 users):** Break-even at 1 user ($9 > $1 fixed costs)
- **Pro tier (50+ users):** Break-even at 8 users ($72 revenue > $66 fixed costs)
- **Low risk:** Need only 8 paying users to cover all platform costs

**Annual pricing ($79/year):**
- Effective $6.58/month
- 10 annual subscribers = $790/year = $65.83/month (covers Pro tier costs)
- **Incentive:** 2 free months for annual commitment

### Cost Scaling Analysis

**Costs that scale linearly:**
- ✅ LLM calls ($0.054/user) — scales perfectly
- ✅ Database storage ($0/user up to 5K users, then $0.125/GB)
- ✅ Email (included up to 50K emails/month)

**Costs that don't scale (fixed):**
- ✅ Hosting ($20/mo for 50-5000 users)
- ✅ Database ($25/mo for 50-1000 users)
- ✅ Email ($20/mo for 50-1000 users)

**Risk points:**
- YouTube API quota (10K units/day supports ~200 users, need increase)
- Supabase storage (500MB free supports ~5K users)
- Database performance (may need Team tier at 5K users)

---

## Optional Add-Ons Impact

### With X API Integration ($100/month)

| Users | Base Costs | + X API | Total | Per User | Impact |
|-------|-----------|---------|-------|----------|--------|
| 5 | $1.27 | +$100 | $101.27 | $20.25 | 🔴 Not viable |
| 50 | $68.70 | +$100 | $168.70 | $3.37 | ⚠️ Breaks margins |
| 500 | $93 | +$100 | $193 | $0.39 | ✅ Acceptable |
| 5,000 | $336 | +$100 | $436 | $0.09 | ✅ Negligible |

**Conclusion:** X API only viable at 500+ users, or as premium add-on ($10/mo extra)

### With Premium LLM (GPT-4o instead of Haiku)

**GPT-4o pricing:**
- Input: $0.03/1K tokens
- Output: $0.12/1K tokens
- Cost per review: $0.12 (vs $0.0135 for Haiku)
- **9x more expensive**

**Impact at 500 users:**
- Variable cost increases from $27 to $240/month (+$213)
- Per-user cost: $0.19 → $0.67
- Still 98% margin

---

## TBD / Unknown Costs

### Payment Processing (Future)

**Stripe Payment Processing**
- **Cost:** 2.9% + $0.30 per transaction
- **On $39/month:** $1.43 per transaction
- **Effective price to Bureau:** $37.57
- **Impact on margin:** Negligible (3.7% reduction)
- **Source:** https://stripe.com/pricing
- **As of:** November 2026
- **Status:** Not yet implemented

### CDN / Asset Hosting (Future)

**Cloudflare CDN**
- **Cost:** $0 (free tier) for <1TB bandwidth
- **Source:** https://www.cloudflare.com/plans/
- **As of:** November 2026
- **Status:** May be needed for media-heavy streams

### Backup Storage (Future)

**Supabase Database Backups**
- **Cost:** Included in Pro tier (daily automated backups)
- **Source:** https://supabase.com/pricing
- **As of:** November 2026

### Support Tools (Future)

**Intercom / Help Scout**
- **Cost:** TBD (not planned for pilot)
- **Status:** Using in-app feedback button initially

---

## Free Tier Limits Summary

| Service | Free Limit | Breaks At | Upgrade Cost |
|---------|-----------|-----------|--------------|
| **Vercel bandwidth** | 100GB/mo | ~50-100 users | +$20/mo (Pro) |
| **Supabase DB** | 500MB | ~100 users | +$25/mo (Pro) |
| **Supabase DB (Pro)** | 8GB | ~1,000 users | +$534/mo (Team) |
| **Resend emails** | 3,000/mo | ~600 users | +$20/mo (Pro) |
| **Supabase Auth** | 50K MAU | 50,000 users | N/A (massive scale) |
| **YouTube quota** | 10K units/day | ~200 users | Request increase (free) |

---

## Recommendations

### For Pilot (5-50 users)

**Use free tiers for everything:**
- Vercel free
- Supabase free
- Resend free
- **Total:** $1/month (domain)

**Don't enable:**
- ❌ X API ($100/mo not viable)
- Use agent intake or manual entry instead

### For Growth (50-500 users)

**Upgrade to Pro tiers:**
- Vercel Pro: $20
- Supabase Pro: $25
- Resend Pro: $20
- **Total:** $66/month fixed

**Enable LLM findings:**
- Claude 3.5 Haiku: $0.054/user
- **At 500 users:** +$27/month variable

**Consider X API:**
- Only if >100 users want X integration
- Or offer as premium add-on (+$10/mo per user)

### For Scale (500-5,000 users)

**Same platform costs:** $66/month fixed

**Watch for:**
- YouTube API quota (request increase at 200 users)
- Database performance (may need Team tier at 2K+ users)
- Support load (may need help desk tool)

**Margin stays >99%** even at scale

---

## Sources & Verification

All pricing verified as of November 22, 2026:

1. **Vercel:** https://vercel.com/pricing
2. **Supabase:** https://supabase.com/pricing
3. **Resend:** https://resend.com/pricing
4. **AWS SES:** https://aws.amazon.com/ses/pricing/
5. **X API:** https://developer.x.com/en/portal/products/basic
6. **OpenAI:** https://openai.com/api/pricing/
7. **Anthropic:** https://www.anthropic.com/pricing
8. **GitHub API:** https://docs.github.com/en/rest/overview/rate-limits
9. **YouTube API:** https://developers.google.com/youtube/v3/getting-started
10. **Stripe:** https://stripe.com/pricing
11. **DigitalOcean:** https://www.digitalocean.com/pricing

---

## Cost-Per-Output Focus (New Priority)

**Lead wedge:** Cost-per-output P&L for AI-made content

### Cost Ledger Architecture

**Per-output tracking:**
- Each output (episode, video, Short) gets own cost record
- Generation costs: ElevenLabs characters, Higgsfield credits, failed renders
- Linked to views, subscribers, revenue
- Trust badges: Verified (API), Declared (manual), Estimated (formula)

**Example: YouTube Shorts for Ember stream**
- Ep12 Short: $30.93 cost → 49 views = $0.63/view
- "Too Many Trees": TBD cost → 34 views = TBD/view
- **Key metric:** Cost per 1K views, cost per subscriber

**Data sources:**
- ✅ ElevenLabs API (read usage, map to outputs)
- ✅ Higgsfield API (read credits, map to outputs)
- ✅ YouTube OAuth (views, watch time, revenue if monetized)
- ✅ Manual CSV import (for missing data)

**UI:**
- Cost-per-piece on stream detail
- Top Floor shows: "212 views, $61.86 cost = $0.29/view" (Ember)
- Failed renders tracked but not shown to public

This is the FREE tier value prop: manual cost ledger with CSV import.

---

**Summary:** Bureau has strong unit economics at $9/month. Variable costs (including LLM) are ~5.4¢ per user per month. Gross margin is 85-99% depending on scale. Main risks are YouTube API quotas and database performance at 1K+ users, both manageable. Free tier (2 streams, manual cost ledger) drives lead generation; Plus tier ($9/mo) monetizes with API automation.
