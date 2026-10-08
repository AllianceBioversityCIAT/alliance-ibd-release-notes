import { Component, computed, signal } from '@angular/core';

interface GeneratedToken {
  token: string;
  tokenHash: string;
  owner: string;
  createdAt: string;
}

const TOKEN_PREFIX = 'rnt_';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates a token in the browser only: nothing is sent to the server or stored.
 * The DynamoDB item (hash only) is pasted by hand into ibd-release-notes-tokens.
 */
@Component({
  selector: 'app-token-generator',
  templateUrl: './token-generator.html',
  styleUrl: './token-generator.css',
})
export class TokenGenerator {
  protected readonly owner = signal('');
  protected readonly generated = signal<GeneratedToken | null>(null);
  protected readonly copied = signal<'token' | 'item' | null>(null);
  protected readonly busy = signal(false);

  /** DynamoDB JSON, ready for the console "Create item" JSON view. */
  protected readonly dynamoItem = computed(() => {
    const g = this.generated();
    if (!g) return '';
    return JSON.stringify(
      {
        tokenHash: { S: g.tokenHash },
        owner: { S: g.owner },
        createdAt: { S: g.createdAt },
        active: { BOOL: true },
      },
      null,
      2,
    );
  });

  protected onOwnerInput(event: Event): void {
    this.owner.set((event.target as HTMLInputElement).value);
  }

  protected async generate(): Promise<void> {
    const owner = this.owner().trim();
    if (!owner || this.busy()) return;
    this.busy.set(true);
    try {
      const token = TOKEN_PREFIX + toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
      this.generated.set({
        token,
        tokenHash: await sha256Hex(token),
        owner,
        createdAt: new Date().toISOString(),
      });
      this.copied.set(null);
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(kind: 'token' | 'item'): Promise<void> {
    const g = this.generated();
    if (!g) return;
    await navigator.clipboard.writeText(kind === 'token' ? g.token : this.dynamoItem());
    this.copied.set(kind);
  }
}
