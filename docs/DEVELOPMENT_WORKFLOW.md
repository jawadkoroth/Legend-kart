# PANTHER — Developer Integration & Database Change Workflow

This guide establishes the mandatory workflow for all database changes, component extensions, and page upgrades. Follow this checklist to ensure all code integrations remain safe, self-diagnosing, and backward compatible.

---

## The Integration Checklist (Step-by-Step)

### 1. Create Migration File
All database modifications (adding columns, tables, triggers, indexes, or policies) must be captured as SQL script migrations under `supabase/migrations/`.
- Use the Supabase CLI to generate a new migration file:
  ```bash
  supabase migration new your_feature_name
  ```
- Or write the migration manually matching the chronological numbering scheme (e.g. `033_new_fields.sql`).

### 2. Apply Migration to Development Supabase
Push the migration script directly to the active development database to update schemas:
```bash
supabase db push
```

### 3. Verify Database Health Dashboard
Access the Admin Settings page in your browser:
`/admin/settings/developer/database-health`
- Verify that the checks corresponding to your new database items are active (**Green**).
- Confirm that the current migration version listed matches your new version.
- On startup, look at the server logs to make sure there are no `[PANTHER_SCHEMA_CHECK]` errors reported.

### 4. Verify Local Code Compilation
Next.js handles static and dynamic compilation tasks. Before pushing changes, verify compilation safety:
```bash
npm run build
```
Ensure the build exits successfully with **zero TypeScript errors** and all static pages resolve.

### 5. Verify Affected Pages (Manual Inspection)
Inspect updated customer and administrative routes. Pay close attention to:
- **Empty States**: Verify pages load normally when database returns are empty (e.g. products with no media, no promotional coupons, or no story sections).
- **Graceful Fallbacks**: Ensure old products display their default placeholders/legacy fields and continue to function seamlessly without regressions.

### 6. Stage & Commit
Stage only the relevant files and write a clean feature descriptive commit message:
```bash
git add .
git commit -m "feat: implement <feature-description>"
```

### 7. Push to Remote Branch
Push the committed changes to your upstream git repository:
```bash
git push origin <branch>
```

### 8. Vercel Dev/Preview Deploy
Verify that Vercel successfully compiles the preview/dev deployment. Ensure there are no runtime environment variable conflicts.

### 9. Smoke Test Build
Visit the preview URL in a browser and verify core user flows (Home, Catalog, Product Details, Cart checkout, Order generation, and Admin analytics).
