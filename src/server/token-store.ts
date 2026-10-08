import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { createHash, randomBytes } from 'node:crypto';

// Credentials come from the Amplify compute role (no static keys).
// Writes are only reachable through the admin API (src/server/admin-api.ts).
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

export async function listTokenRecords(): Promise<TokenRecord[]> {
  const items: TokenRecord[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await db.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey, ConsistentRead: true }));
    items.push(...((res.Items ?? []) as TokenRecord[]));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.filter((i) => i.tokenHash !== HEALTH_KEY && !i.tokenHash.startsWith('owner#'));
}

// One active token per owner: a lock item `owner#<sha256(owner)>` points to it, so a
// retried create cannot mint a second token (no Scan permission needed).
const ownerLockKey = (owner: string) => 'owner#' + hashToken(owner.trim().toLowerCase());

export class OwnerHasActiveToken extends Error {
  constructor(readonly tokenHash: string) {
    super('owner_has_active_token');
    this.name = 'OwnerHasActiveToken';
  }
}

/** Creates a token for `owner`; the clear token is returned once and never stored. */
export async function createToken(owner: string): Promise<{ token: string; record: TokenRecord }> {
  const token = 'rnt_' + randomBytes(32).toString('base64url');
  const record: TokenRecord = {
    tokenHash: hashToken(token),
    owner,
    createdAt: new Date().toISOString(),
    active: true,
  };
  const lockKey = ownerLockKey(owner);
  const lock = (await getTokenRecord(lockKey)) as (TokenRecord & { current?: string }) | undefined;
  if (lock?.current) {
    const current = await getTokenRecord(lock.current);
    if (current?.active) throw new OwnerHasActiveToken(lock.current);
  }
  // Claim the lock: only if it is still what we read (absent or pointing to the old token).
  try {
    await db.send(
      new PutCommand({
        TableName: TABLE,
        Item: { tokenHash: lockKey, current: record.tokenHash },
        ConditionExpression: lock ? 'current = :old' : 'attribute_not_exists(tokenHash)',
        ExpressionAttributeValues: lock ? { ':old': lock.current } : undefined,
      }),
    );
  } catch (error) {
    if ((error as Error).name === 'ConditionalCheckFailedException') {
      const winner = (await getTokenRecord(lockKey)) as { current?: string } | undefined;
      throw new OwnerHasActiveToken(winner?.current ?? '');
    }
    throw error;
  }
  await db.send(
    new PutCommand({ TableName: TABLE, Item: record, ConditionExpression: 'attribute_not_exists(tokenHash)' }),
  );
  return { token, record };
}

/** Returns the updated record, or undefined when the hash does not exist. */
export async function setTokenActive(tokenHash: string, active: boolean): Promise<TokenRecord | undefined> {
  try {
    const res = await db.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { tokenHash },
        UpdateExpression: 'SET active = :a',
        ConditionExpression: 'attribute_exists(tokenHash)',
        ExpressionAttributeValues: { ':a': active },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return res.Attributes as TokenRecord;
  } catch (error) {
    if ((error as Error).name === 'ConditionalCheckFailedException') return undefined;
    throw error;
  }
}

/** Returns false when the hash does not exist. Also frees the owner lock if it points here. */
export async function deleteTokenRecord(tokenHash: string): Promise<boolean> {
  const record = await getTokenRecord(tokenHash);
  try {
    await db.send(
      new DeleteCommand({ TableName: TABLE, Key: { tokenHash }, ConditionExpression: 'attribute_exists(tokenHash)' }),
    );
  } catch (error) {
    if ((error as Error).name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
  if (record?.owner) {
    try {
      await db.send(
        new DeleteCommand({
          TableName: TABLE,
          Key: { tokenHash: ownerLockKey(record.owner) },
          ConditionExpression: 'current = :h',
          ExpressionAttributeValues: { ':h': tokenHash },
        }),
      );
    } catch (error) {
      if ((error as Error).name !== 'ConditionalCheckFailedException') throw error;
    }
  }
  return true;
}

const HEALTH_KEY = '__healthcheck__';

/** Read-only connectivity check: looks up a key that never exists. */
export async function checkTokenStore(): Promise<{ read: boolean }> {
  await getTokenRecord(HEALTH_KEY);
  return { read: true };
}
