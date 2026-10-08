import { TestBed } from '@angular/core/testing';
import { TokenGenerator } from './token-generator';

// Independent SHA-256 hex (same output as Node's createHash('sha256') on the server).
async function expectedHash(value: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('TokenGenerator', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TokenGenerator] }).compileComponents();
  });

  it('known vector: sha256("abc")', async () => {
    expect(await expectedHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('generates a token whose hash matches the server hash and a DynamoDB item without the token', async () => {
    const fixture = TestBed.createComponent(TokenGenerator);
    const cmp = fixture.componentInstance as any;
    cmp.owner.set('  Ana  ');
    await cmp.generate();

    const g = cmp.generated();
    expect(g.token).toMatch(/^rnt_[A-Za-z0-9_-]{43}$/);
    expect(g.tokenHash).toBe(await expectedHash(g.token));
    expect(g.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    const item = JSON.parse(cmp.dynamoItem());
    expect(item.tokenHash.S).toBe(g.tokenHash);
    expect(item.owner.S).toBe('Ana');
    expect(item.active.BOOL).toBe(true);
    expect(cmp.dynamoItem()).not.toContain(g.token);
  });

  it('does nothing without owner', async () => {
    const fixture = TestBed.createComponent(TokenGenerator);
    const cmp = fixture.componentInstance as any;
    await cmp.generate();
    expect(cmp.generated()).toBeNull();
  });
});
