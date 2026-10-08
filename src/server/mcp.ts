import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { signedUploadUrl } from './image-upload';
import { NOTE_TYPES, NoteType, writingGuidelines } from './release-notes/guidelines';
import { buildJiraContextMulti } from './release-notes/jira';
import { navigationGuide, PLATFORMS } from './release-notes/navigation';
import { notionOptions, publishReleaseNote } from './release-notes/notion';
import { findActiveToken, TokenRecord } from './token-store';

const JIRA_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;

// Users say "dev" for the test database; both mean "Overall Achievements [ TEST ]".
const ENV_INPUT = z.enum(['test', 'dev', 'prod']);
const toEnv = (env: z.infer<typeof ENV_INPUT>) => (env === 'prod' ? 'prod' : 'test');

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });
const fail = (error: unknown) => ({
  isError: true,
  ...text(`Error: ${error instanceof Error ? error.message : String(error)}`),
});

/** The conversation every client must follow (prompt + server instructions). */
const FLOW = `Release note flow — follow it in order, one question at a time, and wait for the user's answer at every step marked ASK:
1. ASK which Jira activity (ticket key or keys) the note is for, unless already given.
2. Call get_jira_context. Show a SHORT summary (max 5 lines): ticket title, what was built, how many sub-items were read, how many images were found. ASK: "Is this the activity you need?"
3. Images. If Jira has images, list them and ASK whether to add more. If there are none, ASK the user to send images (public URLs or local file paths) or offer to take screenshots automatically:
   - Call get_navigation_guide (platform "prms" for PRMS Reporting Tool, otherwise "other") and follow it.
   - If you do not understand what the change is or where it lives, ASK the user to explain it before navigating.
   - ASK which environment to capture (TEST or PRODUCTION) and ask the user to log in themselves in the opened browser. Never handle passwords.
   - Navigate following the Jira activity, take the screenshots, show them and ASK if they work.
   - Upload every local image with get_image_upload_url + curl, and use the returned ref as the image URL.
4. Call get_writing_guidelines (note_type "standard" unless the user or the size of the change says brief/detailed) and write the note following it exactly. Show the title, brief description, tag, projects and the full note. ASK for approval or changes.
5. ASK: "Where do I publish it: TEST (dev) or PRODUCTION?". Call get_notion_options for that environment to choose Tag and Projects.
6. Call publish_release_note with that environment only after the user approved. Reply with the Notion URL.`;

function buildServer(caller: TokenRecord, baseUrl: string): McpServer {
  const server = new McpServer({ name: 'ibd-release-notes', version: '2.0.0' }, { instructions: FLOW });

  server.registerTool(
    'get_jira_context',
    {
      title: 'Get Jira context',
      description:
        'Fetches one or more Jira issues with their children (stories, subtasks), descriptions, recent comments and image attachments, as text to write a release note from.',
      inputSchema: { issue_keys: z.array(z.string().regex(JIRA_KEY)).min(1).max(10) },
    },
    async ({ issue_keys }) => {
      try {
        const { jira_context, reporters, images } = await buildJiraContextMulti(issue_keys);
        if (!jira_context) return fail(`No Jira issue could be read for ${issue_keys.join(', ')}`);
        const imageList = images.length
          ? images.map((i) => `- [${i.issue}] ${i.filename}: ${i.url}`).join('\n')
          : '(none)';
        return text(
          `${jira_context}\n\nJira Reporter(s): ${reporters.join(', ')}\n\n` +
            `## Images attached in Jira\n${imageList}\n\n` +
            `Include EVERY image above in the note (skip none), each on its own line as ![short caption](<url>): ` +
            `right after the sentence it supports, or under a final "### Screenshots" heading if no relation is clear. ` +
            `On publish the server uploads them into Notion, so the page hosts the images itself.`,
        );
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
        'Returns the IBD house standard for release notes. Read it BEFORE writing, then write the note yourself in Markdown following it exactly.',
      inputSchema: { note_type: z.enum(NOTE_TYPES).default('standard') },
    },
    async ({ note_type }) => text(writingGuidelines(note_type)),
  );

  server.registerTool(
    'get_navigation_guide',
    {
      title: 'Get navigation guide for screenshots',
      description:
        'How to log in safely and navigate a platform to take screenshots of the changed screens (environments, menu paths, URL patterns).',
      inputSchema: { platform: z.enum(PLATFORMS) },
    },
    async ({ platform }) => text(navigationGuide(platform)),
  );

  server.registerTool(
    'get_image_upload_url',
    {
      title: 'Get an upload URL for a local image',
      description:
        'Returns a one-time URL (valid 15 minutes) to upload a local screenshot to Notion. Upload with: ' +
        'curl -s -X POST -H "Content-Type: image/png" --data-binary @<file.png> "<url>" — the response has a "ref"; ' +
        'use it as the image URL in the note: ![caption](ref). Max 5 MB per image; publish within 1 hour.',
      inputSchema: {},
    },
    async () => {
      try {
        const { url, expires } = signedUploadUrl(baseUrl);
        return text(`Upload URL (expires ${expires}):\n${url}`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'get_notion_options',
    {
      title: 'Get Notion tags and projects',
      description: 'Lists the valid Tags and Projects of the Notion release notes database for an environment.',
      inputSchema: { env: ENV_INPUT },
    },
    async ({ env }) => {
      try {
        return text(JSON.stringify(await notionOptions(toEnv(env)), null, 2));
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
        'Creates the release note page in Notion and hosts its images in Notion. Call it only after the user approved the note. ' +
        'env is REQUIRED and must come from the user: ASK "TEST (dev) or PRODUCTION?" first. ' +
        '"test"/"dev" = Overall Achievements [ TEST ], "prod" = the real Overall Achievements.',
      inputSchema: {
        title: z.string().min(1).max(2000),
        markdown: z.string().min(1),
        brief_description: z.string().max(2000).optional(),
        tag: z.string().optional(),
        projects: z.array(z.string()).optional(),
        released_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        cover_url: z.string().url().optional(),
        env: ENV_INPUT,
      },
    },
    async (input) => {
      try {
        const env = toEnv(input.env);
        const page = await publishReleaseNote({ ...input, env });
        if (page.duplicate) return text(`Already published moments ago (not duplicated): ${page.url}`);
        console.log(`[mcp] ${caller.owner} published "${input.title}" to Notion ${env}`);
        return text(`Published to Notion (${env}) with ${page.images} image(s): ${page.url}`);
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
        'Guided flow: Jira activity → short summary to confirm → images or automatic screenshots → note in the IBD standard → TEST or PRODUCTION → Notion URL.',
      argsSchema: {
        issue_keys: z.string().optional().describe('Jira keys separated by commas (if empty, Claude asks)'),
        note_type: z.string().optional().describe('brief | standard | detailed (default standard)'),
      },
    },
    ({ issue_keys, note_type }) => {
      const type = (NOTE_TYPES as readonly string[]).includes(note_type ?? '') ? (note_type as NoteType) : 'standard';
      const keys = issue_keys?.trim();
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                (keys ? `I want a release note for: ${keys}.\n\n` : `I want to create a release note.\n\n`) +
                `${FLOW}\n\nUse note_type "${type}" unless I say otherwise.\n\n# Writing guidelines\n\n${writingGuidelines(type)}`,
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

/** Public origin of this deployment (Amplify sits behind CloudFront). */
function baseUrlOf(req: Request): string {
  const host = req.get('x-forwarded-host') ?? req.get('host');
  const proto = req.get('x-forwarded-proto')?.split(',')[0] ?? (host?.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** Stateless MCP over Streamable HTTP (JSON responses: Amplify buffers streams). */
export function mcpRouter(): Router {
  const router = Router();

  router.post('/', requireToken, express.json({ limit: '2mb' }), async (req, res, next) => {
    const server = buildServer(res.locals['caller'] as TokenRecord, baseUrlOf(req));
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
