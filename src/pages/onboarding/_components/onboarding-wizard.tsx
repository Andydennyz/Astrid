import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import StepProfile from "./step-profile.tsx";
import StepPackage from "./step-package.tsx";
import StepNetwork from "./step-network.tsx";
import StepSubscriber from "./step-subscriber.tsx";
import {
  User,
  Package,
  Network,
  Users,
  CheckCircle,
  ChevronRight,
} from "lucide-react";

type StepId = "profile" | "packages" | "network" | "subscribers";

interface Step {
  id: StepId;
  label: string;
  icon: React.ElementType;
  description: string;
}

const STEPS: Step[] = [
  {
    id: "profile",
    label: "Company Profile",
    icon: User,
    description: "Set up your ISP identity",
  },
  {
    id: "packages",
    label: "Service Package",
    icon: Package,
    description: "Create your first internet plan",
  },
  {
    id: "network",
    label: "Network Device",
    icon: Network,
    description: "Register your core router",
  },
  {
    id: "subscribers",
    label: "First Subscriber",
    icon: Users,
    description: "Add your first customer",
  },
];

interface OnboardingProgress {
  steps: Record<StepId, boolean>;
  completedCount: number;
  totalSteps: number;
  isComplete: boolean;
  user: {
    name?: string;
    email?: string;
    companyName?: string;
  };
}

interface Props {
  progress: OnboardingProgress;
}

export default function OnboardingWizard({ progress }: Props) {
  // Start at the first incomplete step
  const firstIncomplete = STEPS.findIndex((s) => !progress.steps[s.id]);
  const [activeStep, setActiveStep] = useState(firstIncomplete >= 0 ? firstIncomplete : 0);
  const [completedThisSession, setCompletedThisSession] = useState<Set<StepId>>(new Set());

  const markComplete = (id: StepId) => {
    setCompletedThisSession((prev) => new Set([...prev, id]));
    // Advance to next incomplete step
    const nextIdx = STEPS.findIndex(
      (s, i) => i > activeStep && !progress.steps[s.id] && !completedThisSession.has(s.id) && s.id !== id,
    );
    if (nextIdx >= 0) setActiveStep(nextIdx);
  };

  const isStepDone = (id: StepId) => progress.steps[id] || completedThisSession.has(id);
  const totalDone = STEPS.filter((s) => isStepDone(s.id)).length;
  const pct = Math.round((totalDone / STEPS.length) * 100);

  return (
    <div className="min-h-full bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Setup Wizard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Complete these steps to get your operator portal fully configured.
          </p>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{totalDone} of {STEPS.length} steps complete</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5, ease: "easeOut" as const }}
            />
          </div>
        </div>

        {/* Step tabs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {STEPS.map((step, i) => {
            const done = isStepDone(step.id);
            const active = activeStep === i;
            const Icon = step.icon;
            return (
              <button
                key={step.id}
                onClick={() => setActiveStep(i)}
                className={`group relative flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all cursor-pointer
                  ${active
                    ? "border-primary bg-primary/10 shadow-[0_0_16px_rgba(0,200,255,0.08)]"
                    : done
                    ? "border-green-500/30 bg-green-500/5 hover:border-green-500/50"
                    : "border-border bg-card hover:border-primary/30"
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-lg border text-xs font-bold
                      ${active ? "border-primary bg-primary text-primary-foreground"
                        : done ? "border-green-500 bg-green-500/10 text-green-400"
                        : "border-border bg-muted text-muted-foreground"}`}
                  >
                    {done ? <CheckCircle size={14} /> : <Icon size={14} />}
                  </div>
                  {active && <ChevronRight size={12} className="text-primary" />}
                </div>
                <div>
                  <p className={`text-xs font-semibold ${active ? "text-primary" : done ? "text-green-400" : "text-foreground"}`}>
                    {step.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{step.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeStep}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {activeStep === 0 && (
              <StepProfile
                user={progress.user}
                isDone={isStepDone("profile")}
                onComplete={() => markComplete("profile")}
              />
            )}
            {activeStep === 1 && (
              <StepPackage
                isDone={isStepDone("packages")}
                onComplete={() => markComplete("packages")}
              />
            )}
            {activeStep === 2 && (
              <StepNetwork
                isDone={isStepDone("network")}
                onComplete={() => markComplete("network")}
              />
            )}
            {activeStep === 3 && (
              <StepSubscriber
                isDone={isStepDone("subscribers")}
                onComplete={() => markComplete("subscribers")}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
