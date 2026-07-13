import { describe, expect, it } from 'vitest';
import { isReauthenticationError, mapPasswordError, RESET_SENT_MESSAGE, validateNewPassword } from './password-management';

describe('password management', () => {
  it('uses the same generic forgot-password response for registered and unregistered addresses', () => { expect(RESET_SENT_MESSAGE).toBe('If an account exists for this email, we sent password-reset instructions.'); expect(RESET_SENT_MESSAGE).not.toMatch(/registered|not found|user/i); });
  it('rejects blank, short, and mismatched passwords', () => { expect(validateNewPassword('', '')).toMatch(/enter/i); expect(validateNewPassword('short', 'short')).toMatch(/10/); expect(validateNewPassword('long-enough-one', 'long-enough-two')).toMatch(/match/i); });
  it('accepts a matching password of at least 10 characters', () => expect(validateNewPassword('a-secure-passphrase', 'a-secure-passphrase')).toBeNull());
  it('supports success, reauthentication, and technical-error suppression', () => { expect(mapPasswordError({ message: 'New password should be different from the old password' })).toMatch(/different/); expect(isReauthenticationError({ code: 'reauthentication_needed' })).toBe(true); const message = mapPasswordError({ message: 'JWT PKCE cookie Supabase framework failure' }); expect(message).toBe('We couldn’t update your password. Please try again.'); expect(message).not.toMatch(/jwt|pkce|cookie|supabase|framework/i); });
});
