# PR 2 Soak Checklist

## Phase 1 — Production soak (flag OFF, 48h)

### Setup
- [ ] Confirm `SHIPPING_NEW_PROVIDER_PIPE` is NOT set in Vercel production env vars
- [ ] Deploy PR 2 to production (already pushed to main)

### Test A — Prepaid order + shipment creation
1. Place a real prepaid test order through the storefront
2. In admin, confirm the order
3. In admin order detail, click "Create Shipment"
4. Verify response:
   - [ ] `tracking_id` returned and visible in admin UI
   - [ ] `label_url` returned and label opens correctly
   - [ ] `orders.order_status` = `shipped`
5. Check Vercel logs — filter for `order_number`:
   - [ ] `shipping.ship_route.legacy_success` event present
   - [ ] `shipping.delhivery.create_shipment` event present with `success: true`
   - [ ] NO `shipping.ship_route.new_pipe_error` events
   - [ ] NO `shipping.ship_route.legacy_failed` events

### Test B — COD order + shipment creation
- Same steps as Test A with a COD order
- [ ] `cod_amount_paise` passed correctly to provider
- [ ] `payment_method` = `cod` in provider payload
- [ ] Same logging checks as Test A

### Test C — Duplicate shipment guard (flag OFF)
1. With an order that already has a `tracking_id`:
   - [ ] "Create Shipment" button/route returns `400 Shipment already created`
   - [ ] No second provider call is made
   - [ ] `tracking_id` unchanged in orders table

### Test D — Order rendering regression
- [ ] `/admin/orders/[id]` renders correctly for shipped orders
- [ ] `/orders/[id]` (customer view) renders tracking info correctly
- [ ] Order status timeline shows correct state
- [ ] No console errors in browser devtools

### Test E — Diagnostics + observability
- [ ] `/admin/diagnostics` loads without errors
- [ ] `app_events` table shows `shipping.*` events from shipment creation
- [ ] No new `severity: error` or `severity: fatal` events appearing unexpectedly
- [ ] Vercel function duration for `/api/admin/orders/[id]/ship` is within normal range (no hidden latency)

### Test F — No-op regression (unrelated flows)
- [ ] Checkout flow completes normally (COD + prepaid)
- [ ] Payment webhook processing unaffected
- [ ] Admin order list loads correctly
- [ ] Admin shipping settings page loads correctly

---

## Phase 2 — Preview environment test (flag ON)

### Setup
1. Create a Vercel Preview deployment (branch or manual deploy)
2. In Preview environment variables, set: `SHIPPING_NEW_PROVIDER_PIPE=on`
3. Ensure Preview has its own Supabase project OR use staging schema
   - **DO NOT point Preview at the production Supabase DB with flag ON**

### Test G — New pipe shipment creation (flag ON)
1. Place a test order in Preview
2. Confirm the order in admin
3. Create shipment via admin
4. Verify in Supabase (Preview/staging DB):

```sql
-- Must have exactly 1 row for this order
SELECT id, status, tracking_id, label_url, provider_name, client_request_id
FROM shipments
WHERE order_id = '<test_order_id>';

-- Must have exactly 1 history row, source = 'system', next_status = 'shipment_created'
SELECT shipment_id, previous_status, next_status, source
FROM shipment_status_history
WHERE shipment_id = (SELECT id FROM shipments WHERE order_id = '<test_order_id>');

-- Legacy denorm must still be populated
SELECT tracking_id, label_url, shipping_provider, order_status
FROM orders
WHERE id = '<test_order_id>';
```

Expected:
- [ ] `shipments` row exists with `status = 'shipment_created'`, `tracking_id` populated
- [ ] `shipment_status_history` has 1 row: `previous_status = 'pending'`, `next_status = 'shipment_created'`, `source = 'system'`
- [ ] `orders.tracking_id` = same tracking_id (denorm in sync)
- [ ] `orders.shipping_provider` = `'delhivery'`
- [ ] `orders.order_status` = `'shipped'`

### Test H — Idempotency (flag ON)
1. Manually call the ship route twice for the same order (use curl or Postman)
   - Second call must return `400 Shipment already created` (the guard at line 38)
2. Check DB:
   - [ ] Only 1 row in `shipments` for this order
   - [ ] Only 1 row in `shipment_status_history` for this shipment
   - [ ] `orders.tracking_id` unchanged

### Test I — Failed provider response (flag ON, controlled)
1. Temporarily set an invalid `api_key` in `shipping_providers` for the test provider
2. Create a shipment — expect provider failure
3. Verify:
   - [ ] `shipments.status` = `'failed'`
   - [ ] `shipment_status_history` has 1 row: `next_status = 'failed'`
   - [ ] `app_events` shows `shipping.create_shipment.provider_failed`
   - [ ] Route returns `500` with error message
   - [ ] `orders.tracking_id` NOT overwritten (still null for this order)
4. Restore correct `api_key`

### Test J — Rollback verification (flag ON → OFF)
1. With flag ON, create a shipment (write to new tables)
2. Remove `SHIPPING_NEW_PROVIDER_PIPE` from Preview env
3. Re-deploy Preview (env change takes effect)
4. Create a shipment on a new test order
   - [ ] Falls through to legacy path
   - [ ] `shipping.ship_route.legacy_success` appears in logs
   - [ ] Previously created shipments row in DB is untouched (no destructive rollback)
   - [ ] All admin/order UIs still render correctly

---

## Pass criteria

All checkboxes checked, and:
- Zero unhandled errors in Vercel logs during 48h window
- Zero `severity: error` events that weren't there before PR 2
- DB row counts in staging match expectations from Tests G/H/I

**If all pass → proceed to PR 3.**

---

## PR 3 scope (for reference)

- `src/app/api/webhooks/shipping/route.ts` — unified webhook receiver
- Signature verification (Delhivery HMAC, IP allowlist fallback)
- Idempotency: `shipping_webhook_events` dedup before processing
- State machine application: `canTransition()` guard before any status write
- Append to `shipment_status_history` (source = 'webhook')
- Denorm write to `orders.order_status` via `shipmentStatusToOrderStatus()`
- Dead-letter to `job_queue` on processing failure (retry)
- Observability: `app_events` for every webhook received/processed/rejected
