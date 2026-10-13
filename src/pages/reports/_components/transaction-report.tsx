import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const RANGE_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
];

const METHOD_COLORS: Record<string, string> = {
  mpesa: "#22d3ee",
  cash: "#10b981",
  bank: "#a78bfa",
  card: "#f59e0b",
  paypal: "#3b82f6",
};

export default function TransactionReport() {
  const [days, setDays] = useState(30);
  const data = useQuery(api.reports.getTransactionReport, { days });

  if (!data) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Controls + KPIs */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="grid grid-cols-2 gap-3 flex-1">
          {[
            { label: "Total Volume", value: `KES ${data.totalVolume.toLocaleString()}`, color: "text-green-400", border: "border-green-400/20", bg: "bg-green-400/5" },
            { label: "Transaction Count", value: data.totalCount, color: "text-cyan-400", border: "border-cyan-400/20", bg: "bg-cyan-400/5" },
          ].map((kpi) => (
            <div key={kpi.label} className={`rounded-xl border ${kpi.border} ${kpi.bg} p-4`}>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className={`text-lg font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Last {data.daysBack} days</p>
            </div>
          ))}
        </div>

        {/* Range selector */}
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer
                ${days === opt.value ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Daily volume chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">Daily Transaction Volume</h3>
          <p className="text-xs text-muted-foreground">Completed transactions per day</p>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.dailyVolume} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}
                tickFormatter={(v: string) => v.substring(5)} interval={Math.floor(data.dailyVolume.length / 6)} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={60}
                tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`KES ${v.toLocaleString()}`, "Volume"]}
              />
              <Bar dataKey="volume" fill="#10b981" radius={[3, 3, 0, 0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* By method & by type */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">By Payment Method</h3>
          <div className="space-y-3">
            {data.byMethod.length === 0 ? (
              <p className="text-xs text-muted-foreground">No transactions in range</p>
            ) : (
              data.byMethod.sort((a, b) => b.volume - a.volume).map((item) => {
                const pct = data.totalVolume > 0 ? Math.round((item.volume / data.totalVolume) * 100) : 0;
                return (
                  <div key={item.method}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs capitalize text-foreground font-medium">{item.method}</span>
                      <span className="text-xs text-muted-foreground">KES {item.volume.toLocaleString()} ({item.count})</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: METHOD_COLORS[item.method] ?? "#64748b" }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">By Transaction Type</h3>
          <div className="space-y-3">
            {data.byType.length === 0 ? (
              <p className="text-xs text-muted-foreground">No transactions in range</p>
            ) : (
              data.byType.sort((a, b) => b.volume - a.volume).map((item) => {
                const pct = data.totalVolume > 0 ? Math.round((item.volume / data.totalVolume) * 100) : 0;
                return (
                  <div key={item.type}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs capitalize text-foreground font-medium">{item.type}</span>
                      <span className="text-xs text-muted-foreground">KES {item.volume.toLocaleString()} ({item.count})</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${pct}%`, opacity: 0.7 + (pct / 300) }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
