# Admin Page

**Route**: `/admin`  
**Status**: ✅ Implemented (Minimal)  
**Access**: Workspace owners and admins

---

## Overview

Minimal admin interface for workspace management:
- **Members**: View and manage workspace members
- **Tokens**: View, mask, and revoke ingest tokens
- **Audit Log**: Track workspace activity

---

## Features

### 1. Members Tab
- **View**: Email, role (owner/member), joined date
- **Actions**: Remove members (non-owners), invite new members
- **Display**: Table with PT timestamps

### 2. Tokens Tab
- **View**: Token name, masked token (`bureau_••••last4`), created/last-used
- **Masking**: Full token only shown on creation (see `/settings/connect-agent`)
- **Actions**: Revoke token (with confirmation)
- **PT Timestamps**: Created and last-used dates

### 3. Audit Log Tab
- **Events**: 
  - `auth.login` - User login
  - `ingest.created` - Token creation
  - `output.created` - Data ingested
  - `token.revoked` - Token revoked
- **Data**: Timestamp (PT), action code, user, details, status (success/error)
- **Display**: Recent activity, reverse chronological

---

## Security

### Token Masking
- Full token shown only on creation (30 seconds)
- Admin page shows `bureau_••••last4`
- No full token exposure in logs or admin UI

### Revocation
- Confirmation required: "Revoke this token? This cannot be undone."
- Immediate effect (token invalidated)
- Logged in audit trail

### Access Control
- Owner-only actions: Revoke tokens, remove members
- Member actions: View only
- RLS enforced at database level

---

## Data Model

### Members
```typescript
interface WorkspaceMember {
  id: string;
  email: string;
  role: 'owner' | 'member';
  joinedAt: string; // ISO 8601
}
```

### Tokens
```typescript
interface IngestToken {
  id: string;
  name: string;
  token: string; // Masked: bureau_••••last4
  createdAt: string;
  lastUsedAt: string | null;
}
```

### Audit Log
```typescript
interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string; // e.g. 'token.revoked'
  user: string; // Email or 'api.ingest'
  details: string; // Human-readable
  status: 'success' | 'error';
}
```

---

## UI Components

### Tab Navigation
- 3 tabs with counts: "Members (1)", "Tokens (1)", "Audit Log (3)"
- Active tab: Blue underline
- Hover states on inactive tabs

### Tables
- Responsive overflow-x-auto
- Gray header rows
- Hover states on action buttons
- Consistent column widths

### Action Buttons
- Primary: Blue (Create Token, Invite Member)
- Danger: Red (Revoke, Remove)
- Confirmation dialogs for destructive actions

---

## Future Enhancements

### Phase 1: Database Integration
- Replace demo data with real database queries
- Implement revoke token endpoint
- Add invite member flow

### Phase 2: Advanced Filtering
- Filter audit log by action type
- Date range selection
- Export audit log to CSV

### Phase 3: Advanced Features
- Member permissions (read/write/admin)
- Token scoping (which streams can be ingested)
- Usage analytics per token

---

## Development

### Demo Data
Current implementation uses hardcoded example data:
- 1 member (Travis, owner)
- 1 token (Production Ingest)
- 3 audit log entries

### Production Integration
Replace `useState` initial data with API calls:

```typescript
useEffect(() => {
  fetch('/api/admin/members').then(r => r.json()).then(setMembers);
  fetch('/api/admin/tokens').then(r => r.json()).then(setTokens);
  fetch('/api/admin/audit').then(r => r.json()).then(setAuditLog);
}, []);
```

---

## Testing

### Manual Test
```bash
npm run dev
# Visit http://localhost:3000/admin

# Should show:
# - 3 tabs (Members, Tokens, Audit Log)
# - Demo data in each tab
# - PT timestamps
# - Masked tokens
# - Action buttons (Revoke, Remove, etc.)
```

### E2E Test (future)
```typescript
test('admin page - revoke token', async ({ page }) => {
  await page.goto('/admin');
  
  // Switch to tokens tab
  await page.click('text=Tokens');
  
  // Should show masked token
  await expect(page.locator('code:has-text("bureau_••••")')).toBeVisible();
  
  // Revoke token
  await page.click('button:has-text("Revoke")');
  await page.click('button:has-text("OK")'); // Confirm
  
  // Token should be removed
  await expect(page.locator('text=Production Ingest')).not.toBeVisible();
});
```

---

## Summary

**Current State**: ✅ Minimal admin UI complete  
**Features**: Members, tokens (masked), audit log  
**Next Step**: Database integration for real data

**Last Updated**: November 22, 2026 6:36 AM UTC
