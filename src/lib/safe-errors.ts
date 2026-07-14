export type TechnicalError = { code?: string; message?: string; details?: string; hint?: string } | null | undefined;

export function safeLoadMessage(area: string) {
  return `We couldn’t load ${area}. Please try again.`;
}

export function safeSaveMessage(item: string) {
  return `We couldn’t save ${item}. Please try again.`;
}

export function safeDeleteMessage(item: string) {
  return `We couldn’t delete ${item}. Please try again.`;
}

export function safeAuthMessage(error: TechnicalError) {
  const value = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (/invalid login|invalid.*credential/.test(value)) return 'The email or password you entered is incorrect.';
  if (/email.*not.*confirm/.test(value)) return 'Confirm your email before signing in.';
  if (/rate|too many/.test(value)) return 'Too many attempts. Please wait a moment and try again.';
  return 'We couldn’t sign you in. Please try again.';
}

export function logTechnicalError(context: string, error: TechnicalError) {
  if (process.env.NODE_ENV !== 'production' && error) console.error('[DebtPilot]', { context, code: error.code, message: error.message, details: error.details, hint: error.hint });
}
