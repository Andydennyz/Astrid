import { cn } from "@/lib/utils.ts";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton.tsx";

type StatsCardProps = {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  iconBg: string;
  iconColor: string;
  glowColor: string;
  trend?: { value: number; isPositive: boolean };
  subStats?: string;
  loading?: boolean;
  prefix?: string;
};

export default function StatsCard({
  title,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  glowColor,
  trend,
  subStats,
  loading = false,
  prefix = "",
}: StatsCardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-3 w-36" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative rounded-xl border border-border bg-card p-4 overflow-hidden",
        "transition-all duration-300 hover:border-opacity-80 group",
        `hover:shadow-[0_0_20px_${glowColor}]`,
      )}
    >
      {/* Subtle gradient glow top-right */}
      <div
        className={cn(
          "absolute -top-6 -right-6 h-16 w-16 rounded-full opacity-20 blur-xl transition-opacity group-hover:opacity-30",
          iconBg,
        )}
      />

      <div className="flex items-start justify-between">
        <div className="space-y-1 min-w-0 flex-1 mr-3">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground truncate">
            {title}
          </p>
          <div className="flex items-baseline gap-1.5">
            {prefix && (
              <span className="text-sm font-semibold text-muted-foreground">{prefix}</span>
            )}
            <p className="text-2xl font-bold text-foreground leading-none">
              {typeof value === "number" ? value.toLocaleString() : value}
            </p>
          </div>
          {trend && (
            <div
              className={cn(
                "flex items-center gap-1 text-xs font-medium",
                trend.isPositive ? "text-green-400" : "text-red-400",
              )}
            >
              {trend.isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              <span>{trend.isPositive ? "+" : ""}{trend.value.toFixed(1)}%</span>
            </div>
          )}
          {subStats && (
            <p className="text-[11px] text-muted-foreground truncate pt-0.5">{subStats}</p>
          )}
        </div>

        {/* Icon */}
        <div
          className={cn(
            "shrink-0 flex h-10 w-10 items-center justify-center rounded-lg border",
            iconBg,
            "border-current/20",
          )}
        >
          <Icon size={18} className={iconColor} />
        </div>
      </div>
    </div>
  );
}
