import type { EmailOtpType } from '@supabase/supabase-js';

const emailOtpTypes = new Set<EmailOtpType>(['email', 'signup', 'invite', 'magiclink', 'recovery', 'email_change']);

export function getEmailOtpType(value: string | null): EmailOtpType | null {
  return value && emailOtpTypes.has(value as EmailOtpType) ? value as EmailOtpType : null;
}

export function getSafeInternalPath(value: string | null, fallback = '/') {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || decoded.includes('\\')) return fallback;
    const parsed = new URL(value, 'https://debtpilot.local');
    if (parsed.origin !== 'https://debtpilot.local') return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function getConfirmationDestination(onboardingCompleted: boolean, next: string | null) {
  return onboardingCompleted ? getSafeInternalPath(next) : '/welcome';
}

export async function verifyEmailToken(
  auth: { verifyOtp: (params: { token_hash: string; type: EmailOtpType }) => Promise<{ error: unknown }> },
  tokenHash: string,
  type: EmailOtpType,
) {
  const { error } = await auth.verifyOtp({ token_hash: tokenHash, type });
  return !error;
}
