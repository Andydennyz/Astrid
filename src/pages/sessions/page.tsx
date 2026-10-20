import { useState } from "react";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import { Authenticated, Unauthenticated } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { toast } from "sonner";
import { Activity, Wifi, WifiOff, PowerOff, RefreshCw } from "lucide-react";

function formatBytes(bytes: number) {
  const gw = 4294967296;
  if (bytes >= gw) return `${(bytes / gw).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function StatusBadge({ status }: { status: "active" | "stopped" | "interim" }) {
  if (status === "active") return <Badge className="bg-green-500/15 text-green-400 border-green-500/30">Active</Badge>;
  if (status === "interim") return <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30">Interim</Badge>;
  return <Badge variant="secondary">Stopped</Badge>;
}

function SessionsInner() {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "stopped" | "interim">("all");
  const disconnect = useMutation(api.sessions.markDisconnected);
  const summary = useQuery(
    api.sessions.getActiveSummary,
    workspaceId ? { workspaceId } : "skip",
  );

  const { results, status, loadMore } = usePaginatedQuery(
    api.sessions.list,
    workspaceId
      ? {
          workspaceId,
          status: statusFilter === "all" ? undefined : statusFilter,
        }
      : "skip",
    { initialNumItems: 25 },
  );

  const handleDisconnect = async (
    sessionId: (typeof results)[number]["_id"],
  ) => {
    if (
      !workspaceId ||
      !confirm("Disconnect this PPPoE session on the router?")
    )
      return;
    try {
      const operationId = await disconnect({ workspaceId, sessionId });
      toast.success(
        operationId
          ? "Router disconnect queued. The session will show stopped after the gateway confirms it."
          : "This session is already stopped.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to queue router disconnect",
      );
    }
  };

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Active Sessions"
          value={summary ? String(summary.total) : "—"}
          icon={<Activity className="w-4 h-4 text-green-400" />}
          accent="green"
        />
        {summary?.byRouter.slice(0, 3).map((r, i) => (
          <SummaryCard
            key={i}
            label={r.routerName}
            value={String(r.count)}
            icon={<Wifi className="w-4 h-4 text-primary" />}
            accent="blue"
          />
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sessions</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="interim">Interim</SelectItem>
            <SelectItem value="stopped">Stopped</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {status === "LoadingFirstPage" ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Subscriber</TableHead>
                <TableHead>Router</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>↓ In</TableHead>
                <TableHead>↑ Out</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start Time</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-12">
                    No sessions found
                  </TableCell>
                </TableRow>
              ) : (
                results.map((s) => {
                  const gw = 4294967296;
                  const inBytes = (s.inputOctets ?? 0) + (s.inputGigawords ?? 0) * gw;
                  const outBytes = (s.outputOctets ?? 0) + (s.outputGigawords ?? 0) * gw;
                  return (
                    <TableRow key={s._id}>
                      <TableCell className="font-mono text-xs">{s.username}</TableCell>
                      <TableCell className="text-sm">{s.subscriberName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-sm">{s.routerName ?? <span className="text-muted-foreground font-mono text-xs">{s.nasIdentifier}</span>}</TableCell>
                      <TableCell className="font-mono text-xs">{s.framedIpAddress ?? "—"}</TableCell>
                      <TableCell className="text-xs">{s.sessionTime ? formatDuration(s.sessionTime) : "—"}</TableCell>
                      <TableCell className="text-xs">{formatBytes(inBytes)}</TableCell>
                      <TableCell className="text-xs">{formatBytes(outBytes)}</TableCell>
                      <TableCell><StatusBadge status={s.status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(s.startTime).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {s.status !== "stopped" &&
                          s.connectionType === "pppoe" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive cursor-pointer"
                              onClick={() => handleDisconnect(s._id)}
                              title="Disconnect on router"
                            >
                              <PowerOff className="w-3.5 h-3.5" />
                            </Button>
                          )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {status === "CanLoadMore" && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => loadMore(25)}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: "green" | "blue";
}) {
  const accentCls = accent === "green" ? "border-green-500/20 bg-green-500/5" : "border-primary/20 bg-primary/5";
  return (
    <div className={`rounded-lg border p-3 space-y-2 ${accentCls}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

export default function SessionsPage() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Active Sessions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            PPPoE and hotspot sessions reported by MikroTik via RADIUS accounting.
          </p>
        </div>
      </div>

      <Unauthenticated>
        <div className="flex items-center justify-center py-12"><SignInButton /></div>
      </Unauthenticated>
      <Authenticated>
        <SessionsInner />
      </Authenticated>
    </div>
  );
}
