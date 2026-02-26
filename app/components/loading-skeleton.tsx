export function LoadingSkeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div className="space-y-3 py-4">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 rounded-md bg-skeleton animate-pulse-skeleton"
          style={{ width: `${70 + Math.random() * 30}%` }}
        />
      ))}
    </div>
  );
}

export function GenerateLoadingSkeleton() {
  return (
    <div className="space-y-6 py-6">
      {/* Title skeleton */}
      <div className="h-7 w-3/4 rounded-md bg-skeleton animate-pulse-skeleton" />
      {/* Paragraph skeletons */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-4 rounded-md bg-skeleton animate-pulse-skeleton"
            style={{
              width: `${60 + Math.random() * 40}%`,
              animationDelay: `${i * 150}ms`,
            }}
          />
        ))}
      </div>
      {/* Subheading */}
      <div className="h-5 w-1/2 rounded-md bg-skeleton animate-pulse-skeleton" style={{ animationDelay: "600ms" }} />
      {/* More paragraphs */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-4 rounded-md bg-skeleton animate-pulse-skeleton"
            style={{
              width: `${50 + Math.random() * 50}%`,
              animationDelay: `${(i + 5) * 150}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
