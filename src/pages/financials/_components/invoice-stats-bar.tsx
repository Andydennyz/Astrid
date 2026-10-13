import { DollarSign, FileText, AlertTriangle, XCircle, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton.tsx";

type Stats = {
  total: number;
  paid: number;
  pending: number;
  overdue: number;
  cancelled: number;
  totalRevenue: number;
  thisMonthRevenue: number;
  lastMonthRevenue: number;
  outstandingAmount: number;
  revenueGrowth: number;
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
    label: "All Invoices",
    value: s.total,
    sub: null,
    icon: FileText,
    color: "text-cyan-400",
    bg: "bg-cyan-400/10 border-cyan-400/20",
    active: "border-cyan-400 bg-cyan-400/20",
    isCount: true,
  },
  {
    key: "paid",
    label: "Paid",
    value: s.paid,
    sub: `Ksh ${s.totalRevenue.toLocaleString()} total`,
    icon: DollarSign,
    color: "text-green-400",
    bg: "bg-green-400/10 border-green-400/20",
    active: "border-green-400 bg-green-400/20",
    isCount: true,
  },
  {
    key: "pending",
    label: "Pending",
    value: s.pending,
    sub: null,
    icon: FileText,
    color: "text-amber-400",
    bg: "bg-amber-400/10 border-amber-400/20",
    active: "border-amber-400 bg-amber-400/20",
    isCount: true,
  },
  {
    key: "overdue",
    label: "Overdue",
    value: s.overdue,
    sub: `Ksh ${s.outstandingAmount.toLocaleString()} owed`,
    icon: AlertTriangle,
    color: "text-red-400",
    bg: "bg-red-400/10 border-red-400/20",
    active: "border-red-400 bg-red-400/20",
    isCount: true,
  },
  {
    key: "this_month",
    label: "This Month",
    value: s.thisMonthRevenue,
    sub:
      s.revenueGrowth !== 0
        ? `${s.revenueGrowth > 0 ? "+" : ""}${s.revenueGrowth}% vs last month`
        : "Same as last month",
    icon: TrendingUp,
    color: s.revenueGrowth >= 0 ? "text-green-400" : "text-red-400",
    bg: "bg-primary/10 border-primary/20",
    active: "border-primary bg-primary/20",
    isCount: false,
    prefix: "Ksh",
  },
  {
    key: "outstanding",
    label: "Outstanding",
    value: s.outstandingAmount,
    sub: `${s.pending + s.overdue} unpaid invoices`,
    icon: XCircle,
    color: "text-orange-400",
    bg: "bg-orange-400/10 border-orange-400/20",
    active: "border-orange-400 bg-orange-400/20",
    isCount: false,
    prefix: "Ksh",
  },
];

export default function InvoiceStatsBar({ stats, loading, activeFilter, onFilterChange }: Props) {
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

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
      {items.map((item) => {
        const isActive = activeFilter === item.key;
        const isClickable = ["all", "paid", "pending", "overdue"].includes(item.key);
        return (
          <button
            key={item.key}
            onClick={() => isClickable && onFilterChange(item.key)}
            className={`rounded-xl border p-3 text-left transition-all duration-200 ${isClickable ? "hover:scale-[1.02] cursor-pointer" : "cursor-default"} ${isActive ? item.active : item.bg}`}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <item.icon size={11} className={item.color} />
              <span className="text-[10px] text-muted-foreground truncate">{item.label}</span>
            </div>
            <p className={`text-base font-bold ${item.color} leading-tight`}>
              {"prefix" in item && item.prefix ? (
                <span>
                  <span className="text-[10px] font-medium mr-0.5">Ksh</span>
                  {item.value.toLocaleString()}
                </span>
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
