import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiSuccess, apiError } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, phone, message } = body;

    if (!email || !message) {
      return apiError(400, 'Email and message are required');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiError(400, 'Invalid email address');
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('feedback')
      .insert({
        email: email.trim(),
        phone: phone?.trim() || null,
        message: message.trim(),
      });

    if (error) {
      console.error('[FEEDBACK_ERROR]', error);
      return apiError(500, 'Failed to submit feedback');
    }

    console.log(`[FEEDBACK] from ${email}`);
    return apiSuccess({ submitted: true }, 201);
  } catch (err) {
    console.error('[FEEDBACK_ERROR]', err);
    return apiError(500, 'Internal server error');
  }
}
