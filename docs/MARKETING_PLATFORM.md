# PANTHER Centralized Marketing Platform

This document describes the design, implementation, and expansion procedures for the PANTHER Centralized Marketing Platform (Sprint 1.5 - Architecture Refinement).

---

## 1. Architecture Overview

Rather than scattering multiple tracking pixels (Meta Pixel, GA4, Google Ads tags, custom webhooks) across the user experience, the PANTHER platform uses a centralized **Internal Platform Service** architecture.

```
┌─────────────────────────────────────────────────────────┐
│                 Application Components                  │
│  (Page navigation, clicks, checkouts, order completion)  │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│              Marketing Platform Service                 │
│      (Public interface: track, page, identify)          │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│            Canonical Registry & Validation              │
│       (Validates schema, type, currency values)         │
└──────────────┬────────────────────────────┬─────────────┘
               │                            │
      (If validation fails)        (If validation passes)
               ▼                            ▼
┌───────────────────────────────┐ ┌───────────────────────┐
│    Dead Letter Queue (DLQ)    │ │    In-Memory Queue    │
│  (Quarantined for manual      │ │ (Async buffering,     │
│   inspection and replaying)   │ │  exponential retries) │
└───────────────────────────────┘ └─────────┬─────────────┘
                                            │
                                            ▼
┌───────────────────────────────────────────┴─────────────┐
│                    Event Dispatcher                     │
│  (Enforces capabilities, checks flags and consent)      │
└──────────────┬─────────────┬──────────────┬─────────────┘
               │             │              │
               ▼             ▼              ▼
         ┌───────────┐ ┌───────────┐ ┌─────────────┐
         │   Meta    │ │  Google   │ │   Console   │
         │ (Mock CAPI│ │ (Mock GA4 │ │   Logger    │
         │  + Pixel) │ │  + GTM)   │ │ (Dev Log)   │
         └───────────┘ └───────────┘ └─────────────┘
```

The system operates on **three layers**:
1. **Client-Side (Browser)**: Collects user interactions via `MarketingPlatformService`, validates against schema guidelines, batches events in an in-memory queue, and POSTs payloads asynchronously.
2. **Quarantine & Queue Control (DLQ & In-Memory)**: Events failing validation or destination delivery are quarantined into the DLQ directly inside the `marketing_events` database, maintaining zero-data-loss configurations.
3. **Server Ingestion & Capability Gate**: Receives event payloads, evaluates feature flags (e.g. `marketing.meta`), maps payload properties to provider capabilities, and writes duration outcomes.

---

## 2. Public Platform Service API

All frontend pages and components trigger event telemetry solely through the public `MarketingPlatformService` object (defined in `src/lib/marketing/service.ts`). Direct access to the dispatcher is prohibited.

```typescript
export const MarketingPlatformService = {
  track(eventName: MarketingEventName, properties?: Record<string, any>, userId?: string | null): void;
  page(url?: string, path?: string, title?: string, referrer?: string, userId?: string | null): void;
  identify(userId: string | null, traits?: Record<string, any>): void;
  consent(state: Partial<ConsentState>, subjectId: string): void;
  alias(userId: string, previousId: string): void;
  group(groupId: string, traits?: Record<string, any>, userId?: string | null): void;
  screen(name: string, properties?: Record<string, any>, userId?: string | null): void;
}
```

---

## 3. Canonical Event Registry & Validation

The system enforces a closed event taxonomy inside `src/lib/marketing/registry.ts`. The validation engine checks:
* **Required Properties**: Basic identifiers (`anonymousId`, `sessionId`) and event specific attributes (e.g. `price` for `product_viewed`).
* **Parameter Data Types**: Verifies property types (e.g., verifying `price` is a number, not a string).
* **Currency Formatting**: Checks standard three-letter uppercase ISO-4217 formatting (e.g. `INR`, `USD`).
* **Deprecation status**: Disables logs for events flagged as `'hidden'`.

If validation fails, the event is immediately flagged as `in_dlq = true`, populated with `validation_errors`, and bypassed from dispatch processing.

---

## 4. Provider Capabilities

Instead of assuming all providers process all events identically, each provider registers its specific `capabilities` (defined in `src/lib/marketing/types.ts`):

```typescript
export interface ProviderCapabilities {
  supportsPageViews: boolean;
  supportsPurchases: boolean;
  supportsBatchDispatch: boolean;
  supportsRealtime: boolean;
  supportsIdentify: boolean;
  supportsOfflineQueue: boolean;
  supportsTestConnection: boolean;
  supportsReplay: boolean;
  supportsConsent: boolean;
}
```

The dispatcher dynamically queries this capability interface before routing events, requiring zero code adjustments to the dispatcher when new destination platforms are attached.

---

## 5. Correlation Journeys & Waterfalls

Every customer session generates a unique `correlationId` stored in browser `sessionStorage`. 
* Chronological interactions are automatically tagged with this Correlation ID.
* The Admin Event Inspector groups logs by Correlation ID, rendering a visual waterfall pipeline representing customer paths, timings, latencies, and outcomes.

---

## 6. Dead Letter Queue & Replays

Failed event logs (validation errors, multiple connection drops) are quarantined into the DLQ. Administrators can manage these in the Admin Settings tab:
* **Inspect**: Read precise failure details.
* **Replay**: Click to clone the event, reset IDs, update timestamps, and stream it again through the dispatcher pipeline.
* **Dismiss**: Remove invalid events.

---

## 7. Adding a New Platform Service

To mount a new internal platform engine matching the Marketing Architecture pattern (e.g., Notifications or Shipping):
1. Create a corresponding types mapping (`src/lib/<service>/types.ts`).
2. Add a service wrapper (`src/lib/<service>/service.ts`) encapsulating the API interface.
3. Design a database state log with RLS policies, indexing, and diagnostics indicators.
4. Integrate toggle feature flags in the database features table to allow hot toggles without code commits.
