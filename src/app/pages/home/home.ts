import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { STAGE, startReleaseNotesScene } from './release-notes-scene';

/** Placeholder endpoint until the MCP route exists on this app. */
export const TOKEN_SLOT = '<YOUR_TOKEN>';
export const INSTALL_PROMPT =
  'Install the IBD Release Notes MCP in this client: claude mcp add --transport http ibd-release-notes ' +
  `https://main.d2c3gfm7joblnc.amplifyapp.com/mcp --header "Authorization: Bearer ${TOKEN_SLOT}"`;

/** The install prompt with the viewer's token in place. The token never leaves the browser. */
export const promptWithToken = (token: string) => INSTALL_PROMPT.replace(TOKEN_SLOT, token.trim());
/** What the screen shows: the token masked except its last 4 characters. */
export const maskToken = (token: string) => {
  const t = token.trim();
  return t.length <= 4 ? '•'.repeat(t.length) : '•'.repeat(Math.min(12, t.length - 4)) + t.slice(-4);
};

@Component({
  selector: 'app-home',
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  /** Server renders the full prompt; the browser re-types it as an effect. */
  protected readonly typed = signal(INSTALL_PROMPT);
  protected readonly token = signal('');
  protected readonly hasToken = computed(() => this.token().trim().length > 0);
  /** Once a token is pasted the prompt is shown complete, token masked. */
  protected readonly shown = computed(() =>
    this.hasToken() ? INSTALL_PROMPT.replace(TOKEN_SLOT, maskToken(this.token())) : this.typed(),
  );
  protected readonly copyLabel = signal('Copy install prompt');
  protected readonly copied = signal(false);

  private readonly scene = viewChild.required<ElementRef<HTMLElement>>('scene');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('gl');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const fit = () => {
        const s = Math.max(innerWidth / STAGE.width, innerHeight / STAGE.height);
        this.scene().nativeElement.style.transform =
          `translate(${innerWidth - STAGE.width * s}px, ${(innerHeight - STAGE.height * s) / 2}px) scale(${s})`;
      };
      fit();
      addEventListener('resize', fit);

      let stop: (() => void) | undefined;
      let alive = true;
      document.fonts.ready
        .then(() => startReleaseNotesScene(this.canvas().nativeElement))
        .then((dispose) => (alive ? (stop = dispose) : dispose()));

      let typing: ReturnType<typeof setTimeout> | undefined;
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        let n = 0;
        const tick = () => {
          this.typed.set(INSTALL_PROMPT.slice(0, ++n));
          if (n < INSTALL_PROMPT.length) typing = setTimeout(tick, 18);
        };
        tick();
      }

      destroyRef.onDestroy(() => {
        alive = false;
        removeEventListener('resize', fit);
        clearTimeout(typing);
        stop?.();
      });
    });
  }

  protected onToken(event: Event): void {
    this.token.set((event.target as HTMLInputElement).value);
  }

  protected async copy(): Promise<void> {
    if (!this.hasToken()) return; // the token is required: the prompt is useless without it
    try {
      await navigator.clipboard.writeText(promptWithToken(this.token()));
      this.copyLabel.set('Copied ✓');
      this.copied.set(true);
    } catch {
      this.copyLabel.set('Select the text and copy it');
    }
    setTimeout(() => {
      this.copyLabel.set('Copy install prompt');
      this.copied.set(false);
    }, 1800);
  }
}
