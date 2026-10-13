import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton.tsx";

type Stats = {
  mpesaVolume: number;
  cashVolume: number;
  cardVolume: number;
  bankVolume: number;
};

const SEGMENTS = [
  { key: "mpesaVolume", label: "M-Pesa",  color: "oklch(0.72 0.18 145)" },
  { key: "cashVolume",  label: "Cash",    color: "oklch(0.82 0.18 85)"  },
  { key: "cardVolume",  label: "Card",    color: "oklch(0.65 0.18 220)" },
  { key: "bankVolume",  label: "Bank",    color: "oklch(0.72 0.15 264)" },
];

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number }[];
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground">{payload[0]?.name}</p>
      <p className="font-bold text-foreground">Ksh {payload[0]?.value?.toLocaleString()}</p>
    </div>
  );
};

type Props = { stats?: Stats; loading: boolean };

export default function MethodBreakdown({ stats, loading }: Props) {
  if (loading || !stats) return <Skeleton className="h-full w-full" />;

  const data = SEGMENTS.map((s) => ({
    name: s.label,
    value: stats[s.key as keyof Stats],
    color: s.color,
  })).filter((d) => d.value > 0);

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          innerRadius="50%"
          outerRadius="70%"
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={7}
          formatter={(value) => (
            <span style={{ fontSize: 10, color: "oklch(0.55 0.02 264)" }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
