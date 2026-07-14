import { NextResponse, type NextRequest } from 'next/server';
import { getConfirmationDestination, getEmailOtpType, verifyEmailToken } from '@/lib/auth-confirm';
import { createClient } from '@/lib/supabase/server';

function redirect(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.nextUrl.origin));
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = getEmailOtpType(request.nextUrl.searchParams.get('type'));
  const next = request.nextUrl.searchParams.get('next');

  if (!tokenHash || !type) return redirect(request, '/auth/error');
  const errorPath = type === 'email_change' ? '/auth/error?context=email-change' : '/auth/error';

  try {
    const supabase = await createClient();
    if (!await verifyEmailToken(supabase.auth, tokenHash, type)) return redirect(request, errorPath);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return redirect(request, errorPath);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileError) return redirect(request, errorPath);

    return redirect(request, getConfirmationDestination(Boolean(profile?.onboarding_completed), next));
  } catch {
    return redirect(request, errorPath);
  }
}
