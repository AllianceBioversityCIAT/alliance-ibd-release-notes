/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishReleaseNote, updateReleaseNote } from './notion';

const PAGE_ID = '0123456789abcdef0123456789abcdef';
const COVER = 'https://images.example.com/cover.png';
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
let sent: Array<{ url: string; method: string; body?: any }> = [];

beforeEach(() => {
  sent = [];
  vi.stubEnv('NOTION_API_KEY', 'test-key');
  vi.stubEnv('NOTION_DATABASE_ID_TEST', 'db1');
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    sent.push({ url, method, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
    if (url === COVER) return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } });
    if (url.endsWith('/databases/db1/query')) return json({ results: [] });
    if (url.endsWith('/file_uploads')) return json({ object: 'file_upload', id: 'upload-1' });
    if (url.endsWith('/file_uploads/upload-1/send')) return json({ object: 'file_upload', status: 'uploaded' });
    if (url.endsWith('/pages') && method === 'POST') return json({ object: 'page', id: PAGE_ID, url: 'https://notion.so/p' });
    if (url.includes(`/pages/`) && method === 'GET') return json({ object: 'page', parent: { database_id: 'db1' } });
    if (url.includes(`/pages/`) && method === 'PATCH') return json({ object: 'page', id: PAGE_ID });
    throw new Error(`Unexpected fetch ${method} ${url}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const pageWrite = (method: string) => sent.find((r) => r.url.includes('/pages') && r.method === method)?.body;

describe('cover image', () => {
  it('publish: a public cover URL is uploaded and hosted in Notion, not linked', async () => {
    await publishReleaseNote({ title: 'Note', markdown: 'Hello', cover_url: COVER, env: 'test' });
    expect(pageWrite('POST').cover).toEqual({ type: 'file_upload', file_upload: { id: 'upload-1' } });
  });

  it('update: a public cover URL is uploaded and hosted in Notion, not linked', async () => {
    await updateReleaseNote({ page: PAGE_ID, cover_url: COVER, env: 'test' });
    expect(pageWrite('PATCH').cover).toEqual({ type: 'file_upload', file_upload: { id: 'upload-1' } });
  });

  it('a notion-upload ref is used as it is, without downloading anything', async () => {
    await publishReleaseNote({ title: 'Note', markdown: 'Hello', cover_url: 'notion-upload:already-there', env: 'test' });
    expect(pageWrite('POST').cover).toEqual({ type: 'file_upload', file_upload: { id: 'already-there' } });
    expect(sent.some((r) => r.url === COVER || r.url.endsWith('/file_uploads'))).toBe(false);
  });

  it('a cover that cannot be downloaded fails before the page is created', async () => {
    await expect(
      publishReleaseNote({ title: 'Note', markdown: 'Hello', cover_url: 'http://insecure.example.com/c.png', env: 'test' }),
    ).rejects.toThrow('public https URL');
    expect(pageWrite('POST')).toBeUndefined();
  });
});
