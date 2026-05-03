'use client';

import { usePathname } from 'next/navigation';

/**
 * Path-aware gate around the footer.
 *
 * The footer is rendered server-side and passed in as `children`.
 * This client wrapper only decides visibility — the children
 * payload still streams from the server with no extra hydration
 * cost when shown.
 *
 * Routes hidden:
 *   /admin/*       — internal surface, has its own chrome
 *   /auth/*        — focused auth flow; footer would be noise
 *   /cart, /checkout — focused commerce; do not distract
 *
 * We deliberately KEEP the footer on:
 *   /profile/*     — the brand surface continues there
 *   /orders/*      — same
 *   /legal/*       — siblings need the discoverable nav back
 */
export default function FooterGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || '/';
  const hidden =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/auth') ||
    pathname === '/cart' ||
    pathname.startsWith('/checkout');

  if (hidden) return null;
  return <>{children}</>;
}
