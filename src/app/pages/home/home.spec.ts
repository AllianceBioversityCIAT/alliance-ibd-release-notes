import { TestBed } from '@angular/core/testing';
import { Home, INSTALL_PROMPT } from './home';

describe('Home', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Home] }).compileComponents();
  });

  it('renders the install screen with the full prompt and the token note', async () => {
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Jira → Notion');
    expect(INSTALL_PROMPT).toContain('claude mcp add');
    expect(el.querySelector('.step strong')?.textContent).toContain('request it from the developer');
    expect(el.querySelector('button.copy')?.textContent?.trim()).toBe('Copy install prompt');
  });

  it('copies the whole prompt, not the typed fragment', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.copy')!.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(INSTALL_PROMPT);
  });
});
