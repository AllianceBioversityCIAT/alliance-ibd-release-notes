import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { CLIENTS, ClientId, Snippet, TOKEN_SLOT } from './install-clients';
import { STAGE, startReleaseNotesScene } from './release-notes-scene';

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
  protected readonly clients = CLIENTS;
  protected readonly selected = signal<ClientId>('claude-code');
  protected readonly client = computed(() => CLIENTS.find((c) => c.id === this.selected())!);

  protected readonly token = signal('');
  protected readonly hasToken = computed(() => this.token().trim().length > 0);
  /** Which snippet was just copied (index), for the button feedback. */
  protected readonly copied = signal<number | null>(null);
  protected readonly copyFailed = signal(false);

  /** Cursor's one-click install, built only once a token is there (the token never leaves the browser). */
  protected readonly deeplink = computed<SafeUrl | null>(() => {
    const link = this.client().deeplink;
    return link && this.hasToken() ? this.sanitizer.bypassSecurityTrustUrl(link(this.token().trim())) : null;
  });

  private readonly sanitizer = inject(DomSanitizer);
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
      // The scene is decoration: without WebGL (or fonts API) the page still works.
      Promise.resolve(document.fonts?.ready)
        .then(() => startReleaseNotesScene(this.canvas().nativeElement))
        .then((dispose) => (alive ? (stop = dispose) : dispose()))
        .catch(() => undefined);

      destroyRef.onDestroy(() => {
        alive = false;
        removeEventListener('resize', fit);
        stop?.();
      });
    });
  }

  /** Text on screen: placeholder until a token is pasted, then the token masked. */
  protected shown(snippet: Snippet): string {
    return snippet.value(this.hasToken() ? maskToken(this.token()) : TOKEN_SLOT);
  }

  protected select(id: ClientId): void {
    this.selected.set(id);
    this.copied.set(null);
  }

  protected onToken(event: Event): void {
    this.token.set((event.target as HTMLInputElement).value);
  }

  protected async copy(snippet: Snippet, index: number): Promise<void> {
    if (!this.hasToken() || this.client().pending) return; // the token is required
    try {
      await navigator.clipboard.writeText(snippet.value(this.token().trim()));
      this.copyFailed.set(false);
      this.copied.set(index);
    } catch {
      this.copyFailed.set(true);
    }
    setTimeout(() => this.copied.set(null), 1800);
  }
}
