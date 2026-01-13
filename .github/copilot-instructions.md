# TrackToWin Codebase Guide for AI Agents

## Architecture Overview

**TrackToWin** is a compensation, benchmarking, and activity-tracking platform built with **Next.js 16**, **React 19**, **Prisma 7**, and **PostgreSQL**. The app focuses on complex compensation plan configuration (rule blocks, tiers, gates, bonuses, scorecards) and reporting against sales/support metrics.

### Key Domains
- **Compensation Plans**: Rule-based engine with tiered payouts, bonus modules, scorecards, and gates
- **Benchmarking**: Team/office/person performance targets and tracking
- **Win The Day**: Daily activity tracking for sales and customer service teams  
- **Reports**: Policy snapshots, activity leaderboards, ROI analysis, annual summaries
- **Agencies**: Multi-tenant organization structure with teams, roles, and products

## Core Patterns

### 1. Server Components & Server Actions (Default Pattern)
- **Default**: All pages are async server components (`export default async function Page()`)
- **Forms**: Use inline "use server" functions within server components to handle FormData submissions
  - Example: `async function addRule(formData: FormData) { "use server"; ... revalidatePath(...); }`
- **No explicit API routes needed** for simple CRUD unless data is fetched from the browser

### 2. API Routes (for Client Interaction)
- Located in `app/api/**/*` with file-based routing
- Always validate `getViewerContext(req)` for authorization; return 401/403 on failure
- Common headers: `x-org-id`, `x-impersonate-person-id` (dev only)
- Response pattern: `NextResponse.json({ data }, { status })`
  - Example: `app/api/activity-types/route.ts` (GET/POST)

### 3. Auth & Viewer Context
- `getViewerContext(req)` returns `{ personId, orgId, isAdmin, isManager, isOwner, impersonating }`
- `getOrgViewer(req)` similar but returns optional org viewer for dev fallback
- Dev mode auto-selects first admin/manager/user if no auth provided (`lib/getOrgViewer.ts`)
- Use `canAccessRoiSetup()`, `hasBenchmarksWriteAccess()` for permission checks

### 4. Data Mutation Patterns
- **Server actions** prefer `revalidatePath()` over `revalidateTag()` for cache invalidation
  - Pattern: `revalidatePath("/path/to/page")` after `prisma.model.create/update/delete()`
- **Error handling**: Use URL search params for error messages (not toast), e.g., `?err=missing_fields`
  - Example: `app/compensation/plans/[planId]/page.tsx` line ~50–100
- **Redirect on success**: `redirect("/next-page")` to move user after form submission

### 5. Client Components (Minimal)
- Use `"use client"` only for interactive elements: forms, drag-drop, charts
- Components in `components/` and `app/**/[Component]Client.tsx` are client-side
- Pass server-fetched data as props; avoid `useEffect` for initial data loads
- Example: `AdvancedRuleBlockModalClient` wraps complex compensation builder logic

## Compensation Plan Domain

### Data Model Hierarchy
```
CompPlan → PlanVersion (isCurrent = true)
├── RuleBlock (base rules with tiers, scopes, payout types)
├── PremiumBucket (product/LoB grouping for tiering)
├── Gate (min app/premium thresholds with hard-gate/retroactive/non-retro behavior)
└── BonusModule (scorecard/bonus/subtractor with conditions)
```

### RuleBlock Attributes
- **applyScope**: `LOB | PRODUCT | BUCKET` (what it applies to)
- **payoutType**: `FLAT_PER_APP | PERCENT_OF_PREMIUM | FLAT_LUMP_SUM`
- **tierMode**: `NO_TIERS | TIERS` (optional tier rules for tiered payouts)
- **tiers**: min/max ranges with payout values
- **minThreshold**: gate minimum before rule activates
- **statusEligibilityOverride**: `[PolicyStatus]` (Issued, Paid, etc.)

### Common Validation Patterns
- Tier overlap detection: sort by min, check `max[i] < min[i+1]`
- Minimum thresholds require a `tierBasis` (APP_COUNT, PREMIUM_SUM, BUCKET_VALUE)
- Rule names, preset selections, and conditions are required before save
- Error codes in URL: `?err=no_tiers`, `?err=invalid_tier_rows`, etc.

## File Organization

### Key Directories
- `app/compensation/plans/[planId]/` — Comp plan builder with modular sub-components
- `app/api/compensation/` — Comp plan data endpoints
- `app/reports/` — Report builders and components  
- `lib/benchmarks/` — Validation, guards, and math for benchmark reports
- `lib/prisma.ts` — Prisma singleton export (use everywhere instead of `new PrismaClient()`)
- `prisma/schema.prisma` — Full data schema with Enum exports

### Inline Script Pattern (Compensation Plans)
- Embeds vanilla JS in `<script dangerouslySetInnerHTML>` for client-side form interactivity
- Handles scorecard preset selection, bonus tier add/remove, validation
- Uses `querySelectorAll`, `dataset` attributes, form submit listeners
- **Why**: Avoid hydration mismatch and keep complex logic isolated from React state

## Development Workflow

### Commands
```bash
npm run dev          # Start dev server (auto-reload on file changes)
npm run build        # Next.js production build
npm run start        # Run production build locally
npm run lint         # ESLint check
```

### Database
- Prisma schema in `prisma/schema.prisma`
- Migrations auto-tracked in `prisma/migrations/`
- Use `prisma.model.operation()` everywhere; avoid raw queries
- PostgreSQL adapter: `@prisma/adapter-pg`

### Search Patterns
- Use `prisma.agency.findFirst({ where: { ... }, select: { ... } })` to optimize queries
- Use `.include()` for relationships, not eager-loaded by default
- Use `orderBy` for consistent sorting in lists

## Common Mistakes to Avoid

1. **Impersonation in prod**: Check `process.env.NODE_ENV !== "production"` before using dev fallback (`lib/getOrgViewer.ts`)
2. **Missing orgId in API**: Always validate `viewer?.orgId` in API routes and return 401 if missing
3. **Cache invalidation**: Use exact paths in `revalidatePath()`, not wildcards
4. **Unvalidated tier inputs**: Always check for overlaps, min/max bounds, and NaN values before save
5. **Form errors in URL**: Avoid large error payloads; use short error codes (e.g., `missing_fields`)
6. **Dangling transactions**: Prisma handles atomicity; don't nest `create` calls unnecessarily

## Testing & Debugging

- **Dev impersonation**: Set cookie `impersonatePersonId=<personId>` or header `x-impersonate-person-id`
- **Viewer context debug**: `getLastViewerDebug()` exported from `lib/getViewerContext.ts` for 401 responses
- **Browser console**: Check for inline script errors (compensation plan builder)
- **Server logs**: `console.log()` appears in terminal when `npm run dev`

## Quick Reference: Adding a New Endpoint

1. Create `app/api/feature/route.ts`
2. Extract `viewer = await getViewerContext(req)` and validate permission
3. Parse `req.json()` or headers for input
4. Query `prisma.model.operation()`
5. Return `NextResponse.json({ ... }, { status: 200 })`
6. Use `revalidatePath()` in server actions, not API routes

## Quick Reference: Adding a Form Page

1. Create async server component in `app/section/page.tsx`
2. Define inline "use server" function for `addThing(formData)`
3. Validate required fields from `formData.get()`
4. Call `prisma.model.create()` with validated data
5. Call `revalidatePath()` to refresh cache
6. On error: use `redirect("...?err=code")`, not throw
7. Render form with hidden inputs for redirect context
