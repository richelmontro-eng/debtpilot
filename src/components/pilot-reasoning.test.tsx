import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PilotReasoning from './pilot-reasoning';

describe('Pilot reasoning accessibility', () => {
  it('connects the Why control to an accessible expanded panel', () => {
    const html = renderToStaticMarkup(<PilotReasoning open onToggle={() => undefined} reasoning={['Bills are reserved first.']}/>);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="pilot-reasoning"');
    expect(html).toContain('id="pilot-reasoning"');
    expect(html).toContain('role="region"');
    expect(html).toContain('Why this recommendation was generated');
  });
});
