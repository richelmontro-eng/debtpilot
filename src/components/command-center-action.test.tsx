import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CommandCenterAction, commandCenterTarget, focusCommandCenterTarget } from './command-center-action';

describe('Command Center actions', () => {
  it('renders dashboard plan and recommendation actions as keyboard-native buttons', () => {
    for (const [label, href] of [['Review dashboard plan', '/#financial-plan'], ['Review recommendation', '/#pilot-recommendation']]) {
      const html = renderToStaticMarkup(<CommandCenterAction label={label} href={href} onInPage={() => undefined} />);
      expect(html).toContain('<button'); expect(html).toContain('type="button"'); expect(html).toContain(label);
    }
  });

  it('resolves valid in-page targets and leaves routed actions as links', () => {
    expect(commandCenterTarget('/#financial-plan')).toBe('financial-plan');
    expect(commandCenterTarget('/#pilot-recommendation')).toBe('pilot-recommendation');
    expect(commandCenterTarget('/goals')).toBeNull();
    expect(renderToStaticMarkup(<CommandCenterAction label="Review goals" href="/goals" onInPage={() => undefined} />)).toContain('href="/goals"');
  });

  it('scrolls to and focuses the selected target', () => {
    const element = { scrollIntoView: vi.fn(), focus: vi.fn() };
    const root = { getElementById: vi.fn(() => element) } as unknown as Pick<Document, 'getElementById'>;
    expect(focusCommandCenterTarget('financial-plan', root)).toBe(true);
    expect(element.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(element.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('reports missing targets instead of leaving an action silently unresolved', () => {
    const root = { getElementById: vi.fn(() => null) } as unknown as Pick<Document, 'getElementById'>;
    expect(focusCommandCenterTarget('missing', root)).toBe(false);
  });
});
