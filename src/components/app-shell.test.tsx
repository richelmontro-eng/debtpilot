import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccountPanel } from './app-shell';

describe('sidebar account panel', () => {
  it('always renders Sign Out and account access', () => {
    const html = renderToStaticMarkup(<AccountPanel displayName="Avery" email="avery@example.com" onSignOut={() => undefined}/>);
    expect(html).toContain('Sign Out');
    expect(html).toContain('Settings');
    expect(html).toContain('avery@example.com');
  });
});
