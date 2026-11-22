# Weekly Review - Rule-Based Decision Support

**Route**: `/weekly-review`  
**Status**: ✅ Implemented (Rule-Based)  
**LLM Mode**: ❌ Disabled by default (requires approval + env vars)

---

## Overview

The weekly review helps creators make strategic decisions about their content by:
1. Reviewing last week's prediction vs actual outcome
2. Stating the current objective and constraint
3. Presenting 2 feasible moves with reasoning
4. Recording the chosen move for next week's review

**Current Implementation**: Deterministic rule-based logic (no AI, no API calls)

---

## Rule-Based Review Logic

### Inputs (from database):
- Recent output costs and views
- Current weekly budget
- Last week's prediction and actual outcome

### Outputs (deterministic):
- **Objective**: Clear, measurable goal (e.g. "Increase views by 20%")
- **Constraint**: Budget or time limitation (e.g. "$50/week budget")
- **2 Moves**: Specific, feasible actions with cost estimates
- **Last Prediction Review**: Was it correct? What actually happened?

### Example Review:

```
Week ending: November 23, 2026

LAST WEEK'S PREDICTION
Prediction: Ep12 would reach 40+ views within 48 hours
Actual: Ep12 reached 49 views ✓ CORRECT

CURRENT OBJECTIVE
Increase Ember episode views by 20% within 3 episodes

CONSTRAINT
Weekly generation budget: $50 (current burn: $30.93/episode)

FEASIBLE MOVES
1. Experiment with 90-second format (vs current 60s)
   ✓ Feasible - Fits within $50 budget; Ep12 cost $30.93, 90s would be ~$46

2. Test thumbnail A/B variations using Higgsfield stills
   ✓ Feasible - Minimal cost increase ($5-8 for variants); high potential impact

[User chooses one move]
✓ Move recorded - Next week's review will assess the outcome
```

---

## LLM Mode (Disabled)

### Why Disabled?
**Travis Wu has NOT approved paid API spend for LLM calls.**

The LLM-powered version would:
- Analyze historical patterns with Claude/GPT
- Generate contextual insights from recent performance
- Suggest moves based on what worked before
- Cost ~$0.01-0.05 per review (depending on context size)

### How to Enable (Future)

**Requirements**:
1. ✅ Travis Wu approval for API spend
2. ✅ BUREAU_ENABLE_LLM_REVIEW=true
3. ✅ ANTHROPIC_API_KEY or OPENAI_API_KEY set

**Add to `.env`**:
```bash
# LLM Review (DISABLED BY DEFAULT - requires approval)
BUREAU_ENABLE_LLM_REVIEW=false

# API Keys (DO NOT SET without approval)
# ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-proj-...
```

**Implementation Status**:
- ✅ Feature flag infrastructure
- ✅ Config validation
- ❌ LLM API calls (intentionally NOT implemented)
- ✅ Fallback to rule-based logic

**File**: `lib/weekly-review-llm.ts`  
**Current behavior**: Throws error if called (not approved for paid spend)

---

## UI Flow

1. **Load Review** - Rule-based logic generates review from real data
2. **Review Last Prediction** - Shows prediction vs actual with ✓/✗ status
3. **Read Objective & Constraint** - Clear context for decision
4. **Choose a Move** - Select from 2 feasible options
5. **Record Choice** - Saved for next week's review

**Visual State**:
- Chosen move gets blue highlight
- Confirmation shown: "Move recorded"
- Other moves disabled after choice

---

## Data Flow

### Read Operations (from database):
```sql
-- Recent outputs with costs and views
SELECT output_name, generation_cost_usd, views, published_at
FROM output_costs
WHERE stream_id = ? AND published_at > NOW() - INTERVAL '30 days'
ORDER BY published_at DESC LIMIT 10;

-- Last week's choice (future implementation)
SELECT chosen_move, prediction, week_ending
FROM weekly_reviews
WHERE workspace_id = ?
ORDER BY week_ending DESC LIMIT 1;
```

### Write Operations:
```sql
-- Record this week's choice (future implementation)
INSERT INTO weekly_reviews (
  workspace_id, week_ending,
  objective, constraint_text,
  chosen_move, prediction
) VALUES (?, ?, ?, ?, ?, ?);
```

**Note**: Table `weekly_reviews` not yet created. Current implementation is demo-only.

---

## Development vs Production

### Development (Current)
- ✅ Hardcoded example data
- ✅ No database writes
- ✅ No API calls
- ✅ $0 cost per review

### Production (Future)
- Read real data from output_costs
- Write choices to weekly_reviews table
- Optional LLM insights (behind feature flag)
- Cost: $0 (rule-based) or ~$0.01-0.05 (LLM)

---

## Testing

### Manual Test:
```bash
npm run dev
# Visit http://localhost:3000/weekly-review
# Should show:
# - "Rule-Based Review (No LLM)" badge
# - Last week's prediction (example data)
# - Current objective and constraint
# - 2 feasible moves
# - Choose button (records choice)
```

### E2E Test (future):
```typescript
test('weekly review flow', async ({ page }) => {
  await page.goto('/weekly-review');
  
  // Should show rule-based badge
  await expect(page.locator('text=Rule-Based Review')).toBeVisible();
  
  // Should show last prediction
  await expect(page.locator('text=Last Week\'s Prediction')).toBeVisible();
  
  // Should show 2 moves
  const moves = page.locator('[data-testid="move"]');
  await expect(moves).toHaveCount(2);
  
  // Should be able to choose a move
  await moves.first().locator('button:has-text("Choose")').click();
  await expect(page.locator('text=Move Recorded')).toBeVisible();
});
```

---

## Security & Compliance

### Data Privacy
- ✅ No external API calls (rule-based mode)
- ✅ All data stays in user's workspace
- ✅ No third-party services

### Cost Controls
- ✅ LLM disabled by default
- ✅ Explicit opt-in required (env var + API key)
- ✅ No surprise charges
- ✅ Transparent about API usage

### Approval Required
Before enabling LLM mode:
1. ✅ Travis Wu approves budget
2. ✅ User opts in via settings
3. ✅ API keys configured
4. ✅ Cost estimates shown before each call

---

## Future Enhancements

### Phase 1: Database Integration
- Create weekly_reviews table
- Read real output data for context
- Write user choices for tracking

### Phase 2: LLM Mode (Approval Required)
- Implement Claude API integration
- Add cost estimation UI
- Require explicit user consent per review
- Show "Estimated cost: $0.03" before generating

### Phase 3: Learning Loop
- Track prediction accuracy over time
- Surface which moves worked best
- Build historical pattern library

---

## Summary

**Current State**: ✅ Fully functional rule-based review  
**LLM Mode**: ❌ Disabled (no approval for paid spend)  
**Cost**: $0 per review (no API calls)  
**Next Step**: Database integration for real data

**Last Updated**: November 22, 2026 6:36 AM UTC
