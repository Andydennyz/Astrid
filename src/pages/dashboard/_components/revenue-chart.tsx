import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  Area,
} from "recharts";
import { format, parseISO } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton.tsx";

type DataPoint = {
  date: string;
  revenue: number;
  payments: number;
};

type RevenueChartProps = {
  data: DataPoint[];
  loading?: boolean;
};

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ color: string; name: string; value: number }>;
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-border bg-popover/95 backdrop-blur-sm p-3 shadow-xl">
        <p className="text-xs text-muted-foreground mb-2 font-medium">
          {label
            ? (() => {
                try {
                  return format(parseISO(label), "MMM d, yyyy");
                } catch {
                  return label;
                }
              })()
            : ""}
        </p>
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center gap-2 text-xs">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground capitalize">{entry.name}:</span>
            <span className="font-semibold text-foreground">
              {entry.name === "revenue" ? `Ksh ${entry.value.toLocaleString()}` : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function RevenueChart({ data, loading = false }: RevenueChartProps) {
  if (loading) {
    return <Skeleton className="h-full w-full rounded-xl" />;
  }

  const formattedData = data.map((d) => ({
    ...d,
    label: (() => {
      try {
        return format(parseISO(d.date), "MMM d");
      } catch {
        return d.date;
      }
    })(),
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={formattedData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="oklch(0.78 0.16 195)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="oklch(0.78 0.16 195)" stopOpacity={0.15} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="oklch(0.22 0.04 264)"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={{ fill: "oklch(0.56 0.02 240)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "oklch(0.56 0.02 240)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "oklch(0.22 0.04 264 / 0.4)" }} />
        <Bar
          dataKey="revenue"
          fill="url(#revenueGradient)"
          radius={[3, 3, 0, 0]}
          maxBarSize={32}
        />
        <Area
          type="monotone"
          dataKey="payments"
          stroke="oklch(0.72 0.18 145)"
          strokeWidth={2}
          fill="oklch(0.72 0.18 145 / 0.08)"
          dot={false}
          strokeDasharray="4 2"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
