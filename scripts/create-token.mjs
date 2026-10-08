#!/usr/bin/env node
// Creates an MCP token for one person and stores ONLY its SHA-256 hash in DynamoDB.
// Runs locally with the owner's AWS credentials; the app itself never writes tokens.
//
//   AWS_PROFILE=release-notes-tokens node scripts/create-token.mjs "Ana Pérez" [--dry-run]
//
// The token is printed once: hand it to the person, it is not recoverable.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { createHash, randomBytes } from 'node:crypto';

const TABLE = process.env.TOKENS_TABLE || 'ibd-release-notes-tokens';
const REGION = process.env.TOKENS_REGION || 'us-east-1';
process.env.AWS_PROFILE ||= 'release-notes-tokens';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const owner = args.filter((a) => a !== '--dry-run').join(' ').trim();
if (!owner) {
  console.error('Usage: node scripts/create-token.mjs "<name>" [--dry-run]');
  process.exit(1);
}

const token = 'rnt_' + randomBytes(32).toString('base64url');
const item = {
  tokenHash: createHash('sha256').update(token).digest('hex'),
  owner,
  createdAt: new Date().toISOString(),
  active: true,
};

if (!dryRun) {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
  // Never overwrite an existing token (retries cannot clobber a live record).
  await db.send(
    new PutCommand({ TableName: TABLE, Item: item, ConditionExpression: 'attribute_not_exists(tokenHash)' }),
  );
}

console.log(JSON.stringify({ saved: !dryRun, table: TABLE, profile: process.env.AWS_PROFILE, ...item, token }, null, 2));
