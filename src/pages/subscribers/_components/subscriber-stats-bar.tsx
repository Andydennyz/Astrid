import { Users, Wifi, ShieldBan, Clock, CheckCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton.tsx";

type Stats = {
  total: number;
  active: number;
  suspended: number;
  expired: number;
  pending: number;
  online: number;
  pppoe: number;
  hotspot: number;
  staticConn: number;
};

type Props = {
  stats?: Stats;
  loading: boolean;
  onFilterChange: (status: string) => void;
  activeFilter: string;
};

const STAT_ITEMS = (s: Stats) => [
  {
    key: "all",
    label: "All",
    value: s.total,
    icon: Users,
    color: "text-cyan-400",
    bg: "bg-cyan-400/10 border-cyan-400/20",
    active: "border-cyan-400 bg-cyan-400/20",
  },
  {
    key: "active",
    label: "Active",
    value: s.active,
    icon: CheckCircle,
    color: "text-green-400",
    bg: "bg-green-400/10 border-green-400/20",
    active: "border-green-400 bg-green-400/20",
  },
  {
    key: "suspended",
    label: "Suspended",
    value: s.suspended,
    icon: ShieldBan,
    color: "text-amber-400",
    bg: "bg-amber-400/10 border-amber-400/20",
    active: "border-amber-400 bg-amber-400/20",
  },
  {
    key: "expired",
    label: "Expired",
    value: s.expired,
    icon: Clock,
    color: "text-red-400",
    bg: "bg-red-400/10 border-red-400/20",
    active: "border-red-400 bg-red-400/20",
  },
  {
    key: "pending",
    label: "Pending",
    value: s.pending,
    icon: Clock,
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/20",
    active: "border-blue-400 bg-blue-400/20",
  },
  {
    key: "online",
    label: "Online Now",
    value: s.online,
    icon: Wifi,
    color: "text-primary",
    bg: "bg-primary/10 border-primary/20",
    active: "border-primary bg-primary/20",
  },
];

export default function SubscriberStatsBar({ stats, loading, onFilterChange, activeFilter }: Props) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const items = STAT_ITEMS(stats);

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {items.map((item) => {
        const isActive = activeFilter === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onFilterChange(item.key)}
            className={`rounded-xl border p-3 text-left transition-all duration-200 hover:scale-[1.02] ${
              isActive ? item.active : item.bg
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <item.icon size={12} className={item.color} />
              <span className="text-[10px] text-muted-foreground truncate">{item.label}</span>
            </div>
            <p className={`text-lg font-bold ${item.color}`}>
              {item.value.toLocaleString()}
            </p>
          </button>
        );
      })}
    </div>
  );
}
