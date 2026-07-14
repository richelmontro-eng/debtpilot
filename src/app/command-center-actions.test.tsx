// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Home from './page';

const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }));

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from(table: string) {
      const result = table === 'profiles'
        ? { data: { user_id: 'user-1', onboarding_completed: true, display_name: 'Taylor', pay_frequency: 'weekly', weekly_take_home: 1200, checking_balance: 1000, savings_balance: 500, weekly_living_reserve: 400, checking_cushion: 500, preferred_strategy: 'avalanche' }, error: null }
        : { data: [], error: null };
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'order', 'limit', 'upsert', 'insert', 'update', 'delete']) builder[method] = () => builder;
      builder.maybeSingle = async () => result;
      builder.single = async () => result;
      builder.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
      return builder;
    },
  }),
}));

describe('Command Center page actions', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    mocks.push.mockClear(); mocks.replace.mockClear();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle));
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('scrolls, focuses, and highlights the real paycheck-plan section without navigating', async () => {
    const user = userEvent.setup();
    render(<Home />);
    await screen.findByRole('heading', { name: 'Your financial briefing' });
    const actions = await screen.findAllByRole('button', { name: 'Review dashboard plan' });
    expect(actions.length).toBeGreaterThan(0);

    await user.click(actions[0]);

    const plan = document.getElementById('command-center-plan');
    expect(plan).not.toBeNull();
    expect(document.activeElement).toBe(plan);
    expect(plan?.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(plan?.className).toContain('ring-4');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/');
  });

  it('opens, scrolls to, and focuses visible recommendation reasoning without navigating', async () => {
    const user = userEvent.setup();
    render(<Home />);
    await screen.findByRole('heading', { name: 'Your financial briefing' });
    const action = await screen.findByRole('button', { name: 'Review recommendation' });

    await user.click(action);

    const panel = await screen.findByRole('region', { name: 'Why this recommendation was generated' });
    expect(panel.isConnected).toBe(true);
    expect(panel.id).toBe('pilot-recommendation-details');
    expect(document.activeElement).toBe(panel);
    expect(panel.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(within(panel).getByText('Why this recommendation')).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/');
  });
});
