import { describe, expect, it, vi } from 'vitest';
import { logTechnicalError, safeAuthMessage, safeDeleteMessage, safeLoadMessage, safeSaveMessage } from './safe-errors';

describe('safe user-facing errors', () => {
  it('maps authentication failures without exposing provider details', () => { expect(safeAuthMessage({ message: 'Invalid login credentials' })).toMatch(/incorrect/i); const message = safeAuthMessage({ message: 'Supabase PKCE JWT cookie framework failure', code: 'PGRST205' }); expect(message).not.toMatch(/supabase|pkce|jwt|cookie|framework|pgrst/i); });
  it('uses action-specific database-safe messages', () => { const messages = [safeLoadMessage('your goals'), safeSaveMessage('this transaction'), safeDeleteMessage('this scenario')]; expect(messages.join(' ')).not.toMatch(/database|schema|supabase|postgres|jwt/i); });
  it('keeps diagnostics out of production logs', () => { const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined); vi.stubEnv('NODE_ENV', 'production'); logTechnicalError('test', { message: 'secret technical detail' }); expect(spy).not.toHaveBeenCalled(); vi.unstubAllEnvs(); spy.mockRestore(); });
});
