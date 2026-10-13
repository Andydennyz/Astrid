import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { MessageSquare, Send, Search, ChevronRight, CheckCircle, XCircle, Clock } from "lucide-react";
import { motion } from "motion/react";
import { usePaginatedQuery } from "convex/react";
import { useDebounce } from "@/hooks/use-debounce.ts";
import { format } from "date-fns";
import SendSmsDialog from "./_components/send-sms-dialog.tsx";

const STATUS_STYLES = {
  sent:    "bg-green-400/10 text-green-400 border-green-400/30",
  failed:  "bg-red-400/10 text-red-400 border-red-400/30",
  pending: "bg-amber-400/10 text-amber-400 border-amber-400/30",
};

const STATUS_ICONS = {
  sent:    CheckCircle,
  failed:  XCircle,
  pending: Clock,
};

const TYPE_COLORS = {
  invoice:  "text-cyan-400",
  reminder: "text-amber-400",
  custom:   "text-purple-400",
  system:   "text-muted-foreground",
};

function SmsReportsInner() {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [debouncedSearch] = useDebounce(search, 300);

  const stats = useQuery(
    api.sms.getStats,
    workspaceId ? { workspaceId } : "skip",
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.sms.list,
    workspaceId
      ? {
          workspaceId,
          status: statusFilter as "sent" | "failed" | "pending" | "all",
          type: typeFilter as "invoice" | "reminder" | "custom" | "system" | "all",
          search: debouncedSearch || undefined,
        }
      : "skip",
    { initialNumItems: 25 },
  );

  const formatDate = (iso: string) => {
    try { return format(new Date(iso), "dd MMM yy, HH:mm"); }
    catch { return iso; }
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-start justify-between flex-wrap gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-400/10 border border-indigo-400/20 flex items-center justify-center">
            <MessageSquare size={18} className="text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">SMS Reports</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Delivery logs, bulk campaigns and automated reminders
            </p>
          </div>
        </div>
        <Button
          onClick={() => setSendOpen(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2"
          size="sm"
        >
          <Send size={13} />
          Send SMS
        </Button>
      </motion.div>

      {/* Stats cards */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2"
      >
        {stats === undefined
          ? Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))
          : [
              { label: "Total Sent", value: stats.total, color: "text-indigo-400", bg: "bg-indigo-400/10 border-indigo-400/20" },
              { label: "Delivered", value: stats.sent, color: "text-green-400", bg: "bg-green-400/10 border-green-400/20" },
              { label: "Failed", value: stats.failed, color: "text-red-400", bg: "bg-red-400/10 border-red-400/20" },
              { label: "Pending", value: stats.pending, color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20" },
              { label: "This Month", value: stats.thisMonthCount, color: "text-cyan-400", bg: "bg-cyan-400/10 border-cyan-400/20" },
              { label: "Delivery Rate", value: `${stats.deliveryRate}%`, color: "text-primary", bg: "bg-primary/10 border-primary/20" },
              { label: "Invoice SMS", value: stats.invoiceCount, color: "text-cyan-300", bg: "bg-cyan-300/10 border-cyan-300/20" },
              { label: "Reminders", value: stats.reminderCount, color: "text-purple-400", bg: "bg-purple-400/10 border-purple-400/20" },
            ].map((item) => (
              <div key={item.label} className={`rounded-xl border p-3 ${item.bg}`}>
                <p className="text-[10px] text-muted-foreground mb-1">{item.label}</p>
                <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
              </div>
            ))}
      </motion.div>

      {/* Log table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="space-y-3"
      >
        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search recipient, message..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 bg-card border-border text-foreground text-sm"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[120px] h-9 bg-card border-border text-foreground text-sm">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="invoice">Invoice</SelectItem>
              <SelectItem value="reminder">Reminder</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5">
            {(["all", "sent", "failed", "pending"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`h-7 px-3 rounded-full text-[11px] font-medium border transition-all ${
                  statusFilter === s
                    ? "bg-primary/20 border-primary/50 text-primary"
                    : "bg-card border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Log rows */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Recipient
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                    Message
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                    Sent At
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {status === "LoadingFirstPage"
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={5} className="px-4 py-3">
                          <Skeleton className="h-8 w-full" />
                        </td>
                      </tr>
                    ))
                  : results.length === 0
                    ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                          No SMS logs found
                        </td>
                      </tr>
                    )
                    : results.map((log) => {
                        const StatusIcon = STATUS_ICONS[log.status];
                        return (
                          <tr key={log._id} className="hover:bg-background/40 transition-colors">
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-foreground">{log.recipient}</p>
                              {log.subscriberName && (
                                <p className="text-[10px] text-muted-foreground">{log.subscriberName}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell max-w-[280px]">
                              <p className="text-xs text-muted-foreground line-clamp-2">{log.message}</p>
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              <span className={`text-xs font-medium capitalize ${TYPE_COLORS[log.type]}`}>
                                {log.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              <Badge className={`text-[10px] px-2 py-0.5 border flex items-center gap-1 w-fit ${STATUS_STYLES[log.status]}`}>
                                <StatusIcon size={9} />
                                {log.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 hidden lg:table-cell">
                              <span className="text-xs text-muted-foreground">{formatDate(log.sentAt)}</span>
                            </td>
                          </tr>
                        );
                      })}
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
                onClick={() => loadMore(25)}
                disabled={status === "LoadingMore"}
              >
                {status === "LoadingMore" ? "Loading..." : <><ChevronRight size={12} className="mr-1" />Load More</>}
              </Button>
            </div>
          )}
        </div>
      </motion.div>

      <SendSmsDialog open={sendOpen} onClose={() => setSendOpen(false)} />
    </div>
  );
}

export default function SmsReportsPage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex h-full items-center justify-center">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-bold text-foreground">Sign in to continue</h2>
            <p className="text-sm text-muted-foreground">Access SMS reports by signing in</p>
            <SignInButton />
          </div>
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="p-6 space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </AuthLoading>
      <Authenticated>
        <SmsReportsInner />
      </Authenticated>
    </>
  );
}
