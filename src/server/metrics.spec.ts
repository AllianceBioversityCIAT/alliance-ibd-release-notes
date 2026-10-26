import { GetCommand, UpdateCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import express from 'express';
import { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mcpRouter } from './mcp';
import { hashToken, recordUsage, summarizeUsage, TokenRecord } from './token-store';

const TOKEN = 'rnt_metrics_test';
const sent: unknown[] = [];

beforeEach(() => {
  sent.length = 0;
  vi.spyOn(DynamoDBDocumentClient.prototype, 'send').mockImplementation(async (command: unknown) => {
    sent.push(command);
    if (command instanceof GetCommand) {
      return { Item: { tokenHash: hashToken(TOKEN), owner: 'Daniela', active: true } } as never;
    }
    return {} as never;
  });
});

afterEach(() => vi.restoreAllMocks());

const updates = () => sent.filter((c): c is UpdateCommand => c instanceof UpdateCommand).map((c) => c.input);

describe('recordUsage', () => {
  it('adds one to the tool counter and stamps last and first use, only on an existing token', async () => {
    await recordUsage('abc', 'get_jira_context');
    const [input] = updates();
    expect(input.Key).toEqual({ tokenHash: 'abc' });
    expect(input.ExpressionAttributeNames).toEqual({ '#tool': 'uses_get_jira_context' });
    expect(input.UpdateExpression).toContain('ADD #tool :one');
    expect(input.UpdateExpression).toContain('firstUsedAt = if_not_exists(firstUsedAt, :now)');
    expect(input.ConditionExpression).toBe('attribute_exists(tokenHash)');
  });

  it('also counts the Notion publish per environment', async () => {
    await recordUsage('abc', 'publish_release_note', 'published_prod');
    const [input] = updates();
    expect(input.ExpressionAttributeNames).toEqual({ '#tool': 'uses_publish_release_note', '#notion': 'published_prod' });
    expect(input.UpdateExpression).toContain('ADD #tool :one, #notion :one');
  });

  it('never throws when DynamoDB fails', async () => {
    vi.spyOn(DynamoDBDocumentClient.prototype, 'send').mockRejectedValue(Object.assign(new Error('x'), { name: 'AccessDeniedException' }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(recordUsage('abc', 'get_jira_context')).resolves.toBeUndefined();
  });
});

describe('summarizeUsage', () => {
  it('builds per-person totals, most recent first, without hashes', () => {
    const records = [
      { tokenHash: 'h1', owner: 'Manuel', active: true, createdAt: '2026-10-26' },
      {
        tokenHash: 'h2',
        owner: 'Daniela',
        active: true,
        lastUsedAt: '2026-10-27T10:00:00Z',
        uses_get_jira_context: 3,
        uses_publish_release_note: 1,
        published_test: 1,
      },
    ] as TokenRecord[];
    const [first, second] = summarizeUsage(records);
    expect(first.owner).toBe('Daniela');
    expect(first.totalCalls).toBe(4);
    expect(first.tools).toEqual({ get_jira_context: 3, publish_release_note: 1 });
    expect(first.notion).toEqual({ published_test: 1, published_prod: 0, edited_test: 0, edited_prod: 0 });
    expect(second).toMatchObject({ owner: 'Manuel', totalCalls: 0, lastUsedAt: undefined });
    expect(JSON.stringify(first)).not.toContain('h2');
  });
});

describe('MCP metrics chokepoint', () => {
  async function callTool(name: string, args: Record<string, unknown>) {
    const app = express().use('/mcp', mcpRouter());
    const server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      });
      return (await res.json()) as { result: { isError?: boolean } };
    } finally {
      server.close();
    }
  }

  it('counts a successful tool call for the caller', async () => {
    const body = await callTool('get_writing_guidelines', { note_type: 'brief' });
    expect(body.result.isError).toBeFalsy();
    const [input] = updates();
    expect(input.Key).toEqual({ tokenHash: hashToken(TOKEN) });
    expect(input.ExpressionAttributeNames).toEqual({ '#tool': 'uses_get_writing_guidelines' });
  });

  it('does not count a failed tool call', async () => {
    // Without ADMIN_TOKEN_HASH the upload tool fails offline ("Image uploads are not configured").
    const saved = process.env['ADMIN_TOKEN_HASH'];
    delete process.env['ADMIN_TOKEN_HASH'];
    try {
      const body = await callTool('get_image_upload_url', {});
      expect(body.result.isError).toBe(true);
      expect(updates()).toEqual([]);
    } finally {
      if (saved !== undefined) process.env['ADMIN_TOKEN_HASH'] = saved;
    }
  });
});
