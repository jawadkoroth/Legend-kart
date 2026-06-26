# PANTHER — Database & Migrations Runbook

This document details the Supabase database migrations schema, historical timeline, dependencies, rollback considerations, and developer database workflow rules.

---

## 1. Migration Hierarchy & Timeline

The database is built on sequential Postgres migrations kept in `supabase/migrations/`. They must be applied sequentially.

| Version | Name | Primary Purpose | Key Tables / Functions / Columns |
| :--- | :--- | :--- | :--- |
| `001` | `001_initial.sql` | Base schema initialization. | `products`, `orders`, `order_items`, `inventory`, `profiles`, `decrement_stock()`, `restore_stock()` |
| `002` | `002_profiles_feedback.sql` | Customer feedback. | `feedback` |
| `003` | `003_profiles_trigger.sql` | Auto-replicate users. | `trg_create_profile_on_signup` trigger on auth.users |
| `004` | `004_feedback_admin_policies.sql`| Guard feedback logs. | Admin RLS policies on `feedback` table |
| `005` | `005_order_hardening.sql` | Secure order lifecycle. | `create_order_atomic()` function |
| `006` | `006_orders_user_id.sql` | Track customer accounts. | Add `user_id` relation to `orders` |
| `007` | `007_addresses.sql` | Direct checkout delivery. | `addresses` |
| `008` | `008_media_storage.sql` | Supabase storage bucket. | Storage permissions for `products` and `receipts` |
| `009` | `009_shipping_pricing.sql` | Basic shipping charge rule. | `shipping_settings` singleton table |
| `010` | `010_realtime_orders.sql` | Dashboard live listeners. | Enable realtime replication for `orders` |
| `011` | `011_coupons_segmentation.sql` | Promo discount coupons. | `coupons` |
| `012` | `012_coupons_advanced.sql` | Limits, usage metrics. | Add coupon metrics columns |
| `013` | `013_push_subscriptions.sql` | Web push subscription store.| `admin_push_subscriptions` |
| `014` | `014_admin_audit_log.sql` | Audit logging trail. | `admin_audit_logs` |
| `015` | `015_products_archive.sql` | Soft archiving items. | `archived_at` on `products` |
| `016` | `016_app_events.sql` | Observability event spine. | `app_events` |
| `017` | `017_job_queue.sql` | Async job queue executor. | `job_queue`, `claim_jobs()` RPC |
| `018` | `018_rate_limits.sql` | Security rate limit guards. | `rate_limits` table, `rate_limit_hit()` RPC |
| `019` | `019_coupon_capacity_lock.sql` | TOCTOU coupon lock safety. | Update `create_order_atomic()` with coupon locks |
| `020` | `020_perf_indexes.sql` | Catalog performance indexing. | Partial indexes on orders / job_queue |
| `021` | `021_newsletter_subscribers.sql` | Newsletter audience database.| `newsletter_subscribers` |
| `022` | `022_multi_line_orders.sql` | Refactor order structure. | Multi-line order line schema upgrades |
| `023` | `023_shipping_multi_provider.sql`| Provider configs (Shiprocket/Delhivery)| `shipping_providers`, `shipping_pricing_rules` |
| `023b`| `023b_shipping_rpc_permissions.sql`| Shipping RPC calls access. | Set RPC EXECUTE permissions |
| `024` | `024_admin_notes.sql` | Order operational notes. | `admin_notes` |
| `025` | `025_returns_exchange.sql` | Post-purchase logistics. | `return_requests` |
| `026` | `026_shipping_error_forensics.sql`| Parse error trace metrics. | `shipping_error_forensics` |
| `027` | `027_realtime_notifications.sql` | Realtime admin push socket. | Realtime triggers on orders/returns |
| `028` | `028_fcm_tokens.sql` | Firebase device push tokens. | `admin_fcm_tokens` |
| `029` | `029_notification_triggers.sql` | Automate notification queue. | Triggers scheduling push jobs into the queue |
| `030` | `030_additional_notifications.sql`| Multi-admin message delivery.| Multi-admin notify jobs mapping |
| `031` | `031_product_premium_features.sql` | Premium product features. | `media` column on `products`, `product_story_sections`, `product_coupons` |
| `032` | `032_database_diagnostics.sql` | Self-diagnosing dashboard RPC. | `check_db_schema_health()` RPC |

---

## 2. Dependency Graph Notes

- **`005_order_hardening`** requires `001_initial` products/inventory tables.
- **`019_coupon_capacity_lock`** replaces and modifies `create_order_atomic()` from `005` and joins with `coupons` from `011_coupons_segmentation`.
- **`023_shipping_multi_provider`** migrates data away from the `009_shipping_pricing` singleton table to `shipping_providers`.
- **`029_notification_triggers`** schedules jobs directly into `017_job_queue` on `return_requests` from `025_returns_exchange`.
- **`031_product_premium_features`** references `products` (`001`) and `coupons` (`011`).

---

## 3. Rollback Considerations

1. **Destructive Actions**:
   Postgres drop table/column actions discard data. Never roll back migrations in production or active dev without taking a manual backup first.
2. **Standard Rollback Steps**:
   In local development, rollback is performed by resetting or applying individual SQL commands:
   ```bash
   # Reset local DB to clean state
   supabase db reset
   ```
3. **Trigger Cleanup**:
   Ensure `DROP TRIGGER IF EXISTS` is defined for every trigger drop to prevent migration script crash dependencies.

---

## 4. Developer Schema Sync Workflow

Whenever a developer modifies database schemas:
1. Make changes in a new timestamped migration file.
2. Push to local/development database using `supabase db push`.
3. Check the developer diagnostics page `/admin/settings/developer/database-health` to confirm the status is Green.
4. Verify compile safety using `npm run build` locally before pushing code.
