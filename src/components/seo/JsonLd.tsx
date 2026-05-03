/**
 * SSR-only JSON-LD script injector.
 *
 * Rendered on the server (no `'use client'`) so the payload lands
 * in the initial HTML — crawlers never run JS, so client-side
 * injection fails SEO silently.
 *
 * Pass `null` / `undefined` data to opt a conditional schema out
 * without a wrapper conditional at the call site.
 *
 * We render one <script> per payload. Google's parser handles both
 * single objects and arrays, but separate tags are easier to debug
 * in Rich Results Test and cheap in bytes.
 */
export function JsonLd({ data }: { data: unknown }) {
  if (data === null || data === undefined) return null;
  const serialised = JSON.stringify(data);
  // The payload is built from our own code — no user input — so
  // `dangerouslySetInnerHTML` is the correct escape here. Script
  // injection via HTML-escaped JSON would break the JSON-LD parser.
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: serialised }}
    />
  );
}
