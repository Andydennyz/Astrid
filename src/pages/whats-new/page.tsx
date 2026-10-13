import ComingSoonPage from "../_components/coming-soon-page.tsx";
import { Sparkles, Star, Zap, ArrowUp, Bell, Calendar } from "lucide-react";

export default function WhatsNewPage() {
  return (
    <ComingSoonPage
      title="What's New"
      description="Stay up to date with the latest features, improvements and updates to your NetAdmin operator portal."
      icon={Sparkles}
      accentColor="text-yellow-400"
      features={[
        { icon: Star, label: "Feature Highlights", description: "Detailed changelog for every release" },
        { icon: Zap, label: "Performance Updates", description: "Speed and reliability improvements" },
        { icon: ArrowUp, label: "Version History", description: "Browse all past releases" },
        { icon: Bell, label: "Release Alerts", description: "Get notified of new updates by email" },
        { icon: Calendar, label: "Roadmap", description: "See what's coming in future releases" },
        { icon: Sparkles, label: "Beta Features", description: "Opt in to test upcoming features early" },
      ]}
    />
  );
}
