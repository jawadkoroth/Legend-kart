import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { JobActions } from './JobActions';

/**
 * NOIR Admin — Diagnostics surface.
 *
 * Single read-only window into the two operational tables we ship in
 * this hardening pass:
 *
 *   * app_events  — every server-side `logEvent` call lands here.
 *   * job_queue   — every async unit (email, push) waiting / running /
 *                   retrying / dead.
 *
 * Read access is enforced by RLS (admin_users membership). The
 * protected layout above us already verifies the session, so we can
 * use the SSR cookie-bound client directly and let the policy do the
 * gating. No service-role here — keeping admin reads RLS-policed
 * means a leaked admin session can't escalate to system-level data.
 *
 * Filters live in the URL (?tab, ?severity, ?source, ?q, ?request_id,
 * ?status, ?kind) so links can be shared, browser back works, and
 * the server can re-render with fresh data on every navigation.
 */

export const dynamic = 'force-dynamic';

type Tab = 'events' | 'jobs';

const SEVERITIES = ['debug', 'info', 'warn', 'error', 'fatal'] as const;
const SOURCES = ['api', 'job', 'webhook', 'admin', 'system', 'cron'] as const;
const STATUSES = ['queued', 'running', 'succeeded', 'failed', 'dead'] as const;

const PAGE_SIZE = 100;

interface AppEventRow {
  id: string;
  created_at: string;
  severity: string;
  source: string;
  event: string;
  request_id: string | null;
  actor_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
}

interface JobRow {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  max_attempts: number;
  run_at: string;
  locked_at: string | null;
  lease_until: string | null;
  last_error: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  payload: Record<string, unknown>;
}

interface CountsByStatus {
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  dead: number;
}

export default async function DiagnosticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    severity?: string;
    source?: string;
    q?: string;
    request_id?: string;
    entity_id?: string;
    status?: string;
    kind?: string;
  }>;
}) {
  const sp = await searchParams;
  const tab: Tab = sp.tab === 'jobs' ? 'jobs' : 'events';
  const supabase = await createServerSupabaseClient();

  // Job-queue summary always renders in the header so admins can see
  // dead-letter pressure regardless of which tab they're on.
  const counts = await loadJobCounts(supabase);

  return (
    <div style={{ padding: 'var(--space-4)' }}>
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '1.5rem',
            margin: 0,
          }}
        >
          Diagnostics
        </h1>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: '0.85rem',
            margin: 0,
          }}
        >
          Structured logs and async job queue. Read-only — except for
          dead-letter retry / discard.
        </p>
        <JobSummary counts={counts} />
        <Tabs active={tab} sp={sp} />
      </header>

      {tab === 'events' ? (
        <EventsView sp={sp} />
      ) : (
        <JobsView sp={sp} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Job summary header                                                  */
/* ------------------------------------------------------------------ */

function JobSummary({ counts }: { counts: CountsByStatus }) {
  const cards: Array<{ label: string; value: number; tone: string }> = [
    { label: 'Queued', value: counts.queued, tone: 'var(--text)' },
    { label: 'Running', value: counts.running, tone: 'var(--accent)' },
    { label: 'Failed', value: counts.failed, tone: 'var(--warn, #b45309)' },
    { label: 'Dead', value: counts.dead, tone: 'var(--error, #b91c1c)' },
  ];
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 'var(--space-2)',
        marginTop: 'var(--space-2)',
      }}
    >
      {cards.map(c => (
        <div
          key={c.label}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 'var(--space-2)',
          }}
        >
          <div
            style={{
              fontSize: '0.7rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            {c.label}
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 600,
              color: c.tone,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

function Tabs({
  active,
  sp,
}: {
  active: Tab;
  sp: { request_id?: string; entity_id?: string };
}) {
  // Preserve cross-tab search keys (request_id, entity_id) so an
  // admin drilling into "everything for this order" can flip between
  // events and the related job rows without losing the filter.
  const carry = new URLSearchParams();
  if (sp.request_id) carry.set('request_id', sp.request_id);
  if (sp.entity_id) carry.set('entity_id', sp.entity_id);
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'events', label: 'Events' },
    { id: 'jobs', label: 'Jobs' },
  ];
  return (
    <nav
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        borderBottom: '1px solid var(--border)',
        marginTop: 'var(--space-2)',
      }}
    >
      {tabs.map(t => {
        const params = new URLSearchParams(carry);
        params.set('tab', t.id);
        const isActive = active === t.id;
        return (
          <Link
            key={t.id}
            href={`/admin/diagnostics?${params.toString()}`}
            style={{
              padding: 'var(--space-2) 0',
              borderBottom: `2px solid ${isActive ? 'var(--text)' : 'transparent'}`,
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              fontWeight: isActive ? 600 : 400,
              textDecoration: 'none',
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Events view                                                         */
/* ------------------------------------------------------------------ */

async function EventsView({
  sp,
}: {
  sp: {
    severity?: string;
    source?: string;
    q?: string;
    request_id?: string;
    entity_id?: string;
  };
}) {
  const supabase = await createServerSupabaseClient();

  // Build the query progressively — every filter is optional. We
  // cap at PAGE_SIZE rows because the page is intended for triage
  // not pagination; deep-history forensics happens in SQL.
  let query = supabase
    .from('app_events')
    .select(
      'id, created_at, severity, source, event, request_id, actor_id, entity_type, entity_id, metadata',
    )
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (sp.severity && (SEVERITIES as readonly string[]).includes(sp.severity)) {
    query = query.eq('severity', sp.severity);
  }
  if (sp.source && (SOURCES as readonly string[]).includes(sp.source)) {
    query = query.eq('source', sp.source);
  }
  if (sp.request_id) {
    query = query.eq('request_id', sp.request_id);
  }
  if (sp.entity_id) {
    query = query.eq('entity_id', sp.entity_id);
  }
  if (sp.q) {
    // ILIKE on event name. Substring match is enough for triage;
    // metadata search is intentionally out of scope to keep the
    // index plan predictable (idx_app_events_event_created).
    query = query.ilike('event', `%${sp.q}%`);
  }

  const { data, error } = await query;
  const rows = (data ?? []) as AppEventRow[];

  return (
    <section>
      <EventsFilters sp={sp} />
      {error && (
        <p style={{ color: 'var(--error, #b91c1c)' }}>
          Failed to load events: {error.message}
        </p>
      )}
      {!error && rows.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No events match.</p>
      )}
      {rows.length > 0 && <EventsTable rows={rows} />}
    </section>
  );
}

function EventsFilters({
  sp,
}: {
  sp: {
    severity?: string;
    source?: string;
    q?: string;
    request_id?: string;
    entity_id?: string;
  };
}) {
  return (
    <form
      method="GET"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-2)',
        margin: 'var(--space-3) 0',
        alignItems: 'flex-end',
      }}
    >
      <input type="hidden" name="tab" value="events" />
      <Field label="Severity">
        <select
          name="severity"
          defaultValue={sp.severity ?? ''}
          style={selectStyle}
        >
          <option value="">any</option>
          {SEVERITIES.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Source">
        <select name="source" defaultValue={sp.source ?? ''} style={selectStyle}>
          <option value="">any</option>
          {SOURCES.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Event contains">
        <input
          name="q"
          defaultValue={sp.q ?? ''}
          placeholder="e.g. payment."
          style={inputStyle}
        />
      </Field>
      <Field label="Request ID">
        <input
          name="request_id"
          defaultValue={sp.request_id ?? ''}
          placeholder="x-request-id"
          style={inputStyle}
        />
      </Field>
      <Field label="Entity ID">
        <input
          name="entity_id"
          defaultValue={sp.entity_id ?? ''}
          placeholder="order id, etc."
          style={inputStyle}
        />
      </Field>
      <button type="submit" style={primaryBtnStyle}>
        Apply
      </button>
      <Link
        href="/admin/diagnostics?tab=events"
        style={{
          ...secondaryBtnStyle,
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        Clear
      </Link>
    </form>
  );
}

function EventsTable({ rows }: { rows: AppEventRow[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.85rem',
        }}
      >
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
            <th style={thStyle}>When</th>
            <th style={thStyle}>Sev</th>
            <th style={thStyle}>Src</th>
            <th style={thStyle}>Event</th>
            <th style={thStyle}>Entity</th>
            <th style={thStyle}>Request</th>
            <th style={thStyle}>Metadata</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr
              key={r.id}
              style={{
                borderBottom: '1px solid var(--border)',
                verticalAlign: 'top',
              }}
            >
              <td style={tdStyle}>{formatTime(r.created_at)}</td>
              <td style={tdStyle}>
                <SeverityChip severity={r.severity} />
              </td>
              <td style={tdStyle}>
                <code style={codeStyle}>{r.source}</code>
              </td>
              <td style={tdStyle}>
                <code style={codeStyle}>{r.event}</code>
              </td>
              <td style={tdStyle}>
                {r.entity_type && r.entity_id ? (
                  <Link
                    href={`/admin/diagnostics?tab=events&entity_id=${encodeURIComponent(
                      r.entity_id,
                    )}`}
                    style={linkStyle}
                  >
                    {r.entity_type}:{shorten(r.entity_id)}
                  </Link>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                )}
              </td>
              <td style={tdStyle}>
                {r.request_id ? (
                  <Link
                    href={`/admin/diagnostics?tab=events&request_id=${encodeURIComponent(
                      r.request_id,
                    )}`}
                    style={linkStyle}
                  >
                    {shorten(r.request_id)}
                  </Link>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                )}
              </td>
              <td style={{ ...tdStyle, maxWidth: 360 }}>
                <MetaPreview metadata={r.metadata} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Jobs view                                                           */
/* ------------------------------------------------------------------ */

async function JobsView({
  sp,
}: {
  sp: { status?: string; kind?: string; q?: string };
}) {
  const supabase = await createServerSupabaseClient();

  // Default sort: most recently updated first — matches "what just
  // happened" mental model when investigating dead letters.
  let query = supabase
    .from('job_queue')
    .select(
      'id, kind, status, attempts, max_attempts, run_at, locked_at, lease_until, last_error, idempotency_key, created_at, updated_at, payload',
    )
    .order('updated_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (sp.status && (STATUSES as readonly string[]).includes(sp.status)) {
    query = query.eq('status', sp.status);
  }
  if (sp.kind) {
    query = query.eq('kind', sp.kind);
  }
  if (sp.q) {
    query = query.ilike('kind', `%${sp.q}%`);
  }

  const { data, error } = await query;
  const rows = (data ?? []) as JobRow[];

  return (
    <section>
      <JobsFilters sp={sp} />
      {error && (
        <p style={{ color: 'var(--error, #b91c1c)' }}>
          Failed to load jobs: {error.message}
        </p>
      )}
      {!error && rows.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No jobs match.</p>
      )}
      {rows.length > 0 && <JobsTable rows={rows} />}
    </section>
  );
}

function JobsFilters({
  sp,
}: {
  sp: { status?: string; kind?: string; q?: string };
}) {
  return (
    <form
      method="GET"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-2)',
        margin: 'var(--space-3) 0',
        alignItems: 'flex-end',
      }}
    >
      <input type="hidden" name="tab" value="jobs" />
      <Field label="Status">
        <select name="status" defaultValue={sp.status ?? ''} style={selectStyle}>
          <option value="">any</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Kind">
        <input
          name="kind"
          defaultValue={sp.kind ?? ''}
          placeholder="email.order_created"
          style={inputStyle}
        />
      </Field>
      <button type="submit" style={primaryBtnStyle}>
        Apply
      </button>
      <Link
        href="/admin/diagnostics?tab=jobs"
        style={{
          ...secondaryBtnStyle,
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        Clear
      </Link>
    </form>
  );
}

function JobsTable({ rows }: { rows: JobRow[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.85rem',
        }}
      >
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
            <th style={thStyle}>Updated</th>
            <th style={thStyle}>Kind</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Attempts</th>
            <th style={thStyle}>Run at</th>
            <th style={thStyle}>Last error</th>
            <th style={thStyle}>Payload</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(j => (
            <tr
              key={j.id}
              style={{
                borderBottom: '1px solid var(--border)',
                verticalAlign: 'top',
              }}
            >
              <td style={tdStyle}>{formatTime(j.updated_at)}</td>
              <td style={tdStyle}>
                <code style={codeStyle}>{j.kind}</code>
              </td>
              <td style={tdStyle}>
                <StatusChip status={j.status} />
              </td>
              <td style={tdStyle}>
                {j.attempts} / {j.max_attempts}
              </td>
              <td style={tdStyle}>{formatTime(j.run_at)}</td>
              <td style={{ ...tdStyle, maxWidth: 280 }}>
                {j.last_error ? (
                  <span
                    style={{
                      color: 'var(--error, #b91c1c)',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: '0.75rem',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                    title={j.last_error}
                  >
                    {j.last_error}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                )}
              </td>
              <td style={{ ...tdStyle, maxWidth: 320 }}>
                <MetaPreview metadata={j.payload} />
              </td>
              <td style={tdStyle}>
                {j.status === 'dead' || j.status === 'failed' ? (
                  <JobActions id={j.id} status={j.status} />
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function loadJobCounts(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<CountsByStatus> {
  // One round trip per status. PostgREST has no GROUP BY; the
  // alternatives (RPC, raw select then count) are heavier than five
  // bounded `head: true` counts on a status-indexed table.
  const empty: CountsByStatus = {
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    dead: 0,
  };
  const results = await Promise.all(
    STATUSES.map(async s => {
      const { count } = await supabase
        .from('job_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', s);
      return [s, count ?? 0] as const;
    }),
  );
  const out = { ...empty };
  for (const [s, n] of results) {
    out[s] = n;
  }
  return out;
}

function SeverityChip({ severity }: { severity: string }) {
  const tone =
    severity === 'fatal' || severity === 'error'
      ? { bg: '#fee2e2', fg: '#991b1b' }
      : severity === 'warn'
        ? { bg: '#fef3c7', fg: '#92400e' }
        : severity === 'debug'
          ? { bg: '#e0e7ff', fg: '#3730a3' }
          : { bg: '#e5e7eb', fg: '#374151' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: '0.7rem',
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        background: tone.bg,
        color: tone.fg,
      }}
    >
      {severity}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === 'dead'
      ? { bg: '#fee2e2', fg: '#991b1b' }
      : status === 'failed'
        ? { bg: '#fef3c7', fg: '#92400e' }
        : status === 'running'
          ? { bg: '#dbeafe', fg: '#1e40af' }
          : status === 'succeeded'
            ? { bg: '#dcfce7', fg: '#166534' }
            : { bg: '#e5e7eb', fg: '#374151' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: '0.7rem',
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        background: tone.bg,
        color: tone.fg,
      }}
    >
      {status}
    </span>
  );
}

function MetaPreview({ metadata }: { metadata: Record<string, unknown> }) {
  let text: string;
  try {
    text = JSON.stringify(metadata);
  } catch {
    text = '[unserializable]';
  }
  if (!text || text === '{}') {
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  }
  return (
    <code
      title={text}
      style={{
        ...codeStyle,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        fontSize: '0.7rem',
      }}
    >
      {text}
    </code>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
      }}
    >
      {label}
      {children}
    </label>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Compact local timestamp; we trade precision for table density.
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function shorten(s: string): string {
  if (s.length <= 14) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

/* ------------------------------------------------------------------ */
/* Inline style fragments                                              */
/* ------------------------------------------------------------------ */

const thStyle: React.CSSProperties = {
  padding: 'var(--space-2)',
  fontSize: '0.7rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: 'var(--space-2)',
  whiteSpace: 'nowrap',
};

const codeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: '0.75rem',
};

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: '0.85rem',
  minWidth: 160,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  minWidth: 120,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  border: '1px solid var(--text)',
  background: 'var(--text)',
  color: 'var(--bg)',
  borderRadius: 'var(--radius)',
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text)',
  borderRadius: 'var(--radius)',
  fontSize: '0.85rem',
  cursor: 'pointer',
};

const linkStyle: React.CSSProperties = {
  color: 'var(--accent, #2563eb)',
  textDecoration: 'underline',
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: '0.75rem',
};
