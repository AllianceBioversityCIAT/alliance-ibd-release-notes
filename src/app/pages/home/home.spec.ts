import { TestBed } from '@angular/core/testing';
import { Home, INSTALL_PROMPT, maskToken, promptWithToken } from './home';

describe('Home', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Home] }).compileComponents();
  });

  const render = async () => {
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };
  const typeToken = async (fixture: { whenStable(): Promise<unknown>; detectChanges(): void }, el: HTMLElement, value: string) => {
    const input = el.querySelector<HTMLInputElement>('input.token')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
  };

  it('requires a token before the prompt can be copied', async () => {
    const { el } = await render();
    const button = el.querySelector<HTMLButtonElement>('button.copy')!;
    expect(button.disabled).toBe(true);
    expect(button.textContent?.trim()).toBe('Paste your token to copy');
    expect(el.querySelector('.hint')?.textContent).toContain('Request it from the developer');
  });

  it('copies the full prompt with the real token while showing it masked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { fixture, el } = await render();
    await typeToken(fixture, el, '  rn_secret_1234  ');

    expect(el.querySelector('.prompt code')?.textContent).toContain('••1234');
    expect(el.querySelector('.prompt code')?.textContent).not.toContain('rn_secret');
    el.querySelector<HTMLButtonElement>('button.copy')!.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(promptWithToken('rn_secret_1234'));
    expect(writeText.mock.calls[0][0]).not.toContain('<YOUR_TOKEN>');
  });

  it('keeps the placeholder prompt intact and masks short tokens fully', () => {
    expect(INSTALL_PROMPT).toContain('claude mcp add');
    expect(maskToken('abc')).toBe('•••');
  });
});
