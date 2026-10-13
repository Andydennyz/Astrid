import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Server, Wifi, WifiOff, Wrench, Router, Network } from "lucide-react";
import { cn } from "@/lib/utils.ts";

type Stats = {
  total: number;
  online: number;
  offline: number;
  maintenance: number;
  routers: number;
  switches: number;
  accessPoints: number;
  servers: number;
};

type Props = {
  stats: Stats | undefined | null;
  loading: boolean;
  activeFilter: string;
  onFilterChange: (f: string) => void;
};

export default function DeviceStatsBar({ stats, loading, activeFilter, onFilterChange }: Props) {
  const cards = [
    {
      id: "all",
      label: "All Devices",
      value: stats?.total ?? 0,
      icon: Network,
      bg: "bg-primary/10 border-primary/20",
      color: "text-primary",
    },
    {
      id: "online",
      label: "Online",
      value: stats?.online ?? 0,
      icon: Wifi,
      bg: "bg-green-400/10 border-green-400/20",
      color: "text-green-400",
    },
    {
      id: "offline",
      label: "Offline",
      value: stats?.offline ?? 0,
      icon: WifiOff,
      bg: "bg-red-400/10 border-red-400/20",
      color: "text-red-400",
    },
    {
      id: "maintenance",
      label: "Maintenance",
      value: stats?.maintenance ?? 0,
      icon: Wrench,
      bg: "bg-amber-400/10 border-amber-400/20",
      color: "text-amber-400",
    },
    {
      id: "router",
      label: "Routers",
      value: stats?.routers ?? 0,
      icon: Router,
      bg: "bg-cyan-400/10 border-cyan-400/20",
      color: "text-cyan-400",
    },
    {
      id: "server",
      label: "Servers",
      value: stats?.servers ?? 0,
      icon: Server,
      bg: "bg-violet-400/10 border-violet-400/20",
      color: "text-violet-400",
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {cards.map((card) => (
        <button
          key={card.id}
          onClick={() => onFilterChange(card.id)}
          className={cn(
            "rounded-xl border p-3 text-left transition-all cursor-pointer",
            card.bg,
            activeFilter === card.id
              ? "ring-2 ring-offset-1 ring-offset-background ring-current/40 scale-[1.02]"
              : "hover:scale-[1.01]",
          )}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <card.icon size={11} className={card.color} />
            <p className="text-[10px] text-muted-foreground truncate">{card.label}</p>
          </div>
          <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
        </button>
      ))}
    </div>
  );
}
