import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton.tsx";

type SubscriberBreakdown = {
  active: number;
  suspended: number;
  expired: number;
  pending: number;
  total: number;
};

type SubscriberDonutProps = {
  data: SubscriberBreakdown;
  loading?: boolean;
};

const SEGMENTS = [
  { key: "active", label: "Active", color: "oklch(0.72 0.18 145)" },
  { key: "suspended", label: "Suspended", color: "oklch(0.78 0.18 55)" },
  { key: "expired", label: "Expired", color: "oklch(0.65 0.22 25)" },
  { key: "pending", label: "Pending", color: "oklch(0.78 0.16 195)" },
];

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { color: string } }>;
}) => {
  if (active && payload && payload.length) {
    const item = payload[0];
    return (
      <div className="rounded-lg border border-border bg-popover/95 backdrop-blur-sm p-3 shadow-xl">
        <div className="flex items-center gap-2 text-sm">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: item.payload.color }}
          />
          <span className="text-muted-foreground">{item.name}:</span>
          <span className="font-bold text-foreground">{item.value}</span>
        </div>
      </div>
    );
  }
  return null;
};

const CustomLegend = ({
  payload,
}: {
  payload?: Array<{ value: string; color: string }>;
}) => {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2">
      {payload?.map((entry) => (
        <div key={entry.value} className="flex items-center gap-1.5 text-xs">
          <div
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function SubscriberDonut({ data, loading = false }: SubscriberDonutProps) {
  if (loading) {
    return <Skeleton className="h-full w-full rounded-xl" />;
  }

  const chartData = SEGMENTS.map((seg) => ({
    name: seg.label,
    value: data[seg.key as keyof SubscriberBreakdown] as number,
    color: seg.color,
  })).filter((d) => d.value > 0);

  const isEmpty = data.total === 0;

  return (
    <div className="relative h-full flex flex-col">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={isEmpty ? [{ name: "No Data", value: 1, color: "oklch(0.22 0.04 264)" }] : chartData}
            cx="50%"
            cy="48%"
            innerRadius="52%"
            outerRadius="72%"
            paddingAngle={isEmpty ? 0 : 3}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            strokeWidth={0}
          >
            {(isEmpty
              ? [{ color: "oklch(0.22 0.04 264)" }]
              : chartData
            ).map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          {!isEmpty && <Legend content={<CustomLegend />} />}
        </PieChart>
      </ResponsiveContainer>

      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-6">
        <p className="text-3xl font-bold text-foreground leading-none">{data.total}</p>
        <p className="text-xs text-muted-foreground mt-1">Total</p>
      </div>
    </div>
  );
}
