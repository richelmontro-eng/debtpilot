import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

function go(request: NextRequest, path: string) { return NextResponse.redirect(new URL(path, request.nextUrl.origin)); }

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  try {
    const supabase = await createClient();
    let error: unknown = null;
    if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
    else if (tokenHash) ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }));
    else return go(request, '/auth/recovery-expired');
    if (error) return go(request, '/auth/recovery-expired');
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    return userError || !user ? go(request, '/auth/recovery-expired') : go(request, '/reset-password');
  } catch { return go(request, '/auth/recovery-expired'); }
}
