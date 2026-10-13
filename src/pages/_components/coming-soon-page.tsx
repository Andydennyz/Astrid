
import { cn } from "@/lib/utils.ts";
import { Construction } from "lucide-react";
import { motion } from "motion/react";

type Feature = {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  description: string;
};

type ComingSoonPageProps = {
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accentColor?: string;
  features?: Feature[];
};

export default function ComingSoonPage({
  title,
  description,
  icon: PageIcon,
  accentColor = "text-primary",
  features = [],
}: ComingSoonPageProps) {
  return (
    <div className="p-4 lg:p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-2xl mx-auto mt-8"
      >
        <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className={cn("relative h-20 w-20 rounded-2xl flex items-center justify-center",
              "bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/20",
            )}>
              <PageIcon size={36} className={accentColor} />
              <div className="absolute inset-0 rounded-2xl bg-primary/5 blur-lg" />
            </div>
          </div>

          {/* Text */}
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Construction size={14} className="text-amber-400" />
              <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">
                Coming Soon
              </span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              {description}
            </p>
          </div>

          {/* Features preview */}
          {features.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {features.map((feature) => (
                <div
                  key={feature.label}
                  className="flex items-start gap-3 rounded-lg border border-border bg-background/50 p-3 text-left"
                >
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <feature.icon size={14} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{feature.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Progress indicator */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Development progress</span>
              <span className="text-primary font-medium">In Queue</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
              <div className="h-full w-1/4 rounded-full bg-gradient-to-r from-primary to-accent animate-pulse" />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
