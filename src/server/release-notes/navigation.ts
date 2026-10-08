// How to reach screens to take screenshots. Public UI knowledge only: no credentials,
// no personal accounts, no internal hosts beyond the public web apps.

export const PLATFORMS = ['prms', 'other'] as const;
export type Platform = (typeof PLATFORMS)[number];

const COMMON = `## Taking screenshots (any platform)
- Use the browser automation you have (e.g. Playwright tools). Open a VISIBLE browser window.
- Never ask for, type or store passwords. If the app shows a login page, ask the user to log in themselves in that window and tell you when they are done.
- Ask which environment to capture: TEST (pre-production) or PRODUCTION, and confirm the base URL.
- Follow the Jira activity: read its "How to verify" / acceptance criteria and navigate step by step to the screen that changed. Prefer the record or example IDs the ticket mentions.
- If you cannot tell which screen shows the change, ask the user to explain what it is and where it lives before navigating.
- Capture only the relevant area at a readable size (viewport ~1440x900). Avoid personal data on screen (names, emails) when an alternative record exists.
- Save each screenshot as PNG, then upload it with get_image_upload_url and use the returned ref.`;

const PRMS = `## PRMS Reporting Tool
- PRODUCTION: https://reporting.cgiar.org · TEST: https://prtest.ciat.cgiar.org
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
- Ask the user for the base URL of the environment to capture and the menu path to the changed screen.`;

export function navigationGuide(platform: Platform): string {
  return [COMMON, platform === 'prms' ? PRMS : OTHER].join('\n\n');
}
