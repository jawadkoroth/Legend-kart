# PANTHER Marketing Platform — Architecture Blueprint

> **Status:** Design / not yet implemented
> **Audience:** Implementing engineering agent (Gemini/Antigravity) + PANTHER team
> **Author framing:** Written by the architect. This is a blueprint, not code. Read top-to-bottom once before building anything — the early decisions (identity, event contract, multi-tenancy, consent) are load-bearing and expensive to retrofit.

---

## 0. Assumptions Being Challenged First

If these are wrong, the rest is built on sand.

### 0.1 "Supabase + Firebase" is a liability for a marketing platform
Two systems both think they own identity and both emit events (Supabase Auth + Postgres, Firebase Auth + FCM/Analytics). A marketing intelligence platform is fundamentally an identity-resolution and event-aggregation system. Two identity sources = two partial truths = broken attribution and double-counted customers.

**Decision:** One system of record for customer identity — **Supabase/Postgres**. Demote Firebase to a *delivery transport only* (push via FCM, maybe phone OTP). Firebase Analytics is a *downstream consumer*, never a source of truth. If Firebase Auth cannot be removed, treat `firebase_uid` as just another alias edge in the identity graph (§6). Never let two auth systems mint two `user_id` spaces silently.

### 0.2 You cannot build the analytical layer on Postgres alone
At 100k visitors/day with full event capture: roughly **5–20M events/day, 2–7B events/year**. OLTP Postgres dies under analytical scans (funnels, cohort retention, attribution windows) long before that. Use the **warehouse-first** pattern: a thin operational store (Postgres) for activation state, an append-only analytical store (BigQuery) for analysis. Design the collector warehouse-agnostic so the BigQuery migration is a sink swap, not a rewrite.

### 0.3 Client-side tracking alone loses 20–40% of truth
iOS ATT, Safari ITP, ad blockers, and consent rejection silently delete ~a third of client events. **Server-side tracking is Phase 1, not Phase 5.** Meta CAPI and Google Enhanced Conversions / server-side GTM are table stakes.

### 0.4 "Could power many brands" ⇒ multi-tenancy is a day-1 schema decision
Every table carries `tenant_id` from the first migration. Retrofitting tenancy into a single-tenant event lake is one of the most expensive migrations in software.

---

## 1. Overall Architecture

A first-party CDP + marketing activation + analytics stack that **owns the data**, with Meta/Google/WhatsApp/Email as interchangeable downstream destinations.

### The spine (9 layers)

```
┌─────────────────────────────────────────────────────────────────┐
│ 9. PRESENTATION   PANTHER Admin: dashboards, funnels, segments,   │
│                   campaign ROI, journeys (Next.js App Router)     │
├─────────────────────────────────────────────────────────────────┤
│ 8. AUTOMATION     Journey engine, triggers, flows, frequency cap  │
├─────────────────────────────────────────────────────────────────┤
│ 7. ACTIVATION     Reverse-ETL → Meta CAPI, Google EC, WhatsApp,   │
│                   Email/ESP, Catalog feeds  (the "destinations")  │
├─────────────────────────────────────────────────────────────────┤
│ 6. MODELING       Attribution, segments, RFM/CLV, funnels (dbt-   │
│                   style transforms; runs in warehouse)            │
├─────────────────────────────────────────────────────────────────┤
│ 5. STORAGE        Operational (Postgres) + Analytical (BigQuery)  │
│                   + PII vault                                      │
├─────────────────────────────────────────────────────────────────┤
│ 4. IDENTITY       Identity graph / alias resolution / stitching   │
├─────────────────────────────────────────────────────────────────┤
│ 3. INGESTION      Collector API → queue/stream → sinks (fan-out)  │
├─────────────────────────────────────────────────────────────────┤
│ 2. COLLECTION     Web SDK (sandboxed pixel) + Server SDK +        │
│                   Webhooks (Razorpay/Delhivery/ESP)               │
├─────────────────────────────────────────────────────────────────┤
│ 1. CONSENT/GOV    Cross-cutting: consent gate, PII policy, audit  │
└─────────────────────────────────────────────────────────────────┘
```

### Non-negotiable principles
1. **Events are immutable facts.** Never update an event row. Corrections are new events.
2. **Identity is resolved at read/model time, not destructively at write time.** Store raw `anonymous_id` and `user_id` on every event; stitch later. Never overwrite one with the other in place.
3. **The collector is dumb and fast; the warehouse is smart.** Ingestion validates schema, stamps, enqueues. No business logic on the hot path.
4. **Every destination is a plugin behind one interface.** Meta, Google, WhatsApp, ESP implement `Destination.send()`. Adding TikTok/Pinterest later is a new plugin, not surgery.
5. **Consent gates activation, not collection.** Consent decides what may be *shared with third parties* and used for marketing.

**Trade-off:** more machinery than "drop in Meta Pixel." Payoff: data ownership; external dashboards become optional.
**Pitfall:** building the visible layers (2,7,9) and skipping the invisible ones (3,4,6) — which are the entire value.

---

## 2. Event Architecture

A single, versioned, typed event contract every producer obeys and every consumer trusts. The most important artifact in the system.

### Canonical event envelope (every event, every source)

```
Event {
  event_id        UUID            // client-generated; dedup key across client+server
  tenant_id       UUID
  schema_version  string          // e.g. "1.3.0"
  name            enum/string     // closed taxonomy below
  ts_client       timestamptz     // device clock
  ts_server       timestamptz     // trusted collector clock
  anonymous_id    UUID            // first-party id, ALWAYS present
  user_id         UUID | null     // set once known
  session_id      UUID
  context {
    page   { url, path, referrer, title,
             utm{source,medium,campaign,term,content},
             click_ids{fbclid,gclid,...} }
    device { type, os, browser, viewport, app_version }
    geo    { country, region, city }   // derived server-side from IP; IP then discarded/hashed
    consent{ analytics:bool, marketing:bool, version }
  }
  properties      jsonb           // event-specific, typed per event in registry
  pii_ref         token | null    // pointer into PII vault; never raw PII in the event
}
```

### Event taxonomy (closed vocabulary — no ad-hoc names)
- **Lifecycle:** `page_viewed`, `session_started`, `product_list_viewed`, `product_viewed`, `search_submitted`, `collection_viewed`
- **Intent:** `product_added_to_cart`, `cart_viewed`, `product_added_to_wishlist`, `checkout_started`, `checkout_step_completed`, `payment_info_submitted`
- **Conversion:** `order_placed`, `order_paid`, `order_fulfilled`, `order_delivered`, `order_cancelled`, `refund_issued`
- **Retention:** `account_created`, `subscribed`, `unsubscribed`, `review_submitted`, `support_contacted`
- **Marketing:** `email_sent`, `email_opened`, `email_clicked`, `whatsapp_delivered`, `notification_clicked`

### Schema registry
Each event name has a JSON Schema with required/optional properties and a version (semver: additive = minor, breaking = major). Producers validate; the collector rejects/quarantines failures to a dead-letter table — **never silently drop**.

| Dimension | Detail |
|---|---|
| Responsibilities | Define contract, version it, validate at edge, quarantine bad events |
| Dependencies | Collector (validation), warehouse (storage), modeling (consumers) |
| Future scalability | Decouples producers from consumers; new events ship without coordination |
| Trade-offs | Upfront rigor vs velocity — worth it; schema chaos is unrecoverable |
| Pitfall | PII in `properties` — forbid at schema level; PII → vault, token in event |
| DB design | `event_log` append-only, partitioned by `ts_server` day, clustered `tenant_id,name` |
| APIs | `POST /v1/events/track` (batch), `/identify`, `/page` — Segment/Snowplow-compatible |
| Background jobs | Dead-letter reprocessor; schema-drift alerter; volume + null-rate monitor |
| Admin UX | "Event Inspector": live tail, schema-violation feed, per-event volume |
| Customer UX | Invisible; never block render; `sendBeacon`/keepalive |

---

## 3. Tracking Architecture (Collection + Ingestion)

Capture events from web, app, and server reliably, surviving ad blockers and consent loss, and deduplicate across client and server.

### Three collection paths, one envelope
1. **Web SDK (sandboxed pixel).** Follow Shopify's Web Pixels model: pixels run in a sandbox, subscribe to a typed event bus your app publishes (cannot read arbitrary DOM/cookies). Serve the collector from a **first-party subdomain** (e.g. `t.panther.com`) so it isn't blocked as third-party.
2. **Server SDK.** Authoritative events (`order_paid`, `refund_issued`) originate server-side. **`order_paid` must come from the Razorpay webhook** — never trust the client for money events.
3. **Webhooks.** Razorpay (payments), Delhivery (shipment → `order_fulfilled/delivered`), ESP (email engagement). Each normalized into the envelope.

### Client+Server deduplication (critical, most-botched)
Browser pixel and server both emit, e.g., `order_paid` with the **same `event_id`**. Meta CAPI + Pixel dedup on `event_id`; the warehouse dedups the same way. This gives redundancy of server-side AND richness of client-side without double-counting. Make it a first-class invariant.

| Dimension | Detail |
|---|---|
| Responsibilities | Buffer+batch client-side, retry w/ backoff, respect consent, attach context, dedup |
| Dependencies | Consent layer, identity (anonymous_id cookie) |
| Future scalability | Stateless collector → Cloud Run autoscale; queue (pgmq → Pub/Sub) absorbs spikes |
| Trade-offs | Server-side adds infra cost vs one-line pixel — non-negotiable (§0.3) |
| Pitfall | Synchronous Postgres writes on hot path — must `enqueue and return 200` <50ms |
| DB design | `ingest_queue`/pgmq topic, `dead_letter`, `webhook_receipts` (idempotency keys) |
| APIs | Collector endpoints; webhook receivers with signature verify + idempotency |
| Background jobs | Queue consumer → validate → identity-stitch → store + fan-out to destinations |
| Admin UX | Source health (events/min per source, error rates, webhook delivery status) |
| Customer UX | Zero perceptible latency; `sendBeacon` on unload |

---

## 4. Meta Architecture

Maximize signal quality despite ATT; drive dynamic product ads; build/sync audiences — all from owned first-party data.

- **Conversions API (CAPI)** server-side for every funnel event, deduped with the pixel via `event_id`. Send **Advanced Matching** (hashed email/phone/name) from the server.
- CAPI lives in the **activation layer**, not the checkout controller — Meta is a destination plugin.
- **Product Catalog feed** (from Product Media/catalog) → Meta Catalog for Dynamic Product Ads / Advantage+.
- **Custom Audiences / Customer Match** from the Audience Builder (§9), kept fresh by a sync job.
- **Aggregated Event Measurement (AEM):** configure 8 priority events; expect modeled/delayed iOS attribution.

| Dimension | Detail |
|---|---|
| Dependencies | Identity (hashed matching), consent (marketing=true), catalog, segments |
| Future scalability | Plugin behind `Destination`; rate-limit-aware batching; CAPI Gateway if needed |
| Pitfall | Sending PII without consent; forgetting dedup (inflated ROAS, misallocated spend) |
| DB design | `destination_sync_state(...)`, `event_dispatch_log(event_id,destination,status,attempts)` |
| APIs | Internal `meta.sendConversion()`, `meta.syncAudience()`; external Meta Marketing/Conversions API |
| Background jobs | CAPI dispatcher, audience sync (incremental diff), catalog refresh, match-rate monitor |
| Admin UX | Connection health, match-rate %, sent-vs-received reconciliation, audience sync status |

---

## 5. Google Architecture

GA4 parity inside Google's ecosystem while owning the data, plus Merchant Center for Shopping/PMax.

- **GA4 via server-side tagging (sGTM)** + **Enhanced Conversions** (hashed first-party data).
- **Consent Mode v2** — mandatory for EEA, increasingly enforced. The consent layer (§19) emits signals to Google; otherwise conversions are dropped/modeled and remarketing breaks.
- **Google Merchant Center** feed (from catalog) → Shopping, PMax, free listings. Premium fashion lives/dies on feed quality (GTIN, attributes, availability, price accuracy).
- **Customer Match** audience sync (parallel to Meta).
- **Offline conversion import** for delayed conversions (COD confirmed on delivery — relevant for India).

**Pitfall:** treating GA4 as source of truth. GA4 is a *destination*; your warehouse is the source of truth (GA4 sampling/retention limits are exactly why this platform exists).
**Background jobs:** feed generation + validation, Enhanced Conversions dispatcher, offline conversion uploader.
**Admin UX:** Merchant Center disapproval feed (fix loop), consent-mode coverage %, conversion-import reconciliation.

---

## 6. Customer Journey Architecture (Identity Resolution)

The foundation. Attribution, CLV, segments, journeys are meaningless without it.

Resolve messy reality (one human = many devices; anonymous session → login; email click on mobile → convert on desktop) into **one persistent profile**.

### Identity graph
- **Nodes:** identifiers (`anonymous_id`, `user_id`, hashed email/phone, `firebase_uid`, `fbclid`, `gclid`).
- **Edges:** observed co-occurrences (an `identify` event, a login, a checkout with phone).
- A **deterministic** resolver merges connected components into one `profile_id`.
- **Deterministic only** to start — no probabilistic/fingerprint stitching (privacy + accuracy minefield; wrong for DPDP + a premium brand).

### Merge discipline (the hard part)
- Stitching is **append-only and reversible.** Store alias edges with timestamps; compute the merged profile as a materialization, never by destroying originals. You must be able to **split** wrongly-merged profiles (shared family device). Destructive merges are unrecoverable — the #1 CDP regret.
- Pre-login events keep their `anonymous_id`; post-resolution a job backfills `profile_id` onto historical events so attribution windows see the full journey.

| Dimension | Detail |
|---|---|
| DB design | `identity_node(id,tenant_id,type,value_hash,first_seen,last_seen)`; `identity_edge(tenant_id,node_a,node_b,evidence_event_id,observed_at)`; `profile(profile_id,tenant_id,primary_user_id,traits jsonb,computed{clv,rfm,predicted_*})`; `profile_alias(profile_id,node_id)` |
| Background jobs | Incremental stitcher (on `identify`), nightly reconciliation, merge-conflict reviewer |
| Pitfall | Over-merging on shared device/IP; under-merging from un-normalized email (lowercase/trim/dot-strip before hashing) |
| Admin UX | **Profile 360** — unified cross-device/session/channel timeline for one customer |

---

## 7. Campaign Attribution

Answer "which marketing drove revenue" honestly — including that much of it is correlation, not causation.

**Attribution is a modeled layer, never a stored column.** Storing "this order came from Facebook" on the order row is the original sin — it bakes in one model forever. Capture **touchpoints** as events; compute attribution as a re-runnable transformation.

### Models
- Last non-direct click (default; matches GA4)
- First click
- Linear / time-decay / position-based (multi-touch)
- Data-driven attribution (later, BigQuery)

### The honesty layer most skip: incrementality / holdout groups
Correlation-based attribution over-credits retargeting and brand search (you'd have bought anyway). Offer holdout groups (suppress marketing for a random control cohort, measure lift). Real marketing science vs vanity dashboards. **Phase 4+.**

- **DB design:** `attribution_touch(profile_id,channel,campaign,utm{},click_id,ts,position)`; attribution results are materialized model outputs, versioned by model.
- **Pitfall:** COD + delayed delivery (India) breaks naive windows — attribute on the *revenue-recognized* event with a configurable, generous window.
- **Admin UX:** model selector on every revenue report; side-by-side model comparison; ROAS with confidence caveats.

---

## 8. Marketing Data Model

Every table has `tenant_id`.

### Operational (Postgres / Cloud SQL) — activation state, read often, fresh
`profile`, `identity_node/edge/alias` (§6); `consent_record` (§19); `segment` (definition AST), `segment_membership`; `campaign`, `journey`, `journey_run`, `journey_step_state`; `audience`, `destination_sync_state`; `message_log`; `suppression_list`.

### Analytical (BigQuery later; partitioned Postgres now) — append-only, big
`event_log`, `session`, `attribution_touch`, `order_fact`, `order_line_fact`; derived marts: `daily_revenue_by_channel`, `cohort_retention`, `funnel_steps`, `rfm_scores`, `clv`.

### Modeling layer
dbt-style (literal dbt on BigQuery; materialized views in Postgres now). **Bronze** (raw events) → **Silver** (cleaned, identity-resolved, sessionized) → **Gold** (marts dashboards query). Dashboards **never** query raw events — only gold marts.

**Pitfall:** ad-hoc analytical queries against OLTP `event_log` — that's how you take down checkout during a flash sale. Hard wall between operational and analytical.

---

## 9. Audience Builder

Marketers define audiences with no SQL, materialize them, sync to any destination.

A **segment is a saved query (an AST), not a frozen list** — a living definition ("added to cart in 7d AND no purchase AND CLV > ₹5000"). UI rule builder → AST → SQL against gold marts.

### Two membership modes
- **Real-time** (event-triggered): "checkout_started without order_paid in 1h" → journeys.
- **Batch** (nightly recompute): large analytical segments → ad platforms.

- **DB design:** `segment(id,tenant_id,name,definition_ast jsonb,mode,last_computed)`; `segment_membership(segment_id,profile_id,entered_at,exited_at)`. Track entered/exited to trigger journeys on segment entry/exit.
- **Background jobs:** recompute scheduler; membership-diff → destination sync.
- **Pitfall:** full nightly recompute doesn't scale — use incremental evaluation (only profiles with new relevant events).
- **Admin UX:** visual rule builder, live size estimate, sample-profile preview, one-click sync to Meta/Google/Email/WhatsApp.

---

## 10. CRM Architecture

The profile **is** the CRM. Unify identity, contactability, consent, value, history.

Traits (computed + manual), contact channels with per-channel consent + engagement health, lifecycle stage (lead → first-purchase → repeat → VIP → churned → won-back), notes, tickets, predictive scores.

- **DB design:** `profile.traits` (jsonb), `profile_channel(profile_id,channel,address_token,consent,engagement_score,deliverability_status)`, `lifecycle_stage` (rule-computed, overridable).
- **Future:** the multi-brand asset; tenant isolation lets one CRM engine serve many brands.
- **Pitfall:** mixing mutable CRM traits with the immutable event log. Traits are *projections* of events; recompute them; flag manual overrides.
- **Admin UX:** Profile 360 is the CRM home; lifecycle pipeline view; bulk actions.

---

## 11. WhatsApp CRM

For an India-first premium brand, likely the **#1 channel**. First-class, not an afterthought.

Integrate **WhatsApp Business Platform (Cloud API via Meta)**, ideally via a BSP, abstracted behind the `Channel` interface.

### Hard constraints
- **Opt-in mandatory and auditable** — record explicit opt-in (timestamp/source) in the consent layer.
- **Template messages** (pre-approved) for business-initiated outside the 24h window; **session messages** free-form within 24h of user reply. The sender must know which mode applies.
- **Conversation-based pricing** — track cost per conversation category (marketing/utility/auth); marketing ROI must include WhatsApp cost.
- **Two-way:** inbound replies create events and can trigger journeys / route to support.

**Use cases:** abandoned-cart nudges, order/shipping updates (utility templates), back-in-stock, **COD confirmation (reduces RTO — real ₹ saved)**, post-delivery review requests, VIP concierge.

- **DB design:** `whatsapp_template(id,status,category,components)`, `conversation(profile_id,opened_at,category,cost)`, shared `message_log`.
- **Pitfall:** spraying marketing templates → quality-rating drop → throttle/ban. Respect frequency caps and category rules.
- **Customer UX:** opt-in at checkout ("Get order updates on WhatsApp" — easy yes); separate marketing opt-in.

---

## 12. Email Marketing Architecture

Own the most durable, platform-independent channel.

**Build vs buy:** do **not** build an SMTP/MTA. Use a sending API (SES/Resend/Postmark/Sendgrid) behind the `Channel` interface. Own the data, segments, journeys, templates, engagement events; rent the pipes.

**Deliverability is the real engineering:** SPF/DKIM/DMARC, dedicated IP + warmup, bounce/complaint → automatic suppression, engagement-based sending (stop mailing dead addresses). The suppression list is sacred and global per tenant.

- **DB design:** `email_template`, `email_campaign`, `message_log`, `suppression_list(reason: unsub|bounce|complaint|manual)`; engagement events flow back into `event_log`.
- **Background jobs:** send orchestrator (rate-limited, reputation-aware), webhook ingester (opens/clicks/bounces → events), suppression sync.
- **Pitfall:** mailing without engagement filtering → spam folder → channel death. Reputation is a finite resource.
- **Admin UX:** drag-drop editor, A/B subject testing, send-time optimization, deliverability dashboard.

---

## 13. Marketing Automation (Journey Engine)

The Shopify Flow / Klaviyo Flows engine — event/segment-triggered, multi-step, multi-channel, branching.

A **durable state machine per profile per journey.** A journey is a DAG of steps (wait, condition, send, split, A/B, goal). Each enrolled profile has a `journey_run` with current step + resume time; a scheduler advances expired/triggered runs.

> Use a **durable workflow engine** (Temporal or managed equivalent) once complexity grows — durable timers, retries, exactly-once steps. Phase 1: simpler scheduler + `journey_run` table; keep the step interface swappable.

**Triggers:** event (`checkout_started`), segment entry/exit, schedule, attribute change, date-based (birthday, order+30d).

### Production-grade controls
- **Frequency capping across all channels** (no email + WhatsApp + push 5×/day).
- **Quiet hours / timezone awareness.**
- **Goal/exit conditions** (stop abandoned-cart flow the instant they purchase).
- **Idempotency** (retry must not double-send; tie sends to a dedup key).

- **DB design:** `journey(definition_dag)`, `journey_run(profile_id,journey_id,current_step,next_run_at,status)`, `journey_step_log`, `frequency_ledger(profile_id,channel,sent_at)`.
- **Pitfall:** double-sends on retry; runaway loops (journey re-enrolls on its own send event); ignored quiet hours.
- **Admin UX:** visual flow canvas, live enrollment per step, conversion per branch, dry-run on a test profile.

---

## 14. Customer Segmentation (Predictive)

Beyond rule-based: RFM, CLV, churn risk, predicted next order, discount affinity.

1. **RFM** — deterministic SQL (Phase 2/3). Drives VIP/at-risk/churned tiers immediately.
2. **CLV** — historical, then predictive (BG/NBD + Gamma-Gamma in BigQuery).
3. **Churn risk & predicted next purchase** — ML, Phase 5, BigQuery ML to start (no separate ML infra).

- **DB design:** `profile.computed` holds latest scores; `rfm_scores`, `clv` marts in warehouse.
- **Pitfall:** premium fashion has long, lumpy cycles (low frequency, high AOV). FMCG-tuned RFM thresholds mislabel best customers as "at risk." Tune for the category.
- **Admin UX:** auto-maintained smart segments ("VIPs", "About to churn", "One-time buyers", "Discount-only"), each one-click activatable.

---

## 15 & 16. Reporting & Dashboards

Make external dashboards optional — every number inside PANTHER Admin, from your data.

**Core reports:** revenue (channel/campaign/product/segment, attribution-model toggle), funnel conversion, cohort retention, CLV by acquisition cohort, channel ROAS, email/WhatsApp performance, product analytics (view→cart→purchase), customer growth, repeat-purchase rate.

**Architecture:** dashboards query **gold marts only**. Pre-aggregate; cache; sub-second loads. Postgres now: materialized views on schedule. BigQuery later: scheduled queries + caching/semantic layer (or embed Looker Studio off *your own* warehouse).

- **Pitfall:** real-time everything. Most marketing reports are fine at 15-min/hourly freshness; reserve real-time for the live ops view (flash-sale monitor).
- **Admin UX:** role-aware home (CMO → ROAS/CLV; CRM manager → segments/journeys; analyst → explorer), saved views, scheduled exports, alert thresholds.

---

## 17 & 18. Funnels & Analytics

**Funnels:** ordered step sequences (`product_viewed → added_to_cart → checkout_started → order_paid`) with a conversion window; per-step drop-off, segmentable, time-bounded. Built on sessionized, **identity-resolved** events so a funnel spans anonymous-mobile → logged-in-desktop. (Why §6 matters — session-keyed funnels under-count 30%+.)

**Analytics (self-serve):** path analysis (what precedes buying / churning), behavioral cohorts, retention curves, A/B analysis. Phase 4+. The "Amplitude/Mixpanel inside PANTHER" layer.

**Pitfall:** funnels on `session_id` instead of `profile_id` break cross-device journeys.

---

## 19. Consent Management

Legal foundation. **India DPDP Act 2023** (notice + verifiable consent, purpose limitation, data-principal rights, breach notification) governs you; EEA/GDPR + Google **Consent Mode v2** govern international traffic. Cross-cutting; gates §4, §5, §11, §12.

A **versioned consent store** keyed by profile/anonymous_id, capturing *purpose-specific* consent (analytics / marketing / personalization / each channel) with timestamp, source, policy version. The collector reads consent on every event; activation refuses third-party sends without the right purpose grant.

- **DB design:** `consent_record(subject_id,purpose,granted,version,source,ts)` — append-only full history (prove consent state at any past time).
- **Responsibilities:** CMP banner, Consent Mode v2 emission, WhatsApp/email opt-in capture, **DSAR fulfillment** (operationalized export/erase).
- **Pitfall:** consent as a single boolean — it's per-purpose, per-version, historical. Build the gate *before* enabling collection in regulated regions.
- **Admin UX:** per-profile consent timeline; one-click DSAR export/erase cascading across event store, vault, all destinations; consent-coverage reporting.

---

## 20. Future Integrations

Plugin architecture pays off. Behind `Destination`/`Channel`/`Source` interfaces:
- **Channels:** TikTok Events API, Pinterest, Snapchat, SMS (DLT-registered for India), Wallet passes.
- **Catalog:** Amazon, Flipkart, Instagram Shopping, Google Free Listings.
- **Data:** reverse-ETL to any warehouse; data clean rooms (Meta Advanced Analytics, Google Ads Data Hub) for privacy-safe measurement.
- **AI:** LLM-driven segment creation, copy generation, send-time/subject optimization. Owned first-party data is the moat.
- **Loyalty/referrals, subscriptions, returns/exchange** signals feeding CLV.

---

## 21. Scalability

- **Stateless collectors** → Cloud Run autoscale.
- **Queue as shock absorber** (pgmq → Pub/Sub): flash sales spike ingestion; consumers drain at their own pace; no data loss, no checkout impact.
- **Partition the event log** by day; tier old partitions to cold storage / BigQuery.
- **Warehouse for analytics** so OLTP stays lean.
- **Incremental everything** (segments, attribution, CLV).
- **Backpressure & rate-limit awareness** in every destination.
- **Migration = sink/host swap, not rewrite:** Supabase→Cloud SQL, pgmq→Pub/Sub, Postgres-marts→BigQuery, Node→Cloud Run/GKE.

**Capacity check:** ~20M events/day ≈ 230 events/sec avg, multi-thousand/sec peak. Trivial for queue + stateless collectors; fatal for synchronous Postgres inserts on the request path.

---

## 22. Data Ownership

The thesis. Your first-party event lake is the strategic asset. Meta/Google/Klaviyo become **replaceable destinations**, not owners of your customer graph. Raw events, identity graph, and profiles live in *your* warehouse; switch any vendor without losing history; train your own models; in a multi-brand future, each tenant's data is isolated and portable. This is what makes external dashboards optional — and what could let PANTHER become a platform others build on.

---

## 23. Privacy (by design)

- **PII vault / tokenization:** raw email/phone/name in a separate encrypted store; events carry tokens. Limits breach blast radius; makes erasure tractable (delete vault row → events de-identify).
- **Hash before share:** identifiers to Meta/Google are SHA-256 of normalized values.
- **Data minimization & retention:** raw IP only to derive geo, then discarded/hashed; per-purpose retention windows.
- **DSAR cascade** (§19) and **consent gating** (§19) are the operational teeth.
- **Pitfall:** PII leaking into `properties`, logs, exports. Enforce at the schema registry and in log scrubbing — privacy is a code-enforced invariant, not a policy doc.

---

## 24. Failure Handling

- **Idempotency everywhere:** `event_id` for events, idempotency keys for webhooks and sends. Razorpay/Delhivery/ESP webhooks *will* redeliver.
- **Dead-letter queues** for unprocessable events/messages, with reprocessing tools — never silent drops.
- **Outbox pattern** for destination dispatch: write intent transactionally, dispatch async with retries + backoff, so a Meta outage doesn't lose conversions.
- **Reconciliation jobs:** events-sent vs accepted (Meta/Google); orders-in-DB vs attributed. Surface drift as alerts.
- **Graceful degradation:** warehouse down → ingestion still queues; destination down → queue and retry; never block checkout.
- **Pitfall:** coupling checkout success to tracking success. Tracking is always best-effort and async relative to the transaction. A pixel failure must never fail an order.

---

## 25. Implementation Roadmap

Sequenced so the **invisible spine lands first** (retrofitting it is the expensive failure mode), while shipping visible value early.

### Phase 0 — Foundations (do not skip)
- **Scope:** event contract + schema registry, multi-tenant base schema, consent store, deterministic identity graph, first-party collector + queue + event lake, dedup invariant.
- **Business value:** none visible — the bedrock everything else depends on.
- **Complexity:** High · **Risk:** High if rushed · **Priority:** Highest · **Depends on:** none.

### Phase 1 — Core Tracking + Server-Side
- **Scope:** Web SDK (sandboxed pixel), server SDK, Razorpay/Delhivery webhook ingestion, **Meta CAPI + Google EC/Consent Mode v2** as first two destination plugins, dedup live.
- **Business value:** High — recover 20–40% lost signal; better ROAS today.
- **Complexity:** Medium-High · **Risk:** Medium · **Priority:** High · **Depends on:** Phase 0.

### Phase 2 — Marketing Dashboard + Attribution
- **Scope:** gold marts, funnels, channel revenue/ROAS with model toggle, Profile 360, basic reports.
- **Business value:** High — "external dashboards optional" begins; first executive-visible win.
- **Complexity:** Medium · **Risk:** Low-Medium · **Priority:** High · **Depends on:** Phase 1.

### Phase 3 — Audience Builder + CRM + Activation
- **Scope:** visual segment builder, materialization, Custom Audience / Customer Match sync, RFM, lifecycle stages, suppression lists.
- **Business value:** High — turns insight into action; marketers self-serve.
- **Complexity:** Medium-High · **Risk:** Medium · **Priority:** High · **Depends on:** Phase 2.

### Phase 4 — Channels + Marketing Automation
- **Scope:** Email (ESP + deliverability), **WhatsApp Business Platform**, durable journey engine, frequency capping/quiet hours, catalog feeds (Meta/Merchant Center).
- **Business value:** Very High — abandoned cart, win-back, retention; WhatsApp is the India multiplier.
- **Complexity:** High · **Risk:** Medium-High (deliverability, WhatsApp quality rating) · **Priority:** High · **Depends on:** Phase 3.

### Phase 5 — Predictive + AI Insights + Incrementality
- **Scope:** predictive CLV/churn (BigQuery ML), data-driven attribution, holdout/incrementality testing, path analysis, AI segment/copy assist, BigQuery migration.
- **Business value:** High — marketing science, true ROI vs correlation, efficiency at scale.
- **Complexity:** High · **Risk:** Medium · **Priority:** Medium (compounding) · **Depends on:** Phase 4 + data maturity.

---

## Additions You Didn't Ask For (and why)

1. **Incrementality / holdout testing (§7)** — without it, attribution over-credits retargeting and you overspend.
2. **Schema registry + dedup invariant (§2/§3)** — cheapest decisions now; prevent the most expensive cleanups later.
3. **Reversible identity merges (§6)** — non-reversible stitching is the most common CDP regret.
4. **PII vault + DSAR cascade (§19/§23)** — DPDP Act makes this legal exposure; design in, don't bolt on.
5. **Catalog/feed quality pipeline (§4/§5)** — premium fashion conversions depend on it; treat the feed as a product.
6. **Frequency capping across channels (§13)** — the line between a CRM customers love and one they unsubscribe from.
7. **Multi-tenancy from migration #1 (§0.4)** — the one thing you genuinely cannot add later cheaply.

## Biggest Risks (plainly)
- **Skipping Phase 0** to ship a dashboard fast — a pixel + chart is not a platform.
- **The dual identity stack (Supabase + Firebase)** — resolve §0.1 before building the identity graph.
- **Treating consent/privacy as Phase 5** — under DPDP/GDPR it's Phase 0, legally.
- **Analytics load on OLTP Postgres** — warehouse-first or it falls over at scale.

---

## Recommended Next Artifacts
1. **Event taxonomy + JSON-schema registry spec** (highest leverage — the contract everything depends on).
2. **Phase 0 concrete data model** (table definitions).
3. **Destination plugin interface spec** (Meta/Google/WhatsApp/Email).
