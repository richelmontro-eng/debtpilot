export const PASSWORD_MIN_LENGTH = 10;
export const RESET_SENT_MESSAGE = 'If an account exists for this email, we sent password-reset instructions.';

export function validateNewPassword(password: string, confirmation: string): string | null {
  if (!password || !confirmation) return 'Enter and confirm your new password.';
  if (password.length < PASSWORD_MIN_LENGTH) return 'Your password must be at least 10 characters.';
  if (password !== confirmation) return 'Passwords do not match.';
  return null;
}

type AuthError = { message?: string; code?: string } | null | undefined;

export function mapPasswordError(error: AuthError): string {
  const value = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (/same|different|new password should be different/.test(value)) return 'Your new password must be different from your current password.';
  if (/reauth|recent|session.*(old|expired)|aal/.test(value)) return 'For your security, please request a password-reset link to update your password.';
  return 'We couldn’t update your password. Please try again.';
}

export function isReauthenticationError(error: AuthError) {
  return /reauth|recent|session.*(old|expired)|aal/.test(`${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase());
}
