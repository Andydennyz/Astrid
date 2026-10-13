import { DollarSign, CheckCircle, Clock, XCircle, TrendingUp, Smartphone } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton.tsx";

type Stats = {
  total: number;
  completed: number;
  pending: number;
  failed: number;
  totalVolume: number;
  thisMonthVolume: number;
  todayVolume: number;
  mpesaVolume: number;
  cashVolume: number;
  cardVolume: number;
  bankVolume: number;
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
    label: "All",
    value: s.total,
    sub: null,
    icon: DollarSign,
    color: "text-cyan-400",
    bg: "bg-cyan-400/10 border-cyan-400/20",
    active: "border-cyan-400 bg-cyan-400/20",
    prefix: false,
  },
  {
    key: "completed",
    label: "Completed",
    value: s.completed,
    sub: `Ksh ${s.totalVolume.toLocaleString()} total`,
    icon: CheckCircle,
    color: "text-green-400",
    bg: "bg-green-400/10 border-green-400/20",
    active: "border-green-400 bg-green-400/20",
    prefix: false,
  },
  {
    key: "pending",
    label: "Pending",
    value: s.pending,
    sub: null,
    icon: Clock,
    color: "text-amber-400",
    bg: "bg-amber-400/10 border-amber-400/20",
    active: "border-amber-400 bg-amber-400/20",
    prefix: false,
  },
  {
    key: "failed",
    label: "Failed",
    value: s.failed,
    sub: null,
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-400/10 border-red-400/20",
    active: "border-red-400 bg-red-400/20",
    prefix: false,
  },
  {
    key: "this_month",
    label: "This Month",
    value: s.thisMonthVolume,
    sub: `Today Ksh ${s.todayVolume.toLocaleString()}`,
    icon: TrendingUp,
    color: "text-primary",
    bg: "bg-primary/10 border-primary/20",
    active: "border-primary bg-primary/20",
    prefix: true,
  },
  {
    key: "mpesa",
    label: "M-Pesa",
    value: s.mpesaVolume,
    sub: `Cash Ksh ${s.cashVolume.toLocaleString()}`,
    icon: Smartphone,
    color: "text-green-300",
    bg: "bg-green-300/10 border-green-300/20",
    active: "border-green-300 bg-green-300/20",
    prefix: true,
  },
];

export default function TransactionStatsBar({
  stats,
  loading,
  activeFilter,
  onFilterChange,
}: Props) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const items = ITEMS(stats);
  const clickable = ["all", "completed", "pending", "failed"];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
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
            <p className={`text-base font-bold ${item.color} leading-tight`}>
              {item.prefix ? (
                <>
                  <span className="text-[10px] font-medium mr-0.5">Ksh</span>
                  {item.value.toLocaleString()}
                </>
              ) : (
                item.value.toLocaleString()
              )}
            </p>
            {item.sub && (
              <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{item.sub}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
