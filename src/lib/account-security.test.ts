import { describe, expect, it } from 'vitest';
import { getSignOutScope, mapEmailChangeError, mapSensitiveActionError, requiresReauthentication, validateEmailChange } from './account-security';

describe('account security', () => {
  it('accepts a valid email change request', () => expect(validateEmailChange('old@example.com', 'new@example.com', 'new@example.com')).toBeNull());
  it('rejects mismatched confirmation', () => expect(validateEmailChange('old@example.com', 'one@example.com', 'two@example.com')).toMatch(/match/i));
  it('rejects the current email', () => expect(validateEmailChange('old@example.com', 'OLD@example.com', 'old@example.com')).toMatch(/different/i));
  it('rejects invalid email format', () => expect(validateEmailChange('old@example.com', 'invalid', 'invalid')).toMatch(/valid/i));
  it('detects sensitive-action reauthentication', () => { expect(requiresReauthentication({ code: 'reauthentication_needed' })).toBe(true); expect(requiresReauthentication({ status: 401 })).toBe(true); });
  it('suppresses raw technical errors', () => { const emailMessage = mapEmailChangeError({ message: 'Supabase PKCE JWT cookie framework error' }); const actionMessage = mapSensitiveActionError({ message: 'Postgres JWT failure' }); expect(`${emailMessage} ${actionMessage}`).not.toMatch(/supabase|pkce|jwt|cookie|framework|postgres/i); });
  it('uses local scope for current-device sign out', () => expect(getSignOutScope(false)).toBe('local'));
  it('uses global scope for all-device sign out', () => expect(getSignOutScope(true)).toBe('global'));
});
