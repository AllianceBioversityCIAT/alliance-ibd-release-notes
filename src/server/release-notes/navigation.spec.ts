import { describe, expect, it } from 'vitest';
import { navigationGuide, PLATFORMS } from './navigation';

describe('navigationGuide', () => {
  it.each(PLATFORMS)('%s: offers to install Playwright, explains the login and keeps screenshots out of production', (platform) => {
    const guide = navigationGuide(platform);
    expect(guide).toContain('ASK permission to install Playwright MCP');
    expect(guide).toContain('claude mcp add playwright npx @playwright/mcp@latest');
    expect(guide).toContain('ONLY a test or development environment, NEVER production');
    expect(guide).toContain('ASK if the user has done this before; if not, explain it step by step');
    expect(guide).toContain('Never type your password in this chat.');
  });

  it('prms: proposes the TEST URL and marks production as off limits', () => {
    const guide = navigationGuide('prms');
    expect(guide).toContain('TEST (use this one): https://prtest.ciat.cgiar.org');
    expect(guide).toContain('PRODUCTION (never open it for screenshots): https://reporting.cgiar.org');
  });

  it('other: asks for the TEST or DEV URL only', () => {
    expect(navigationGuide('other')).toContain('TEST or DEV environment (never production)');
  });
});
