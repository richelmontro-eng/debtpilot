type AuthError = { message?: string; code?: string; status?: number } | null | undefined;

export function validateEmailChange(currentEmail: string, newEmail: string, confirmation: string): string | null {
  const current = currentEmail.trim().toLowerCase();
  const next = newEmail.trim().toLowerCase();
  const confirmed = confirmation.trim().toLowerCase();
  if (!next || !confirmed) return 'Enter and confirm your new email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) return 'Enter a valid email address.';
  if (next !== confirmed) return 'Email addresses do not match.';
  if (next === current) return 'Your new email must be different from your current email.';
  return null;
}

export function requiresReauthentication(error: AuthError) {
  return error?.status === 401 || /reauth|recent|session.*(old|expired)|aal|nonce/.test(`${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase());
}

export function mapEmailChangeError(error: AuthError) {
  return requiresReauthentication(error)
    ? 'Please verify your identity before continuing.'
    : 'We couldn’t start your email change. Please try again.';
}

export function mapSensitiveActionError(error: AuthError) {
  return requiresReauthentication(error)
    ? 'Please verify your identity before continuing.'
    : 'We couldn’t complete that security action. Please try again.';
}

export function getSignOutScope(allDevices: boolean): 'local' | 'global' {
  return allDevices ? 'global' : 'local';
}
