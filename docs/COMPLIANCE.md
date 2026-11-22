# Bureau Micro-Funding: Compliance & Legal Notes

## ⚠️ PROTOTYPE STATUS

**This is a prototype only. No real money, not an offer of securities.**

The micro-funding features in Bureau are built to demonstrate the technical architecture and user experience for a future feature. They are explicitly marked as prototypes throughout the UI with prominent banners.

## What Would Be Required for Real Implementation

### United States

**Securities Regulations:**

1. **Regulation Crowdfunding (Reg CF)**
   - Allows companies to raise up to $5M in a 12-month period
   - Investors can invest limited amounts based on income/net worth
   - Requires using a registered broker-dealer or funding portal
   - Annual reporting requirements to investors
   - Financial disclosure requirements

2. **Regulation A (Reg A+)**
   - Tier 1: Up to $20M in 12 months
   - Tier 2: Up to $75M in 12 months
   - More extensive disclosure requirements
   - SEC qualification process

3. **Rule 506(b) and 506(c) - Accredited Investors Only**
   - No dollar limit
   - Only accredited investors can participate
   - Requires investor accreditation verification

**Key Compliance Requirements:**
- Registration with SEC or state securities regulators
- Use of registered intermediaries (broker-dealers or funding portals)
- Annual reports to investors
- Financial statement audits (depending on amount raised)
- Investor education materials
- Bad actor disqualification checks
- Advertising restrictions

### Canada

**Provincial Crowdfunding Rules:**

Each province has its own crowdfunding regulations. Key examples:

1. **Ontario - Crowdfunding Prospectus Exemption**
   - Maximum $1.5M raise per 12 months
   - Maximum $2,500 investment per investor per offering
   - Must use registered funding portal
   - Ongoing reporting requirements

2. **British Columbia - Start-up Crowdfunding**
   - Maximum $1.5M raise per 12 months
   - Investment limits based on investor type
   - Portal registration required

3. **Other Provinces**
   - Similar frameworks with variations
   - Some provinces have more restrictive rules

**Key Compliance Requirements:**
- Portal registration in each province of operation
- Investor limits and suitability assessments
- Disclosure documents
- Risk acknowledgment from investors
- Ongoing reporting

### Revenue Share vs. Equity

**Revenue Share Agreements:**
- May be classified as securities in some jurisdictions
- Less regulated than equity in some cases
- Still requires compliance with applicable securities laws
- Contract law governs the terms

**Equity:**
- Always classified as securities
- Full securities regulations apply
- More extensive disclosure and ongoing reporting

**Profit-Sharing/Dividend Agreements:**
- Classification depends on structure
- May be treated as securities if returns are from others' efforts
- Howey Test (US) determines if something is a security

### Tax Implications

**For Business Owners:**
- Revenue share payments may be deductible expenses
- Equity dilution has tax consequences
- Must issue proper tax forms to investors (1099-DIV, etc.)

**For Investors:**
- Revenue share payments taxed as ordinary income
- Dividends may qualify for preferential tax treatment
- Capital gains on equity sales
- Must track basis and returns

### Consumer Protection

**Anti-Fraud Provisions:**
- All statements must be truthful and not misleading
- Material information must be disclosed
- Projections must be clearly labeled as such
- Track record must be verifiable

**Data Privacy:**
- GDPR compliance (if EU investors)
- CCPA compliance (if California residents)
- PII protection requirements
- Right to deletion/correction

### Technical Requirements

**Auditable Record:**
- Bureau's append-only audit trail meets this requirement
- Every financial entry has source and timestamp
- Corrections are tracked, not deleted
- Public views read only from verified data

**Payment Processing:**
- Must use licensed payment processors
- Escrow requirements for fund collection
- Automated payout systems must be auditable
- Bank/fintech partnerships required

**KYC/AML:**
- Know Your Customer verification
- Anti-Money Laundering checks
- Sanctions screening
- Beneficial ownership tracking

## What Bureau Has Built (Technical Foundation)

✅ **Auditable Operating Record**
- Append-only trail per stream
- Source attribution on every entry
- Immutable history
- Correction tracking

✅ **Share Settings**
- Per-stream visibility controls
- Per-field granular sharing
- Private by default
- Public view reads only from audit trail

✅ **Track Record Display**
- Monthly revenue/costs with sources
- Decision history
- Growth trends
- Freshness tracking

✅ **Offer Structure**
- Revenue share terms
- Minimum ticket amounts
- Target amounts
- Use of funds breakdown

✅ **Payout Calculator**
- Projection based on historical trends
- Clearly labeled as "projection, not promise"
- Monthly breakdown
- Cap enforcement

✅ **Investor Portfolio View**
- Commitment tracking
- Simulated payout history
- Progress to cap
- Return calculations

## What's Missing (For Real Implementation)

❌ **Legal Entity Structure**
- SPV (Special Purpose Vehicle) per offering
- Operating agreements
- Cap table management

❌ **Securities Registration**
- SEC/state registration or exemption filing
- Portal registration in operating jurisdictions
- Legal counsel review

❌ **Investor Verification**
- Accreditation checks (if applicable)
- Investment limit calculations
- Suitability assessments
- Risk acknowledgment

❌ **Payment Infrastructure**
- Escrow accounts
- ACH/wire transfer processing
- Distribution automation
- Payment reconciliation

❌ **Compliance Monitoring**
- Annual report generation
- Investor communications
- Regulatory filings
- Audit support

❌ **Insurance**
- E&O insurance
- Cyber liability
- Fidelity bond

## Disclaimers in Bureau UI

Every page with micro-funding features shows:

**"⚠️ PROTOTYPE — No real money, not an offer of securities"**

The payout calculator shows:

**"Projection, not a promise: This is a projection based on historical trends, not a promise. Actual results may vary significantly. Past performance does not guarantee future results."**

The investor commitment button is labeled:

**"Simulate Investment"** (not "Invest" or "Commit")

## Resources

- SEC Regulation Crowdfunding: https://www.sec.gov/education/capitalraising/building-blocks/crowdfunding
- FINRA Investor Alerts: https://www.finra.org/investors/alerts
- Canadian Securities Administrators: https://www.securities-administrators.ca/
- Howey Test (Investment Contract): SEC v. W.J. Howey Co., 328 U.S. 293 (1946)

## Recommendation

**Do not deploy micro-funding features to production without:**
1. Legal counsel specializing in securities law
2. Registered intermediary partnership (broker-dealer or funding portal)
3. Full compliance review
4. Proper insurance coverage
5. Payment infrastructure partnerships

The technical foundation is built correctly (auditable records, transparent data, source attribution). The legal and regulatory work is what's required to go live.
