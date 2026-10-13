import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button.tsx";
import {
  CheckCircle,
  LayoutDashboard,
  Users,
  Network,
  Package,
  Zap,
} from "lucide-react";

interface OnboardingProgress {
  steps: Record<string, boolean>;
  completedCount: number;
  totalSteps: number;
  isComplete: boolean;
  user: { name?: string; companyName?: string };
}

interface Props {
  progress: OnboardingProgress;
}

const QUICK_LINKS = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, color: "text-primary" },
  { label: "Subscribers", to: "/subscribers", icon: Users, color: "text-cyan-400" },
  { label: "Network", to: "/network", icon: Network, color: "text-green-400" },
  { label: "Packages", to: "/packages", icon: Package, color: "text-violet-400" },
];

export default function OnboardingComplete({ progress }: Props) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="max-w-lg w-full text-center space-y-8">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="flex h-20 w-20 mx-auto items-center justify-center rounded-full border-2 border-green-500/40 bg-green-500/10"
        >
          <CheckCircle size={40} className="text-green-400" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="space-y-3"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-xs font-semibold text-primary">
            <Zap size={11} className="animate-pulse" />
            All {progress.totalSteps} steps complete
          </div>

          <h1 className="text-3xl font-bold text-foreground">
            {progress.user.companyName
              ? `${progress.user.companyName} is live!`
              : "You're all set!"}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your operator portal is fully configured. Head to the dashboard to
            monitor your network, manage subscribers, and track revenue in real time.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="grid grid-cols-2 gap-3"
        >
          {QUICK_LINKS.map((link) => (
            <Link key={link.to} to={link.to}>
              <div className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background">
                  <link.icon size={15} className={link.color} />
                </div>
                <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                  {link.label}
                </span>
              </div>
            </Link>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <Button asChild size="lg" className="gap-2">
            <Link to="/dashboard">
              <LayoutDashboard size={16} />
              Go to Dashboard
            </Link>
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
