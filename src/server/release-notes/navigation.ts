// How to reach screens to take screenshots. Public UI knowledge only: no credentials,
// no personal accounts, no internal hosts beyond the public web apps.

export const PLATFORMS = ['prms', 'other'] as const;
export type Platform = (typeof PLATFORMS)[number];

const COMMON = `## Taking screenshots (any platform)
1. Browser. You need browser tools (Playwright MCP: browser_navigate, browser_take_screenshot…). If you do not have them, ASK permission to install Playwright MCP (needs Node.js 18+); after installing, the user restarts the client and comes back:
   - Claude Code: run \`claude mcp add playwright npx @playwright/mcp@latest\`.
   - Cursor: add to ~/.cursor/mcp.json (merge, keep the other servers): "playwright": { "command": "npx", "args": ["@playwright/mcp@latest"] }.
   - Claude desktop: Settings → Developer → Edit Config → add the same "playwright" entry under "mcpServers" in claude_desktop_config.json.
   - Clients that cannot run a local browser (ChatGPT, Claude on the web): ask the user for the screenshots instead.
2. Environment: ONLY a test or development environment, NEVER production. ASK the user to confirm the TEST/DEV base URL (propose the one below when the platform is known). If they give a production URL or do not know the test one, explain that screenshots are only taken in test so real data is never touched, and ask for the test URL.
3. Login. Open a VISIBLE browser window on that URL. ASK if the user has done this before; if not, explain it step by step:
   - "A browser window opened on <URL>."
   - "Log in there with your usual account, as you always do (CGIAR single sign-on or email and password)."
   - "When you see the home page, come back here and write: done."
   - "Never type your password in this chat."
   Never ask for, type or store passwords.
- Follow the Jira activity: read its "How to verify" / acceptance criteria and navigate step by step to the screen that changed. Prefer the record or example IDs the ticket mentions.
- If you cannot tell which screen shows the change, ask the user to explain what it is and where it lives before navigating.
- Capture only the relevant area at a readable size (viewport ~1440x900). Avoid personal data on screen (names, emails) when an alternative record exists.
- Save each screenshot as PNG, then upload it with get_image_upload_url and use the returned ref.`;

const PRMS = `## PRMS Reporting Tool
- TEST (use this one): https://prtest.ciat.cgiar.org · PRODUCTION (never open it for screenshots): https://reporting.cgiar.org
- Login: CGIAR account (single sign-on) or external user with email and password — the user logs in.
- Landing after login: Result Framework reporting (/result-framework-reporting/home).
- Main areas and paths:
  - Results list: /result (open a result → Result detail with a left panel of sections: General information, Contributors and partners, Geographic location, Evidence, and the type-specific section such as Innovation development, Innovation use, Policy change, Capacity sharing, Knowledge product).
  - Result detail URL pattern: /result/result-detail/<result code>/general-information?phase=<phase id> (change the last segment for another section, e.g. /evidences).
  - Innovation packages (IPSR): /ipsr → list → open a package → steps: General information, Step 1, Step 2, Step 3 "Package and Assess", Step 4.
  - Type 1 report: /type-one-report (Fact sheet, Progress, Key results, Partnerships, Portfolio linkages, Key result story).
  - Outcome indicators: /outcome-indicator-module/home.
  - My Admin (initiative level): /init-admin-module (completeness status, general results report).
  - Admin (admins only): /admin-module (completeness status, phase management, knowledge products, tickets dashboard, user management).
  - What's new: /whats-new/home.
  - PDF of a result: /reports/result-details/<result code>.
- Phase matters: many screens depend on the reporting phase selected; use the phase the ticket mentions.`;

const OTHER = `## Other platforms (CLARISA, MARLO, AICCRA, STAR, dashboards)
- Ask the user for the base URL of the TEST or DEV environment (never production) and the menu path to the changed screen.`;

export function navigationGuide(platform: Platform): string {
  return [COMMON, platform === 'prms' ? PRMS : OTHER].join('\n\n');
}
