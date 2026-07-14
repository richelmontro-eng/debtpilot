import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccountPanel, navigationGroups } from './app-shell';

describe('sidebar account panel', () => {
  it('always renders Sign Out and account access', () => {
    const html = renderToStaticMarkup(<AccountPanel displayName="Avery" email="avery@example.com" onSignOut={() => undefined}/>);
    expect(html).toContain('Sign Out');
    expect(html).toContain('Settings');
    expect(html).toContain('avery@example.com');
  });
});

describe('Navigation 3.0 information architecture', () => {
  it('organizes every journey group and dedicated management page', () => {
    expect(navigationGroups.map(group => group.label)).toEqual(['Today', 'Cash Flow', 'Debt', 'Goals', 'Intelligence', 'Planning', 'Account']);
    const destinations = navigationGroups.flatMap(group => group.items.map(item => `${item.label}:${item.href}`));
    expect(destinations).toContain('Bills:/bills'); expect(destinations).toContain('Debts:/debts'); expect(destinations).toContain('Paychecks:/paychecks');
  });
});
