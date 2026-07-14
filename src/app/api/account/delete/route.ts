import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return NextResponse.json({ error: 'Account deletion is not configured.' }, { status: 503 });
  }

  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let body: { confirmation?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const authClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userError } = await authClient.auth.getUser(accessToken);

  if (userError || !user?.email) {
    return NextResponse.json({ error: 'Your session could not be verified. Please sign in again.' }, { status: 401 });
  }

  if (body.confirmation?.trim().toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: 'Enter your full email address to confirm deletion.' }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

  if (deleteError) {
    if (process.env.NODE_ENV !== 'production') console.error('[DebtPilot account deletion]', { code: deleteError.code, message: deleteError.message });
    return NextResponse.json({ error: 'We couldn’t delete your account. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
