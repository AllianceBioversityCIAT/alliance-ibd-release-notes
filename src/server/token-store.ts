import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { createHash } from 'node:crypto';

// Credentials come from the Amplify compute role (no static keys).
// Read-only by design: tokens are created by hand in DynamoDB (see /token-generator).
const TABLE = process.env['TOKENS_TABLE'] || 'ibd-release-notes-tokens';
const REGION = process.env['TOKENS_REGION'] || 'us-east-1';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

export interface TokenRecord {
  tokenHash: string;
  owner?: string;
  createdAt?: string;
  active?: boolean;
}

/** Tokens are never stored in clear: only their SHA-256 hash is the key. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function getTokenRecord(tokenHash: string): Promise<TokenRecord | undefined> {
  const res = await db.send(new GetCommand({ TableName: TABLE, Key: { tokenHash }, ConsistentRead: true }));
  return res.Item as TokenRecord | undefined;
}

/** Returns the record of an active token, or undefined. */
export async function findActiveToken(token: string): Promise<TokenRecord | undefined> {
  const record = await getTokenRecord(hashToken(token));
  return record?.active === true ? record : undefined;
}

/** Read-only connectivity check: looks up a key that never exists. */
export async function checkTokenStore(): Promise<{ read: boolean }> {
  await getTokenRecord('__healthcheck__');
  return { read: true };
}
