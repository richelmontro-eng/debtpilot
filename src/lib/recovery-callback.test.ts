import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const auth = { exchangeCodeForSession: vi.fn(), verifyOtp: vi.fn(), getUser: vi.fn() };
vi.mock('./supabase/server', () => ({ createClient: async () => ({ auth }) }));
import { GET } from '../app/auth/recovery/route';

describe('recovery callback', () => {
  it('establishes a valid PKCE recovery session', async () => { auth.exchangeCodeForSession.mockResolvedValueOnce({ error: null }); auth.getUser.mockResolvedValueOnce({ data: { user: { id: '1' } }, error: null }); const response = await GET(new NextRequest('https://app.example/auth/recovery?code=valid')); expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('valid'); expect(response.headers.get('location')).toBe('https://app.example/reset-password'); });
  it('shows a friendly expired-link destination without technical errors', async () => { auth.exchangeCodeForSession.mockResolvedValueOnce({ error: { message: 'raw JWT failure' } }); const response = await GET(new NextRequest('https://app.example/auth/recovery?code=expired')); expect(response.headers.get('location')).toBe('https://app.example/auth/recovery-expired'); expect(response.headers.get('location')).not.toMatch(/jwt|pkce|supabase/i); });
});
