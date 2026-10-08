import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { createHash } from 'node:crypto';

// Credentials come from the Amplify compute role (no static keys).
const TABLE = process.env['TOKENS_TABLE'] || 'ibd-release-notes-tokens';
const REGION = process.env['TOKENS_REGION'] || 'us-east-1';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

export interface TokenRecord {
  tokenHash: string;
  [key: string]: unknown;
}

/** Tokens are never stored in clear: only their SHA-256 hash is the key. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function getTokenRecord(tokenHash: string): Promise<TokenRecord | undefined> {
  const res = await db.send(new GetCommand({ TableName: TABLE, Key: { tokenHash }, ConsistentRead: true }));
  return res.Item as TokenRecord | undefined;
}

export async function putTokenRecord(record: TokenRecord): Promise<void> {
  await db.send(new PutCommand({ TableName: TABLE, Item: record }));
}

export async function deleteTokenRecord(tokenHash: string): Promise<void> {
  await db.send(new DeleteCommand({ TableName: TABLE, Key: { tokenHash } }));
}

const PROBE_KEY = '__healthcheck__';

/** Write, read back and delete one fixed probe item (never grows the table). */
export async function checkTokenStore(): Promise<{ write: boolean; read: boolean; delete: boolean }> {
  const stamp = new Date().toISOString();
  await putTokenRecord({ tokenHash: PROBE_KEY, stamp });
  const item = await getTokenRecord(PROBE_KEY);
  const read = item?.['stamp'] === stamp;
  await deleteTokenRecord(PROBE_KEY);
  const gone = (await getTokenRecord(PROBE_KEY)) === undefined;
  return { write: true, read, delete: gone };
}
