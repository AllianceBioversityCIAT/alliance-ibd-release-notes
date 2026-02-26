import { ReleaseNotesWizard } from "./components/release-notes-wizard";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-card-border bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
                <path d="M10 9H8" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground tracking-tight">Release Notes Generator</h1>
              <p className="text-xs text-muted-foreground">Jira + GitHub + AI</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
        <ReleaseNotesWizard />
      </main>
    </div>
  );
}
