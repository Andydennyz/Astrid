import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const RANGE_OPTIONS = [
  { label: "3 months", value: 3 },
  { label: "6 months", value: 6 },
  { label: "12 months", value: 12 },
  { label: "24 months", value: 24 },
];

export default function RevenueReport() {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [months, setMonths] = useState(6);
  const data = useQuery(
    api.reports.getRevenueReport,
    workspaceId ? { months, workspaceId } : "skip",
  );

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full rounded-xl" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const lastTwo = data.months.slice(-2);
  const growth = lastTwo.length === 2 && lastTwo[0].revenue > 0
    ? Math.round(((lastTwo[1].revenue - lastTwo[0].revenue) / lastTwo[0].revenue) * 100)
    : 0;

  return (
    <div className="space-y-5">
      {/* Controls + KPIs */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
          {[
            {
              label: "Total Revenue",
              value: `KES ${data.totalRevenue.toLocaleString()}`,
              color: "text-green-400",
              border: "border-green-400/20",
              bg: "bg-green-400/5",
            },
            {
              label: "Paid Invoices",
              value: data.totalInvoices.toLocaleString(),
              color: "text-cyan-400",
              border: "border-cyan-400/20",
              bg: "bg-cyan-400/5",
            },
            {
              label: "Best Month",
              value: data.bestMonth?.label ?? "—",
              sub: `KES ${data.bestMonth?.revenue.toLocaleString() ?? 0}`,
              color: "text-violet-400",
              border: "border-violet-400/20",
              bg: "bg-violet-400/5",
            },
          ].map((kpi) => (
            <div key={kpi.label} className={`rounded-xl border ${kpi.border} ${kpi.bg} p-4`}>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className={`text-lg font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
              {kpi.sub && <p className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</p>}
            </div>
          ))}
        </div>

        {/* Range selector */}
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setMonths(opt.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer
                ${months === opt.value ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bar chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Monthly Revenue</h3>
            <p className="text-xs text-muted-foreground">Collected from paid invoices</p>
          </div>
          <div className={`flex items-center gap-1 text-xs font-semibold ${growth > 0 ? "text-green-400" : growth < 0 ? "text-red-400" : "text-muted-foreground"}`}>
            {growth > 0 ? <TrendingUp size={14} /> : growth < 0 ? <TrendingDown size={14} /> : <Minus size={14} />}
            {growth > 0 ? "+" : ""}{growth}% MoM
          </div>
        </div>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.months} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={60} tickFormatter={(v: number) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`KES ${v.toLocaleString()}`, "Revenue"]}
              />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Line chart: invoice count */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">Paid Invoice Count</h3>
          <p className="text-xs text-muted-foreground">Number of invoices collected per month</p>
        </div>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.months} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={30} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [v, "Invoices"]}
              />
              <Line type="monotone" dataKey="invoiceCount" stroke="#22d3ee" strokeWidth={2} dot={{ fill: "#22d3ee", r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly breakdown table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Monthly Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Month</th>
                <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Revenue (KES)</th>
                <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Invoices</th>
                <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Avg Invoice</th>
              </tr>
            </thead>
            <tbody>
              {[...data.months].reverse().map((m) => (
                <tr key={m.key} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 text-foreground font-medium">{m.label}</td>
                  <td className="px-4 py-2.5 text-right text-green-400 font-semibold">{m.revenue.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{m.invoiceCount}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{m.avgInvoice.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
