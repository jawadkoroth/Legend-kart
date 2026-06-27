# PANTHER Flow — Centralized Workflow & Automation Engine

PANTHER Flow is an event-driven automation engine built natively into the PANTHER platform. It functions as the orchestration layer for all customer communications, marketing operations, CRM tagging, and background tasks—acting as an internal equivalent to Shopify Flow, Zapier, or n8n.

Rather than hardcoding business logic for WhatsApp, Email, Loyalty, and AI actions, the engine allows administrators to build visual flowchart sequences where these channels serve as modular **Action Nodes**.

---

## 1. Core Architecture

The architecture separates concerns into **Triggers (Event Capture)**, **Evaluation (CDP State Checking)**, and **Execution (Background Queue Jobs)**.

```
       [ Client / Server Event ]
                   │
                   ▼
  ┌─────────────────────────────────┐
  │      Marketing Dispatcher       │
  │     (Persists Event to DB)      │
  └────────────────┬────────────────┘
                   │
                   ▼
  ┌─────────────────────────────────┐
  │     Stitching Identity Engine   │
  │  (Stitches customer, updates    │
  │    scores & segment profile)    │
  └────────────────┬────────────────┘
                   │
                   ▼
  ┌─────────────────────────────────┐
  │     Workflow Engine Trigger     │
  │    (Loads matching workflows)   │
  └────────────────┬────────────────┘
                   │
                   ▼
  ┌─────────────────────────────────┐
  │      Workflow Runtime Loop      │◄───────────┐
  │   - Condition Evaluation        │            │ (Workflow Resume)
  │   - Action Execution            │            │
  │   - Delay Rescheduling          │            │
  └────────────────┬────────────────┘            │
                   │ (If Delay/Wait node)        │
                   ▼                             │
  ┌─────────────────────────────────┐     ┌──────┴──────────────────┐
  │     System Job Queue (Postgres) │────►│ Background Cron Runner  │
  │   (Schedules resumption task)   │     │   (Drains every min)    │
  └─────────────────────────────────┘     └─────────────────────────┘
```

---

## 2. Node Types & Configurations

### A. Trigger Node (Flow Origin)
Listens for a specific system event payload. The engine supports the following triggers directly resolved from the Marketing Event Registry:
- **`registration_completed`**: Customer creates an account.
- **`product_viewed`**: Product detail page view.
- **`checkout_started`**: Customer initiates cart checkout.
- **`order_created`**: New order created in database.
- **`order_paid`**: Successful capture of order payments.
- **`order_delivered`**: Shipping status updated to completed.
- **`return_requested`**: Customer files a product return.
- **`exchange_requested`**: Customer requests an item exchange.
- **`manual`**: Manually triggered from the admin console.

### B. Condition Node (Branching)
Evaluates rules against the resolved customer profile and trigger event payload. Supports logical operators (`AND` / `OR`) and operators (`==`, `!=`, `>`, `>=`, `<`, `<=`, `contains`, `not_contains`, `in`):
- **`ltv`**: Lifetime Value in standard currency (converted from paise).
- **`segment`**: Cohort check (e.g. VIP, High Spender, Repeat Customer).
- **`tag`**: Customer profile tags.
- **`country`**: Matches order shipping addresses or client IP context.
- **`order_value`**: Checks active cart subtotal or order values.
- **`purchased_count`**: Total completed order counts.
- **`has_whatsapp` / `has_email`**: Profile preference opt-in status.
- **`category`**: Trigger event item categorizations.
- **`campaign_source`**: UTM parameters or attribution references.

### C. Action Node (Execution Blocks)
Performs immediate operational actions:
- **`send_internal_notification`**: Enqueues an admin push notification task.
- **`add_tag` / `remove_tag`**: Modifies the `customer_profiles.tags` array.
- **`add_segment` / `remove_segment`**: Controls customer relationships in `customer_segments`.
- **`create_admin_note`**: Inserts internal notes associated with an order ID.
- **`generate_coupon`**: Inserts a new single-use discount coupon code.
- **`apply_coupon`**: Associates a coupon code with a customer's `applied_coupons` list.
- **`http_request` / `webhook`**: Invokes an outbound external HTTP request.
- **`execute_another_workflow`**: Invokes a sub-flow recursively.

### D. Delay / Wait Until Node (Temporal Pause)
- **`delay`**: Pauses flow execution for a set duration (minutes, hours, days).
- **`wait_until`**: Pauses flow execution until a specific target date-time.

---

## 3. Execution Engine & State Resumption

### Traversal Loop
Workflows are stored as structural trees. Traversal proceeds node by node:
1. When an event fires, the engine resolves the customer profile ID and initiates a `workflow_execution` record with status `started`.
2. It executes nodes sequentially in a loop.
3. If an **Action** node executes successfully, it proceeds to `nextNodeId`.
4. If a **Condition** node evaluates, it branches and proceeds to `trueNodeId` or `falseNodeId`.
5. If a **Delay** is hit, the engine:
   - Calculates the target resume date-time.
   - Enqueues a `workflow.resume` job in the system `job_queue` using `run_at = targetTime`.
   - Saves current logs, sets status to `running`, and breaks the execution thread.
6. The background cron runner (`/api/jobs/run`) claims the resume job when it is due, claims the lock, and calls `resumeWorkflowExecution` to pick up traversal exactly where it paused.

### Logging & Diagnostics
Every execution records detailed steps in `workflow_executions.logs` containing:
- **Timestamp** (including milliseconds)
- **Node ID & Node Name**
- **Node Type** (trigger, condition, action, delay, system)
- **Status indicator** (`info`, `success`, `failed`, `paused`)
- **Message** (e.g. condition evaluation results, HTTP status codes, applied tag names, generated coupon codes).

---

## 4. Replay Strategy

When a node fails (e.g., an outbound webhook fails, or an API service is temporarily down), the execution transitions to `failed` and stores the error message.

To replay a failed execution:
1. The administrator clicks **Rerun / Replay** on the Execution Details page.
2. The endpoint `/api/admin/automation/executions/[id]/replay` is POSTed.
3. The engine increments the execution's `retry_count`, appends a replay log entry, and resets `status` to `started`.
4. The traversal loop is triggered asynchronously from the start node, utilizing the original `trigger_payload` saved inside the execution row. This ensures exact fidelity rerun without needing to duplicate events.

---

## 5. Future Extension Points

The engine is built to be easily extended as new communication services are onboarded:
- **WhatsApp Action Node**: Extend the execution parser in `src/lib/workflow/engine.ts` for `'send_whatsapp'`. It will pull the template identifier, query customer phone number, and schedule a WhatsApp template API dispatch job.
- **Email Marketing Node**: Transition from the current mock email actions to a direct transactional CRM resend service (hooking into `src/lib/email` Resend configuration).
- **AI Automation Node**: Hook condition branches or email draft generation into an LLM call block (`'ai_draft_response'`) using AI APIs to automatically reply to support alerts.
