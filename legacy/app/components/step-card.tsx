interface StepCardProps {
  title: string;
  description: string;
  stepNumber: number;
  isActive: boolean;
  isCompleted: boolean;
  children: React.ReactNode;
}

export function StepCard({ title, description, stepNumber, isActive, isCompleted, children }: StepCardProps) {
  return (
    <div
      className={`rounded-xl border transition-all duration-300 ${
        isActive
          ? "border-accent/40 bg-card shadow-sm"
          : isCompleted
          ? "border-success/30 bg-card"
          : "border-card-border bg-card opacity-50 pointer-events-none"
      }`}
    >
      <div className="border-b border-card-border px-5 py-3.5 sm:px-6">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
              isCompleted
                ? "bg-success/10 text-success"
                : isActive
                ? "bg-accent/10 text-accent"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {stepNumber}
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  );
}
