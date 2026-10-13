import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Package, Wifi, Radio, Globe, CheckCircle, XCircle } from "lucide-react";

type Stats = {
  total: number;
  active: number;
  inactive: number;
  pppoe: number;
  hotspot: number;
  static: number;
};

type Props = {
  stats: Stats | undefined;
  loading: boolean;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
};

const cards = [
  { key: "all", label: "Total Packages", icon: Package, color: "text-violet-400", bg: "bg-violet-400/10 border-violet-400/20", getValue: (s: Stats) => s.total },
  { key: "active", label: "Active", icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20", getValue: (s: Stats) => s.active },
  { key: "inactive", label: "Inactive", icon: XCircle, color: "text-red-400", bg: "bg-red-400/10 border-red-400/20", getValue: (s: Stats) => s.inactive },
  { key: "pppoe", label: "PPPoE", icon: Wifi, color: "text-cyan-400", bg: "bg-cyan-400/10 border-cyan-400/20", getValue: (s: Stats) => s.pppoe },
  { key: "hotspot", label: "Hotspot", icon: Radio, color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20", getValue: (s: Stats) => s.hotspot },
  { key: "static", label: "Static", icon: Globe, color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/20", getValue: (s: Stats) => s.static },
];

export default function PackageStatsBar({ stats, loading, activeFilter, onFilterChange }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
      {cards.map(({ key, label, icon: Icon, color, bg, getValue }) => {
        const isActive = activeFilter === key;
        return (
          <button
            key={key}
            onClick={() => onFilterChange(key)}
            className={`relative flex flex-col gap-1 p-3 rounded-xl border text-left transition-all cursor-pointer ${
              isActive
                ? "bg-primary/10 border-primary/40 shadow-sm"
                : "bg-card border-border hover:border-primary/20 hover:bg-card/80"
            }`}
          >
            <div className={`h-6 w-6 rounded-md border flex items-center justify-center ${bg}`}>
              <Icon size={12} className={color} />
            </div>
            <div className={`text-lg font-bold leading-none ${color}`}>
              {stats ? getValue(stats) : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground font-medium leading-tight">{label}</div>
          </button>
        );
      })}
    </div>
  );
}
