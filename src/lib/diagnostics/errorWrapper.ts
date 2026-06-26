/**
 * PANTHER — Better Database Error Diagnostics
 * Intercepts Postgres and Supabase errors to provide actionable migration suggestions.
 */

export function getMigrationAdvice(error: any): string | null {
  if (!error) return null;

  // Extract code and message from various possible error formats
  const errCode = String(error.code || error.status_code || error.hint || '');
  const errMsg = String(error.message || error.details || (typeof error === 'string' ? error : ''));

  // 1. Column does not exist (Postgres code 42703)
  if (errCode === '42703' || errMsg.includes('column') && errMsg.includes('does not exist')) {
    if (errMsg.includes('media')) {
      return 'Possible missing migration. Expected: 031_product_premium_features (Missing: products.media column)';
    }
  }

  // 2. Table does not exist (Postgres code 42P01)
  if (errCode === '42P01' || errMsg.includes('relation') && errMsg.includes('does not exist')) {
    if (errMsg.includes('product_story_sections')) {
      return 'Possible missing migration. Expected: 031_product_premium_features (Missing table: product_story_sections)';
    }
    if (errMsg.includes('product_coupons')) {
      return 'Possible missing migration. Expected: 031_product_premium_features (Missing table: product_coupons)';
    }
    if (errMsg.includes('admin_fcm_tokens')) {
      return 'Possible missing migration. Expected: 028_fcm_tokens (Missing table: admin_fcm_tokens)';
    }
    if (errMsg.includes('job_queue')) {
      return 'Possible missing migration. Expected: 017_job_queue (Missing table: job_queue)';
    }
    if (errMsg.includes('app_events')) {
      return 'Possible missing migration. Expected: 016_app_events (Missing table: app_events)';
    }
    if (errMsg.includes('coupons')) {
      return 'Possible missing migration. Expected: 011_coupons_segmentation (Missing table: coupons)';
    }
  }

  return null;
}

/**
 * Enhances a log payload with migration advice if a database error is detected.
 */
export function enhanceLogPayload(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!data) return data;

  // Search recursively or directly in common fields for errors
  const errCandidate = data.error || data.err || data.db_error || data;
  const advice = getMigrationAdvice(errCandidate);

  if (advice) {
    // Print warning loud in development stdout
    if (process.env.NODE_ENV === 'development') {
      console.warn(`\n⚠️ [PANTHER_DIAGNOSTIC] ${advice}\n`);
    }
    return {
      ...data,
      migration_advice: advice
    };
  }

  return data;
}
