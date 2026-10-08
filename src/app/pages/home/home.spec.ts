import { TestBed } from '@angular/core/testing';
import { Home, maskToken } from './home';
import { CLIENTS, MCP_URL } from './install-clients';

describe('Home', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Home] }).compileComponents();
  });

  const render = async () => {
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => (fixture.detectChanges(), await fixture.whenStable());
    const typeToken = async (value: string) => {
      const input = el.querySelector<HTMLInputElement>('input.token')!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
    };
    const pick = async (name: string) => {
      [...el.querySelectorAll<HTMLButtonElement>('button.client')].find((b) => b.textContent?.includes(name))!.click();
      await settle();
    };
    return { el, typeToken, pick };
  };

  it('lists the four clients with a logo each', async () => {
    const { el } = await render();
    const names = [...el.querySelectorAll('button.client > span:last-child')].map((b) => b.textContent?.trim());
    expect(names).toEqual(['Claude Code', 'Claude', 'Cursor', 'ChatGPT']);
    expect(el.querySelectorAll('button.client svg path').length).toBe(4);
  });

  it('requires a token before anything can be copied', async () => {
    const { el } = await render();
    expect(el.querySelector<HTMLButtonElement>('.snippet .copy')!.disabled).toBe(true);
    expect(el.querySelector('.hint')?.textContent).toContain('Request it from the developer');
  });

  it('copies the Claude Code command with the real token while showing it masked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { el, typeToken } = await render();
    await typeToken('  rnt_secret_1234  ');

    const code = el.querySelector('.snippet code')!.textContent!;
    expect(code).toContain('••1234');
    expect(code).not.toContain('rnt_secret');
    el.querySelector<HTMLButtonElement>('.snippet .copy')!.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(
      `claude mcp add --transport http ibd-release-notes ${MCP_URL} --header "Authorization: Bearer rnt_secret_1234"`,
    );
  });

  it('gives Cursor a one-click link only once the token is there', async () => {
    const { el, typeToken, pick } = await render();
    await pick('Cursor');
    expect(el.querySelector('a.oneclick')).toBeNull();
    await typeToken('rnt_abc_9999');
    expect(el.querySelector('a.oneclick')?.getAttribute('href')).toContain('cursor://anysphere.cursor-deeplink/mcp/install');
  });

  it('keeps ChatGPT pending and not copyable even with a token', async () => {
    const { el, typeToken, pick } = await render();
    await typeToken('rnt_abc_9999');
    await pick('ChatGPT');
    expect(el.querySelector('.pending')?.textContent).toContain('Coming soon');
    expect(el.querySelector<HTMLButtonElement>('.snippet .copy')!.disabled).toBe(true);
  });

  it('masks short tokens fully', () => {
    expect(maskToken('abc')).toBe('•••');
    expect(CLIENTS.find((c) => c.id === 'claude')!.snippets.map((s) => s.label)).toContain('Authorization header');
  });
});
