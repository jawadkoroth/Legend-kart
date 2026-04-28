/**
 * Format a paise integer as Indian Rupee currency.
 *
 * The whole codebase stores money as `*_paise: integer` to avoid
 * floating-point drift. UI surfaces always go through this helper so
 * grouping (lakhs/crores) and the `₹` symbol stay consistent.
 *
 * @example formatPaise(129900) // "₹1,299"
 */
export function formatPaise(paise: number | null | undefined): string {
  const safe = typeof paise === 'number' && Number.isFinite(paise) ? paise : 0;
  const rupees = safe / 100;
  return (
    '₹' +
    new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: rupees % 1 === 0 ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(rupees)
  );
}
