# TrackToWin — TODO Roadmap

## Ground rules
- One feature slice at a time.
- Prefer “paste-ready full files” over partial snippets.
- Always regenerate Prisma client after schema changes:
  - `npx prisma db push`
  - `npx prisma generate`

---

## 0) Project hygiene
- [ ] TODO: Add `.env` to `.gitignore` (if not already)
- [ ] TODO: Add a simple “Dev Notes” page (`/dev`) with links to all pages for quick navigation
- [ ] TODO: Add a tiny UI layout component so pages look consistent (header/nav)

---

## 1) Data model upgrades (still beginner-safe)
### People / roles (to replace free-text names)
- [ ] TODO: Add `Person` table (id, fullName, teamType, active)
- [ ] TODO: Replace `ActivityRecord.personName` with `personId` (keep personName temporarily during migration)
- [ ] TODO: Replace `SoldProduct.soldByName` with `soldByPersonId` (keep soldByName temporarily)
- [ ] TODO: Add a migration strategy (don’t break existing rows):
  - Make new fields nullable
  - Backfill
  - Then enforce required later

### Household options (custom fields) for reporting filters later
- [ ] TODO: Add `MarketingSourceOption` table per agency (name, active)
- [ ] TODO: Add `HouseholdFieldDefinition` table (agencyId, fieldName, fieldType, required, active)
- [ ] TODO: Add `HouseholdFieldValue` table (householdId, fieldDefinitionId, value)

---

## 2) Sold Products UX (reduce friction)
- [ ] TODO: Replace “always create new household” with:
  - household search (by first/last)
  - select existing household OR create new
- [ ] TODO: Default Value Health / Value Life checkboxes automatically:
  - Health: if premium >= 600, default Value Health checked
  - Life: if premium >= 1200, default Value Life checked
- [ ] TODO: Make Product dropdown filter by selected Agency:
  - Agency -> LoBs -> Products
- [ ] TODO: Add optional fields:
  - policy/app id
  - notes
- [ ] TODO: Add “Add another product to same household” flow (fast bundle entry)

---

## 3) Activities UX polish
- [ ] TODO: Persist per-person counter layout (order + which counters are shown)
  - Table: `ActivityCounterPreference` (personId/personName, teamType, activityName, displayOrder, visible)
- [ ] TODO: Add drag-and-drop reorder (or move up/down buttons)
- [ ] TODO: Add “Copy yesterday” button (Day view only)
- [ ] TODO: Add “Reset all to 0” button (Day view only)
- [ ] TODO: Add “Outbounds vs Dials” naming cleanup (choose one label, map internally)

---

## 4) Win The Day (finish the model)
- [ ] TODO: Store WTD config in DB instead of hardcoding:
  - RoleGroup / TeamType configs:
    - target points
    - scoring rules per activity (pointsPerUnit, unitsPerPoint)
    - whether apps count and which statuses count
- [ ] TODO: Add overrides:
  - per role (later)
  - per person
- [ ] TODO: Add a dedicated WTD report page:
  - pick day
  - pick team(s)
  - show win/not win + breakdown

---

## 5) Paycheck / Monthly Summary (the money page)
### Page: `/paycheck`
- [ ] TODO: Month selector (default current month)
- [ ] TODO: “Assume all policies are issued” checkbox (what-if mode)
- [ ] TODO: Counters (policies)
  - Total policies
  - Written count
  - Issued count
  - With Issues (Status Check) count
- [ ] TODO: Counters (premium)
  - Total premium
  - Written premium
  - Issued premium
  - Premium with issues
- [ ] TODO: Tier progress (Bronze/Silver/Gold)
  - P&C premium bucket
  - FS premium bucket
  - Apps Issued count
  - Show “what’s missing”
- [ ] TODO: Tier bonus preview (optional display for now)
- [ ] TODO: Breakdown table of policies:
  - date
  - product
  - status
  - premium
  - value flags
  - household
- [ ] TODO: Add filters:
  - person
  - agency (single or multi)
  - status (multi)

---

## 6) Commission engine (Sales plan)
### First implement “Sales plan v1” as code (not UI)
- [ ] TODO: Compute monthly base commission:
  - Auto Personal Raw New (app count tiers)
  - Auto Personal Adds ($5/app)
  - Fire Personal (3% premium)
  - Business Premium bucket (Auto+Fire business) tiered %:
    - 0–50k: 2%
    - 50k+: 3%
  - Business Auto Adds: 0.5% premium
  - Health bucket tiered % (10/14/18) + Value Health policy override 20%
  - Life bucket tiered % (10/14/18) + Value Life policy override 20%
- [ ] TODO: Status eligibility for pay:
  - default Issued+Paid for commission
  - Cancelled excluded
  - Keep “Assume issued” as forecasting

### Then implement Bronze/Silver/Gold accelerator
- [ ] TODO: Qualification checks:
  - Bronze: P&C 35k, FS 3.5k, Apps Issued 40
  - Silver: P&C 45k, FS 5.5k, Apps Issued 50
  - Gold: P&C 75k, FS 3.5k, Apps Issued 60
- [ ] TODO: Bonus application:
  - Bronze: +1% P&C, +2% FS
  - Silver: +2% P&C, +4% FS
  - Gold: +3% P&C, +6% FS
- [ ] TODO: Highest tier wins (no stacking)

---

## 7) Comp Plan Builder UI (modular)
- [ ] TODO: Build plan builder using “modules”:
  - Buckets builder (sum/count definitions)
  - Earnings rules (flat, %, tiers)
  - Overrides (value policy flags)
  - Bonus modules (accelerators)
- [ ] TODO: Preview/Test tab (pick month + person + show breakdown)
- [ ] TODO: Versioning by effective month (optional MVP+)

---

## 8) Reports
### Default reports
- [ ] TODO: Daily report (any day)
- [ ] TODO: Win The Day report (any day)
- [ ] TODO: Monthly report
- [ ] TODO: Custom date range report
- [ ] TODO: Annual report
- [ ] TODO: Products report:
  - filter by agency(s)
  - filter by product(s)
  - filter by seller/person
  - include household fields (ECRM link, marketing source, onboarded)

### Saved presets
- [ ] TODO: Save report preset filters per user (and optionally shared presets)

---

## 9) Auth & permissions (when you’re ready)
- [ ] TODO: Add login (email + password)
- [ ] TODO: Agency memberships (admin/manager/team member)
- [ ] TODO: Replace free-text personName with real users/people
- [ ] TODO: Restrict pages by role

---

## 10) Deployment (free/cheap)
- [ ] TODO: Deploy to Vercel (web)
- [ ] TODO: Keep DB on free tier (Prisma Postgres / Neon / Supabase)
- [ ] TODO: Add environment variables in hosting dashboard
- [ ] TODO: Add basic error logging

---

## Notes for Codex
- Current working pages:
  - `/` home links
  - `/agencies` create/list agencies
  - `/agencies/[agencyId]` agency detail (LoBs + products)
  - `/sold-products` sold product entry
  - `/activities` activity + Win The Day
- Current temporary design choices:
  - Activities keyed by `personName` (optional field)
  - Sold products keyed by `soldByName` (optional field)
  - These will be replaced by a real `Person` table later
