import { STEPS } from "@/app/lib/constants";
import { CheckIcon } from "./icons";

interface StepIndicatorProps {
  currentStep: number;
  completedSteps: Set<number>;
}

export function StepIndicator({ currentStep, completedSteps }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((step, i) => {
        const isCompleted = completedSteps.has(step.number);
        const isCurrent = currentStep === step.number;
        const isActive = isCurrent || isCompleted;

        return (
          <div key={step.number} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all duration-300 ${
                  isCompleted
                    ? "bg-success text-white"
                    : isCurrent
                    ? "bg-accent text-white shadow-[0_0_0_4px_var(--accent-light)]"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isCompleted ? <CheckIcon className="w-4 h-4" /> : step.number}
              </div>
              <div className="text-center">
                <div
                  className={`text-xs font-medium ${
                    isActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {step.title}
                </div>
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`mx-3 mb-5 h-0.5 w-12 sm:w-20 rounded-full transition-colors duration-300 ${
                  completedSteps.has(step.number) ? "bg-success" : "bg-card-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
