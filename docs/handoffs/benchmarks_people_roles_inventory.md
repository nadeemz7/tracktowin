# Benchmarks: People & Roles Inventory

## A) Existing Models & Tables
- **Person** (`prisma/schema.prisma` `model Person`): `id`, `fullName`, `email?`, `teamType` (`SALES|CS`), `active` (default `true`), `teamId?`, `roleId?`, `primaryAgencyId?`, `isAdmin`, `isManager`, timestamps. Relations: `team` → `Team` (`agencyId`), `role` → `Role`, `primaryAgency` → `Agency`. Used for viewer context and ROI gating.
- **Team** / **Role** (`prisma/schema.prisma`): `Team { id, agencyId, name, active }` with `people` and `roles`; `Role { id, teamId, name, active }` belongs to a team; people reference roles via `Person.roleId`.
- **SoldProduct** (`prisma/schema.prisma` `model SoldProduct`): `id`, `agencyId`, `productId`, `householdId`, `soldByPersonId?`, `soldByName?`, `dateSold: DateTime`, `premium: Float`, `status: PolicyStatus` (enum `WRITTEN|ISSUED|PAID|CANCELLED|STATUS_CHECK`), `isValueHealth`, `isValueLife`, policy name/id fields, `notes`, timestamps. Each record = one app; `createSoldProduct` in `app/sold-products/page.tsx` duplicates rows when `quantity>1` (premium on first row only).
- **Production/ROI support tables** (Prisma): `RoiCommissionRate { orgId, lob, rate, effectiveStart, effectiveEnd? }`, `RoiCompPlan { orgId, personId, monthlySalary, effectiveStart, effectiveEnd? }`, `RoiMonthlyInputs { orgId, personId, month, commissionPaid, leadSpend, otherBonusesManual, marketingExpenses }`, `CompMonthlyResult { agencyId, personId, month, totalEarnings }` consumed by ROI APIs.
- **LoB sources**: `Agency` owns `LineOfBusiness { id, agencyId, name, premiumCategory }` with `Product { id, lineOfBusinessId, name, productType, isActive }`. Seeded via `STARTER_LOBS` in `app/agencies/page.tsx` (Auto/Fire/Health/Life/IPS with products). LoB buckets map to `PremiumCategory` enum (`PC|FS|IPS`).
- **LoB normalization helpers**: `lib/reports/lob.ts` defines canonical LOBs (`Auto|Fire|Life|Health|IPS`), `normalizeLobName`, and `lobToCategory`. ROI/production APIs also use inline canonical matching constants.

## B) Existing Routes & Files
- **People page** (`app/people/page.tsx`): server component loading `prisma.person` (+team/role/primaryAgency), `prisma.team`, `prisma.agency`. Server actions `createPerson`, `toggleActive`, `updatePrimary` use `revalidatePath("/people")`; `teamType` derived from team name; `primaryAgencyId` defaults to team agency when omitted.
- **Roles UI (Teams & Roles)**:
  - `app/agencies/page.tsx`: creates agencies with starter LoBs/products; quick-add people tied to `primaryAgencyId`; lists agencies.
  - `app/agencies/[agencyId]/page.tsx`: manages LoBs/products and **Teams & Roles**. Actions: `addTeam/renameTeam/deleteTeam` (detaches people then deletes roles/team), `addRole/deleteRole` (per team). Uses `prisma.team`/`prisma.role`/`prisma.person.updateMany`; revalidates agency paths.
- **APIs for People/Roles**: `app/api/org/people/route.ts` GET returns `{id,name}` list; optional `x-org-id` header filters by `primaryAgency.orgId`; no viewer check here. Viewer bootstrap at `app/api/viewer/context/route.ts` → `lib/getViewerContext.ts` (reads cookies, finds `Person` with `primaryAgency`, derives `orgId`, flags).
- **Sold Products UI** (`app/sold-products/page.tsx`): server actions `createSoldProduct` (writes `SoldProduct`/`Household`, defaults `status=WRITTEN` and `dateSold` from form), `updateSoldProduct`, `updateStatusQuick`, `updatePolicyQuick`, `deleteSoldProduct`, `updateHousehold`; filters list by `dateSold`, status, agency, person, LoB. Uses `valuePolicyDefaults` to set `isValueHealth/isValueLife`.
- **Reporting APIs using Sold Products**:
  - `app/api/reports/production/route.ts` (GET/POST): aggregates `soldProduct` by lob/person/agency; filters on `dateSold` range, `PolicyStatus` (default `WRITTEN|ISSUED|PAID`, optional `mustBeIssued`), agency/product/business-only flags; canonical lob via `canonicalLobName`/`lobCategory`; buckets premium by `lineOfBusiness.premiumCategory`.
  - `app/api/reports/roi/route.ts` POST: viewer-gated (admin/owner/manager via `getViewerContext`); filters `soldProduct` by `agencyId=viewer.orgId`, `dateSold`, statuses; derives revenue using `RoiCommissionRate`, salaries via `RoiCompPlan`, commissions via `CompMonthlyResult` or `RoiMonthlyInputs`; aggregates lob/person rows.
  - `app/api/reports/roi/person/route.ts` POST: per-person ROI; uses `canAccessRoiReport`, same sold-product + ROI data sources.
  - Related ROI setup APIs: `/api/roi/rates` (GET/POST rates by lob, admin/owner only), `/api/roi/comp-plans`, `/api/roi/monthly-inputs` (both require viewer context).
- **Viewer/permission pattern**: `/api/viewer/context` hydrates client viewer; ROI APIs require `isAdmin|isOwner|isManager`; ROI setup endpoints require `isAdmin|isOwner`. ROI UI (`app/reports/roi/ROIPageClient.tsx`) calls `/api/viewer/context` on load and auto-hits `/api/dev/login` in dev if missing cookies.

## C) Conventions We Must Follow
- **agencyId vs orgId**: Core tables (SoldProduct, Team, Role, LineOfBusiness, Product, Person.primaryAgencyId) use `agencyId`; ROI-specific tables use `orgId` but the value is the viewer’s `Agency.id` from `getViewerContext`.
- **Active status**: Boolean `active` on `Person`/`Team`/`Role`; toggled via server actions (`toggleActive` in `app/people/page.tsx`); defaults to `true`.
- **Role linkage**: `Person.teamId` + optional `Person.roleId` → `Role` (belongs to `Team` → `Agency`); roles are team/agency-level objects edited in the Agencies detail page.
- **LoB normalization**: Canonical names `Auto/Fire/Life/Health/IPS`; helper `normalizeLobName` (`lib/reports/lob.ts`) + inline `LOBS` constants in ROI/Production map variant strings; bucket to premium category via `lobToCategory` or `lineOfBusiness.premiumCategory`.
- **Reporting date field**: All production/ROI reporting filters by `SoldProduct.dateSold`; status filters use `PolicyStatus` enum. `dateSold` drives month/week bucket keys and ROI salary proration.
