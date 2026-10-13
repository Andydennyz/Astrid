import {
  TicketCheck, AlertTriangle, Zap, Clock, CheckCircle2, XCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton.tsx";

type Stats = {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  critical: number;
  high: number;
  connectivity: number;
  billing: number;
};

type Props = {
  stats?: Stats;
  loading: boolean;
  activeFilter: string;
  onFilterChange: (f: string) => void;
};

const ITEMS = (s: Stats) => [
  {
    key: "all",
    label: "All Tickets",
    value: s.total,
    sub: null,
    icon: TicketCheck,
    color: "text-violet-400",
    bg: "bg-violet-400/10 border-violet-400/20",
    active: "border-violet-400 bg-violet-400/20",
  },
  {
    key: "open",
    label: "Open",
    value: s.open,
    sub: null,
    icon: Clock,
    color: "text-amber-400",
    bg: "bg-amber-400/10 border-amber-400/20",
    active: "border-amber-400 bg-amber-400/20",
  },
  {
    key: "in_progress",
    label: "In Progress",
    value: s.inProgress,
    sub: null,
    icon: Zap,
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/20",
    active: "border-blue-400 bg-blue-400/20",
  },
  {
    key: "resolved",
    label: "Resolved",
    value: s.resolved,
    sub: null,
    icon: CheckCircle2,
    color: "text-green-400",
    bg: "bg-green-400/10 border-green-400/20",
    active: "border-green-400 bg-green-400/20",
  },
  {
    key: "critical",
    label: "Critical",
    value: s.critical,
    sub: `${s.high} high priority`,
    icon: AlertTriangle,
    color: "text-red-400",
    bg: "bg-red-400/10 border-red-400/20",
    active: "border-red-400 bg-red-400/20",
  },
  {
    key: "closed",
    label: "Closed",
    value: s.closed,
    sub: null,
    icon: XCircle,
    color: "text-muted-foreground",
    bg: "bg-muted/10 border-border",
    active: "border-muted-foreground bg-muted/20",
  },
];

export default function TicketStatsBar({ stats, loading, activeFilter, onFilterChange }: Props) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const items = ITEMS(stats);
  const clickable = ["all", "open", "in_progress", "resolved", "closed"];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {items.map((item) => {
        const isActive = activeFilter === item.key;
        const isClickable = clickable.includes(item.key);
        return (
          <button
            key={item.key}
            onClick={() => isClickable && onFilterChange(item.key)}
            className={`rounded-xl border p-3 text-left transition-all duration-200 ${
              isClickable ? "hover:scale-[1.02] cursor-pointer" : "cursor-default"
            } ${isActive ? item.active : item.bg}`}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <item.icon size={11} className={item.color} />
              <span className="text-[10px] text-muted-foreground truncate">{item.label}</span>
            </div>
            <p className={`text-lg font-bold ${item.color}`}>{item.value.toLocaleString()}</p>
            {item.sub && (
              <p className="text-[9px] text-muted-foreground mt-0.5">{item.sub}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
