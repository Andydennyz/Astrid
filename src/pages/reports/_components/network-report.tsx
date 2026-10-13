import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Router, Activity, ShieldCheck, ShieldX, Wifi } from "lucide-react";

const RANGE_OPTIONS = [
  { label: "24h", value: 1 },
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
];

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default function NetworkReport() {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [days, setDays] = useState(7);
  const data = useQuery(
    api.reports.getNetworkReport,
    workspaceId ? { days, workspaceId } : "skip",
  );

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const authTotal = data.authAccept + data.authReject;
  const acceptRate = authTotal > 0 ? Math.round((data.authAccept / authTotal) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Controls + KPIs */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
          {[
            {
              label: "Active Sessions",
              value: data.activeSessions,
              icon: <Activity size={16} />,
              color: "text-cyan-400",
              border: "border-cyan-400/20",
              bg: "bg-cyan-400/5",
            },
            {
              label: "Sessions (period)",
              value: data.totalSessions,
              icon: <Wifi size={16} />,
              color: "text-violet-400",
              border: "border-violet-400/20",
              bg: "bg-violet-400/5",
            },
            {
              label: "Auth Accept",
              value: data.authAccept,
              icon: <ShieldCheck size={16} />,
              color: "text-green-400",
              border: "border-green-400/20",
              bg: "bg-green-400/5",
            },
            {
              label: "Auth Reject",
              value: data.authReject,
              icon: <ShieldX size={16} />,
              color: "text-red-400",
              border: "border-red-400/20",
              bg: "bg-red-400/5",
            },
          ].map((kpi) => (
            <div key={kpi.label} className={`rounded-xl border ${kpi.border} ${kpi.bg} p-4`}>
              <div className={`${kpi.color} mb-1`}>{kpi.icon}</div>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className={`text-xl font-bold mt-0.5 ${kpi.color}`}>{kpi.value.toLocaleString()}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card p-1 self-start">
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

      {/* Auth accept rate */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-foreground">Auth Accept Rate</span>
            <span className={`text-sm font-bold ${acceptRate >= 90 ? "text-green-400" : acceptRate >= 70 ? "text-amber-400" : "text-red-400"}`}>
              {acceptRate}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${acceptRate >= 90 ? "bg-green-400" : acceptRate >= 70 ? "bg-amber-400" : "bg-red-400"}`}
              style={{ width: `${acceptRate}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {data.authAccept} accepted / {data.authReject} rejected — last {data.daysBack} day{data.daysBack !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Daily auth activity chart */}
      {data.dailyAuthData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">Daily Auth Activity</h3>
            <p className="text-xs text-muted-foreground">Accept vs reject count per day</p>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.dailyAuthData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: string) => v.substring(5)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="accept" name="Accept" fill="#22d3ee" radius={[3, 3, 0, 0]} opacity={0.85} stackId="a" />
                <Bar dataKey="reject" name="Reject" fill="#ef4444" radius={[3, 3, 0, 0]} opacity={0.85} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per-router status */}
      {data.routerStats.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Router size={15} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Router Status</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Router</th>
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">NAS ID</th>
                  <th className="text-center px-4 py-2.5 text-xs text-muted-foreground font-medium">Status</th>
                  <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Active Sessions</th>
                </tr>
              </thead>
              <tbody>
                {data.routerStats.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-foreground font-medium">{r.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{r.nasIdentifier}</td>
                    <td className="px-4 py-2.5 text-center">
                      {r.status === "online" ? (
                        <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-[10px]">Online</Badge>
                      ) : r.status === "offline" ? (
                        <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px]">Offline</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Unknown</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-cyan-400">{r.activeSessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top users by bandwidth */}
      {data.topUsers.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Top Users by Bandwidth</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Last {data.daysBack} day{data.daysBack !== 1 ? "s" : ""}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">#</th>
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Username</th>
                  <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Download</th>
                  <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Upload</th>
                  <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Total</th>
                  <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {data.topUsers.map((u, i) => (
                  <tr key={u.username} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{i + 1}</td>
                    <td className="px-4 py-2.5 text-foreground font-mono text-xs font-medium">{u.username}</td>
                    <td className="px-4 py-2.5 text-right text-cyan-400 text-xs">{formatBytes(u.download)}</td>
                    <td className="px-4 py-2.5 text-right text-violet-400 text-xs">{formatBytes(u.upload)}</td>
                    <td className="px-4 py-2.5 text-right text-green-400 text-xs font-semibold">{formatBytes(u.total)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">{u.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reject reasons */}
      {data.rejectReasons.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Auth Rejection Reasons</h3>
          <div className="space-y-2.5">
            {data.rejectReasons.map((r) => {
              const pct = data.authReject > 0 ? Math.round((r.count / data.authReject) * 100) : 0;
              return (
                <div key={r.reason}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-foreground font-medium">{r.reason}</span>
                    <span className="text-xs text-muted-foreground">{r.count} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-red-400 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
