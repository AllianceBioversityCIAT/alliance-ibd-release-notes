import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { NOTE_TYPES, NoteType, writingGuidelines } from './release-notes/guidelines';
import { buildJiraContextMulti } from './release-notes/jira';
import { NOTION_ENVS, notionOptions, publishReleaseNote } from './release-notes/notion';
import { findActiveToken, TokenRecord } from './token-store';

const JIRA_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });
const fail = (error: unknown) => ({
  isError: true,
  ...text(`Error: ${error instanceof Error ? error.message : String(error)}`),
});

function buildServer(caller: TokenRecord): McpServer {
  const server = new McpServer({ name: 'ibd-release-notes', version: '1.0.0' });

  server.registerTool(
    'get_jira_context',
    {
      title: 'Get Jira context',
      description:
        'Fetches one or more Jira issues with their children (stories, subtasks), descriptions and recent comments, as text to write a release note from.',
      inputSchema: { issue_keys: z.array(z.string().regex(JIRA_KEY)).min(1).max(10) },
    },
    async ({ issue_keys }) => {
      try {
        const { jira_context, reporters } = await buildJiraContextMulti(issue_keys);
        if (!jira_context) return fail(`No Jira issue could be read for ${issue_keys.join(', ')}`);
        return text(`${jira_context}\n\nJira Reporter(s): ${reporters.join(', ')}`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'get_writing_guidelines',
    {
      title: 'Get release note writing guidelines',
      description:
        'Returns the IBD release note writing rules. Read them BEFORE writing a note, then write the note yourself in Markdown following them.',
      inputSchema: { note_type: z.enum(NOTE_TYPES).default('standard') },
    },
    async ({ note_type }) => text(writingGuidelines(note_type)),
  );

  server.registerTool(
    'get_notion_options',
    {
      title: 'Get Notion tags and projects',
      description: 'Lists the valid Tags and Projects of the Notion release notes database.',
      inputSchema: { env: z.enum(NOTION_ENVS).default('test') },
    },
    async ({ env }) => {
      try {
        return text(JSON.stringify(await notionOptions(env), null, 2));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'publish_release_note',
    {
      title: 'Publish release note to Notion',
      description:
        'Creates the release note page in Notion. env defaults to "test" (Overall Achievements [ TEST ]); use "prod" only when the user explicitly asks to publish for real.',
      inputSchema: {
        title: z.string().min(1).max(2000),
        markdown: z.string().min(1),
        brief_description: z.string().max(2000).optional(),
        tag: z.string().optional(),
        projects: z.array(z.string()).optional(),
        released_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        cover_url: z.string().url().optional(),
        env: z.enum(NOTION_ENVS).default('test'),
      },
    },
    async (input) => {
      try {
        const page = await publishReleaseNote(input);
        if (page.duplicate) return text(`Already published moments ago (not duplicated): ${page.url}`);
        console.log(`[mcp] ${caller.owner} published "${input.title}" to Notion ${input.env}`);
        return text(`Published to Notion (${input.env}): ${page.url}`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerPrompt(
    'create_release_note',
    {
      title: 'Create release note',
      description:
        'Writes an IBD release note from Jira tickets following the house standard and publishes it to Notion (test by default).',
      argsSchema: {
        issue_keys: z.string().describe('Jira keys separated by commas, e.g. P2-3824, P2-3880'),
        note_type: z.string().optional().describe('brief | standard | detailed (default standard)'),
        env: z.string().optional().describe('test | prod (default test)'),
      },
    },
    ({ issue_keys, note_type, env }) => {
      const type = (NOTE_TYPES as readonly string[]).includes(note_type ?? '') ? (note_type as NoteType) : 'standard';
      const target = env === 'prod' ? 'prod' : 'test';
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                `Create a release note for these Jira tickets: ${issue_keys}.\n\n` +
                `Steps:\n` +
                `1. Call get_jira_context with those keys and read all of it (children, comments, QA notes).\n` +
                `2. Write the note yourself in Markdown following the guidelines below exactly. Base every statement on the Jira context; never invent features.\n` +
                `3. Call get_notion_options (env "${target}") and pick the Tag and Projects that fit.\n` +
                `4. Show me the title, brief description, tag, projects and the full note, then call publish_release_note with env "${target}"` +
                (target === 'prod' ? ' ONLY after I confirm.' : '.') +
                `\n5. Reply with the Notion URL.\n\n` +
                `# Guidelines\n\n${writingGuidelines(type)}`,
            },
          },
        ],
      };
    },
  );

  return server;
}

/** Token from `Authorization: Bearer`, or `?token=` for clients that cannot send headers (ChatGPT). */
function tokenFrom(req: Request): string | undefined {
  const bearer = /^Bearer (\S+)$/.exec(req.get('authorization') ?? '');
  if (bearer) return bearer[1];
  const query = req.query['token'];
  return typeof query === 'string' && query ? query : undefined;
}

async function requireToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = tokenFrom(req);
    const record = token ? await findActiveToken(token) : undefined;
    if (!record) {
      res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Invalid or missing token' }, id: null });
      return;
    }
    res.locals['caller'] = record;
    next();
  } catch (error) {
    next(error);
  }
}

/** Stateless MCP over Streamable HTTP (JSON responses: Amplify buffers streams). */
export function mcpRouter(): Router {
  const router = Router();

  router.post('/', requireToken, express.json({ limit: '2mb' }), async (req, res, next) => {
    const server = buildServer(res.locals['caller'] as TokenRecord);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      next(error);
    }
  });

  router.all('/', (_req, res) => {
    res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
  });

  return router;
}
