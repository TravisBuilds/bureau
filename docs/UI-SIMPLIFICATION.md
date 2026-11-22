# UI Simplification

Per Travis's feedback on 2026-11-22 at 3:34 AM:

## Key Principles Applied

1. **Manual entry is first-class** - Not a buried fallback, but presented equally alongside agent connection
2. **Clean UI over feature count** - This is THE priority
3. **One clear purpose per screen** - No multi-purpose dashboards
4. **Very few numbers at top level** - Detail one click away
5. **No clutter** - No walls of badges, emoji, or nested cards
6. **Generous whitespace** - Breathing room between elements
7. **Consistent components** - Standard patterns throughout

## Changes Made

### 1. TopFloorSimple Component

**Location**: `components/TopFloorSimple.tsx`

**Purpose**: Clean command center view with minimal numbers

**Features**:
- **Top overview**: Only 3 numbers (monthly income, costs, net)
- **Can I quit analysis**: Shows only if monthly need is set
- **Simple stream list**: Name, type, status, signal - detail is on stream pages
- **No clutter**: Removed time budgets, priority lists, action cards, project breakdowns
- **Clean hierarchy**: Clear visual separation between sections

**Before**: PortfolioHome had ~230 lines with time budgets, next actions list with reasoning/costs/blockers, nested cards

**After**: TopFloorSimple has ~200 lines, mostly whitespace and clean layout

### 2. StreamDataEntry Component

**Location**: `components/StreamDataEntry.tsx`

**Purpose**: Equal-weight choice between agent connection and manual entry

**Flow**:
1. **Choice screen**: Two equal options
   - "Connect an Agent" - Let agent populate automatically
   - "Enter Manually" - Fill in details yourself
2. **Agent mode**: Clean connection flow
3. **Manual mode**: Simple forms per stream type

**Forms**:
- **Day Job**: Employer, role, pay type, salary/hourly rate, hours
- **Contract**: Client name, hourly rate, monthly hours
- **Project**: Name, description, monthly income/costs

**Design**:
- Large, clear option cards with icons
- No bias toward one option over the other
- Clean back navigation
- Consistent Highstreet purple accent
- Generous spacing

### 3. Build Validation

**Location**: `tests/build.test.ts`, `app/stream/[id]/page.tsx`

**Changes**:
- Fixed dynamic route build errors
- Added `generateStaticParams` for known streams
- Build test ensures pages don't break before shipping
- All 83 tests passing

## What Was Removed

From the cluttered PortfolioHome:
- ⏱️ Founder Time Budget section with breakdown by project
- 🎯 What to Do Next section with:
  - Priority rankings (#1, #2, #3...)
  - Reasoning text
  - Cost of waiting
  - Blocked metrics
  - Collapsible agent task briefs
  - Copy-to-clipboard buttons
- Project cards with:
  - Verdict text
  - Signal badges
  - Last report dates
  - Multiple status indicators

## What Was Kept (But Simplified)

- **Stream list**: Name, type, one-line status, signal
- **Top numbers**: Income, costs, net (3 total)
- **Can I quit**: Only shown if founder set monthly need
- **Clear CTAs**: "Add Stream", "Set monthly need"

## Typography & Spacing

- **Headers**: 2xl for page titles, sm for section labels
- **Numbers**: 4xl for top metrics, 2xl for analysis
- **Body**: sm for descriptions, medium for labels
- **Spacing**: Consistent 6-12 units between sections
- **Containers**: max-w-5xl for readability

## Colors (Highstreet Branding)

- **Primary**: `highstreet-purple` (#6253F1)
- **Accent**: `highstreet-cyan` (#00f2fe)
- **Neutral**: slate-50 to slate-900 scale
- **Signals**:
  - Push: green-600
  - Keep: blue-600
  - Pause: yellow-600
  - Kill: red-600

## Icons

Using `lucide-react` for clean, consistent iconography:
- `Building2` for Bureau/top floor
- `Bot` for agent connection
- `Edit3` for manual entry
- `Plus` for add actions

## Next Steps

If these components are approved, they should replace:
- Current portfolio home page
- Current stream data entry flows
- Current connection pages

All new screens should follow these principles:
1. Start with the absolute minimum
2. Add detail behind clicks, not up-front
3. Generous whitespace over dense information
4. Manual and automated options as equals
5. Review every screen for clutter before shipping
