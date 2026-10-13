import { cn } from "@/lib/utils.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Smartphone,
  Banknote,
  CreditCard,
  Building2,
  Wallet,
} from "lucide-react";

type Transaction = {
  _id: string;
  subscriberName: string;
  amount: number;
  type: string;
  method: string;
  status: string;
  reference: string | undefined;
  createdAt: string;
};

type RecentTransactionsProps = {
  data: Transaction[];
  loading?: boolean;
};

const methodIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  mpesa: Smartphone,
  cash: Banknote,
  card: CreditCard,
  bank: Building2,
  paypal: Wallet,
};

const methodColors: Record<string, string> = {
  mpesa: "text-green-400 bg-green-400/10",
  cash: "text-amber-400 bg-amber-400/10",
  card: "text-cyan-400 bg-cyan-400/10",
  bank: "text-blue-400 bg-blue-400/10",
  paypal: "text-indigo-400 bg-indigo-400/10",
};

const StatusBadge = ({ status }: { status: string }) => {
  const config = {
    completed: {
      icon: CheckCircle2,
      label: "Completed",
      className: "text-green-400 bg-green-400/10 border-green-400/20",
    },
    pending: {
      icon: Clock,
      label: "Pending",
      className: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    },
    failed: {
      icon: XCircle,
      label: "Failed",
      className: "text-red-400 bg-red-400/10 border-red-400/20",
    },
  }[status] ?? {
    icon: Clock,
    label: status,
    className: "text-muted-foreground bg-muted border-border",
  };

  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        config.className,
      )}
    >
      <Icon size={10} />
      {config.label}
    </span>
  );
};

export default function RecentTransactions({ data, loading = false }: RecentTransactionsProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
          <Wallet size={20} className="text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No transactions yet</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Transactions will appear here once recorded
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((tx) => {
        const MethodIcon = methodIcons[tx.method] ?? Wallet;
        const methodStyle = methodColors[tx.method] ?? "text-muted-foreground bg-muted";

        let timeAgo = "";
        try {
          timeAgo = formatDistanceToNow(parseISO(tx.createdAt), { addSuffix: true });
        } catch {
          timeAgo = "Recently";
        }

        return (
          <div
            key={tx._id}
            className="flex items-center gap-3 rounded-lg border border-border bg-background/50 px-3 py-2.5 hover:bg-card transition-colors"
          >
            {/* Method icon */}
            <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", methodStyle)}>
              <MethodIcon size={15} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{tx.subscriberName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {tx.reference ? `Ref: ${tx.reference}` : tx.method.toUpperCase()}
                {" · "}
                <span className="capitalize">{tx.type}</span>
              </p>
            </div>

            {/* Amount + status */}
            <div className="text-right shrink-0">
              <p
                className={cn(
                  "text-sm font-bold",
                  tx.type === "refund" ? "text-red-400" : "text-green-400",
                )}
              >
                {tx.type === "refund" ? "-" : "+"}Ksh {tx.amount.toLocaleString()}
              </p>
              <div className="mt-0.5">
                <StatusBadge status={tx.status} />
              </div>
            </div>

            {/* Time */}
            <div className="hidden md:block text-right shrink-0 w-24">
              <p className="text-[10px] text-muted-foreground">{timeAgo}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
