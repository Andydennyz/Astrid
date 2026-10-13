import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton.tsx";

type DataPoint = {
  label: string;
  key: string;
  volume: number;
  count: number;
};

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="text-cyan-400 font-bold">Ksh {payload[0]?.value?.toLocaleString()}</p>
    </div>
  );
};

type Props = { data: DataPoint[]; loading: boolean };

export default function VolumeAreaChart({ data, loading }: Props) {
  if (loading) return <Skeleton className="h-full w-full" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="oklch(0.72 0.18 220)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="oklch(0.72 0.18 220)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 9, fill: "oklch(0.55 0.02 264)" }}
          axisLine={false}
          tickLine={false}
          interval={1}
        />
        <YAxis
          tick={{ fontSize: 9, fill: "oklch(0.55 0.02 264)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
          width={30}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="volume"
          stroke="oklch(0.72 0.18 220)"
          strokeWidth={2}
          fill="url(#volGrad)"
          dot={false}
          activeDot={{ r: 4, fill: "oklch(0.72 0.18 220)" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
