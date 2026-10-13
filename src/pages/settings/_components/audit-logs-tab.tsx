import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { usePaginatedQuery } from "convex/react";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Search, ShieldCheck, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { useDebounce } from "@/hooks/use-debounce.ts";

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-400/10 text-green-400 border-green-400/30",
  update: "bg-blue-400/10 text-blue-400 border-blue-400/30",
  delete: "bg-red-400/10 text-red-400 border-red-400/30",
  send_sms: "bg-indigo-400/10 text-indigo-400 border-indigo-400/30",
  send_bulk_sms: "bg-purple-400/10 text-purple-400 border-purple-400/30",
  default: "bg-muted/30 text-muted-foreground border-border",
};

function actionColor(action: string) {
  return ACTION_COLORS[action] ?? ACTION_COLORS.default;
}

function formatTs(iso: string) {
  try { return format(new Date(iso), "dd MMM yy, HH:mm"); }
  catch { return iso; }
}

export default function AuditLogsTab() {
  const [resourceFilter, setResourceFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);

  const stats = useQuery(api.audit_logs.getStats, {});
  const resources = useQuery(api.audit_logs.getResources, {});

  const { results, status, loadMore } = usePaginatedQuery(
    api.audit_logs.list,
    {
      resource: resourceFilter !== "all" ? resourceFilter : undefined,
      search: debouncedSearch || undefined,
    },
    { initialNumItems: 30 },
  );

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 max-w-lg">
        {stats === undefined
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
          : [
              { label: "Total Events", value: stats.total, color: "text-primary" },
              { label: "Today", value: stats.today, color: "text-green-400" },
              { label: "This Week", value: stats.thisWeek, color: "text-amber-400" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-card p-3">
                <p className="text-[10px] text-muted-foreground mb-1">{s.label}</p>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 bg-card border-border text-foreground text-sm"
          />
        </div>

        <Select value={resourceFilter} onValueChange={setResourceFilter}>
          <SelectTrigger className="w-[160px] h-9 bg-card border-border text-foreground text-sm">
            <SelectValue placeholder="Resource" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">All Resources</SelectItem>
            {(resources ?? []).map((r) => (
              <SelectItem key={r} value={r}>
                {r.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Log table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background/50">
                {["Action", "Resource", "Details", "Performed By", "Time"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ${
                      i >= 3 ? "hidden lg:table-cell" : i === 2 ? "hidden md:table-cell" : ""
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {status === "LoadingFirstPage"
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={5} className="px-4 py-3">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                : results.length === 0
                  ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <ShieldCheck size={28} className="text-muted-foreground/40" />
                          <p className="text-sm text-muted-foreground">No audit events found</p>
                        </div>
                      </td>
                    </tr>
                  )
                  : results.map((log) => (
                    <tr key={log._id} className="hover:bg-background/40 transition-colors">
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] px-2 py-0.5 border w-fit ${actionColor(log.action)}`}>
                          {log.action.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-foreground capitalize">
                          {log.resource.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell max-w-[260px]">
                        <p className="text-xs text-muted-foreground line-clamp-2">{log.details ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {log.userId.slice(log.userId.indexOf("|") + 1, log.userId.indexOf("|") + 12)}…
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground">{formatTs(log.createdAt)}</span>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {(status === "CanLoadMore" || status === "LoadingMore") && (
          <div className="border-t border-border px-4 py-3 flex items-center justify-between bg-background/30">
            <span className="text-xs text-muted-foreground">{results.length} records shown</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs border border-border text-muted-foreground hover:text-foreground"
              onClick={() => loadMore(30)}
              disabled={status === "LoadingMore"}
            >
              {status === "LoadingMore" ? "Loading..." : <><ChevronRight size={12} className="mr-1" />Load More</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
