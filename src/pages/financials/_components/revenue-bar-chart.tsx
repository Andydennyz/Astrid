import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton.tsx";

type DataPoint = {
  label: string;
  key: string;
  revenue: number;
  count: number;
};

type Props = {
  data: DataPoint[];
  loading: boolean;
};

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground mb-1 font-medium">{label}</p>
      <p className="text-green-400 font-bold">Ksh {payload[0]?.value?.toLocaleString()}</p>
    </div>
  );
};

export default function RevenueBarChart({ data, loading }: Props) {
  if (loading) return <Skeleton className="h-full w-full" />;
  if (!data.length) return null;

  const maxRevenue = Math.max(...data.map((d) => d.revenue));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "oklch(0.55 0.02 264)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 9, fill: "oklch(0.55 0.02 264)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
          width={32}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={
                entry.revenue === maxRevenue
                  ? "oklch(0.72 0.18 145)"
                  : "oklch(0.55 0.12 264)"
              }
              fillOpacity={0.85}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
