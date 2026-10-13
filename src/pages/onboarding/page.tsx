import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Spinner } from "@/components/ui/spinner.tsx";
import OnboardingWizard from "./_components/onboarding-wizard.tsx";
import OnboardingComplete from "./_components/onboarding-complete.tsx";

export default function OnboardingPage() {
  const progress = useQuery(api.onboarding.getProgress, {});

  if (progress === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (progress === null) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Unable to load onboarding. Please refresh.
      </div>
    );
  }

  if (progress.isComplete) {
    return <OnboardingComplete progress={progress} />;
  }

  return <OnboardingWizard progress={progress} />;
}
