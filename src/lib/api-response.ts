import { NextResponse } from 'next/server';

export function apiError(status: number, message: string, details?: unknown) {
  return NextResponse.json(
    { success: false, error: message, details },
    { status }
  );
}

export function apiSuccess(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(
    { success: true, ...data },
    { status }
  );
}
