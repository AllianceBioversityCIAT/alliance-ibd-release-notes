// Shared GitHub helpers used by /commits and /generate routes

type Commit = Record<string, unknown>;

export function filterAndFormatCommits(
  commits: Commit[],
  ticketId: string
): { ticket: string; total: number; commits: Commit[]; release_notes_input: string } {
  const filtered = commits
    .filter((c) => {
      const msg = ((c.commit as Commit).message as string) ?? "";
      return msg.includes(ticketId) && !msg.startsWith("Merge branch '");
    })
    .map((c) => ({
      sha: (c.sha as string).substring(0, 7),
      message: (c.commit as Commit).message as string,
      author: ((c.commit as Commit).author as Commit).name as string,
      github_user:
        (c.author as Commit)?.login
          ? `@${(c.author as Commit).login}`
          : "unknown",
      date: ((c.commit as Commit).author as Commit).date as string,
    }));

  let text = `## Commits for ${ticketId}\nTotal: ${filtered.length}\n\n`;

  filtered.forEach((c) => {
    const title = c.message.split("\n")[0];
    const body = c.message.split("\n").slice(2).join(" ").trim();
    text += `[${c.sha}] ${title}`;
    if (body) text += `\n  → ${body}`;
    text += `\n  by ${c.github_user} on ${c.date.split("T")[0]}\n\n`;
  });

  return { ticket: ticketId, total: filtered.length, commits: filtered, release_notes_input: text };
}

export async function fetchGitHubCommits(
  owner: string,
  repo: string,
  branch: string
): Promise<Commit[]> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`GitHub responded with ${res.status}`);
  }

  return res.json();
}
