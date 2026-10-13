import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  active: "#22d3ee",
  suspended: "#f59e0b",
  expired: "#ef4444",
  pending: "#a78bfa",
};

const TYPE_COLORS = ["#0ea5e9", "#10b981", "#f59e0b"];

export default function SubscriberReport() {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const data = useQuery(
    api.reports.getSubscriberReport,
    workspaceId ? { workspaceId } : "skip",
  );

  if (!data) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
      </div>
    );
  }

  const statusData = Object.entries(data.byStatus).map(([name, value]) => ({ name, value }));
  const typeData = [
    { name: "PPPoE", value: data.byType.pppoe },
    { name: "Hotspot", value: data.byType.hotspot },
    { name: "Static", value: data.byType.static },
  ];

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Subscribers", value: data.total, color: "text-foreground", border: "border-border", bg: "" },
          { label: "Active", value: data.byStatus.active, color: "text-cyan-400", border: "border-cyan-400/20", bg: "bg-cyan-400/5" },
          { label: "Monthly MRR", value: `KES ${data.totalMRR.toLocaleString()}`, color: "text-green-400", border: "border-green-400/20", bg: "bg-green-400/5" },
          { label: "Online Now", value: data.onlineCount, color: "text-violet-400", border: "border-violet-400/20", bg: "bg-violet-400/5" },
        ].map((kpi) => (
          <div key={kpi.label} className={`rounded-xl border ${kpi.border} ${kpi.bg} p-4`}>
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className={`text-lg font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status pie */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-1">By Status</h3>
          <p className="text-xs text-muted-foreground mb-4">Subscriber account status breakdown</p>
          <div className="h-48 flex items-center">
            <ResponsiveContainer width="60%" height="100%">
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                  {statusData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#64748b"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 flex-1">
              {statusData.map((entry) => (
                <div key={entry.name} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[entry.name] ?? "#64748b" }} />
                    <span className="text-xs text-muted-foreground capitalize">{entry.name}</span>
                  </div>
                  <span className="text-xs font-semibold text-foreground">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Connection type pie */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-1">By Connection Type</h3>
          <p className="text-xs text-muted-foreground mb-4">Distribution across connection methods</p>
          <div className="h-48 flex items-center">
            <ResponsiveContainer width="60%" height="100%">
              <PieChart>
                <Pie data={typeData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                  {typeData.map((entry, i) => (
                    <Cell key={entry.name} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 flex-1">
              {typeData.map((entry, i) => (
                <div key={entry.name} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLORS[i % TYPE_COLORS.length] }} />
                    <span className="text-xs text-muted-foreground">{entry.name}</span>
                  </div>
                  <span className="text-xs font-semibold text-foreground">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Package breakdown bar chart */}
      {data.packageBreakdown.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-1">Subscribers by Package</h3>
          <p className="text-xs text-muted-foreground mb-4">How many subscribers are on each plan</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.packageBreakdown} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={90} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [v, "Subscribers"]}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
