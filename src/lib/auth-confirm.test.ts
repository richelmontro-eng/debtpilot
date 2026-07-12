import { describe, expect, it, vi } from 'vitest';
import { getConfirmationDestination, getSafeInternalPath, verifyEmailToken } from './auth-confirm';

describe('cross-device email confirmation', () => {
  it('does not require browser storage or a PKCE verifier', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });
    await expect(verifyEmailToken({ verifyOtp }, 'token-from-email', 'email')).resolves.toBe(true);
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'token-from-email', type: 'email' });
  });

  it('accepts a valid token_hash confirmation', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });
    await expect(verifyEmailToken({ verifyOtp }, 'valid-hash', 'email')).resolves.toBe(true);
  });

  it('rejects an expired or invalid token', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: new Error('expired') });
    await expect(verifyEmailToken({ verifyOtp }, 'expired-hash', 'email')).resolves.toBe(false);
  });

  it('blocks unsafe next redirects', () => {
    expect(getSafeInternalPath('https://attacker.example/path')).toBe('/');
    expect(getSafeInternalPath('//attacker.example/path')).toBe('/');
    expect(getSafeInternalPath('/%5C%5Cattacker.example')).toBe('/');
    expect(getSafeInternalPath('/forecast?range=30')).toBe('/forecast?range=30');
  });

  it('sends incomplete onboarding to welcome', () => {
    expect(getConfirmationDestination(false, '/forecast')).toBe('/welcome');
  });

  it('sends completed onboarding to the safe next path or dashboard', () => {
    expect(getConfirmationDestination(true, '/forecast')).toBe('/forecast');
    expect(getConfirmationDestination(true, null)).toBe('/');
  });
});
