import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import {
  Bell,
  CheckCheck,
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

const TYPE_ICONS = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
};
const TYPE_COLORS = {
  info: "text-blue-400",
  success: "text-green-400",
  warning: "text-amber-400",
  error: "text-red-400",
};

function formatTs(iso: string) {
  try {
    return format(new Date(iso), "dd MMM, HH:mm");
  } catch {
    return iso;
  }
}

export default function NotificationsBell() {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const count = useQuery(
    api.notifications.unreadCount,
    workspaceId ? { workspaceId } : "skip",
  );
  const { results, status } = usePaginatedQuery(
    api.notifications.list,
    workspaceId ? { workspaceId, unreadOnly: false } : "skip",
    { initialNumItems: 20 },
  );
  const accountAlertCount = useQuery(
    api.platformManagement.accountAlertUnreadCount,
    {},
  );
  const { results: accountAlerts, status: accountAlertStatus } =
    usePaginatedQuery(
      api.platformManagement.listAccountAlerts,
      {},
      { initialNumItems: 20 },
    );

  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const remove = useMutation(api.notifications.remove);
  const markAccountAlertRead = useMutation(
    api.platformManagement.markAccountAlertRead,
  );
  const markAllAccountAlertsRead = useMutation(
    api.platformManagement.markAllAccountAlertsRead,
  );
  const removeAccountAlert = useMutation(
    api.platformManagement.removeAccountAlert,
  );
  const totalUnread = (count ?? 0) + (accountAlertCount ?? 0);
  const mergedAlerts = [
    ...results.map((alert) => ({ ...alert, source: "workspace" as const })),
    ...accountAlerts.map((alert) => ({ ...alert, source: "account" as const })),
  ]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 30);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleClick = async (alert: (typeof mergedAlerts)[number]) => {
    if (!alert.read) {
      if (alert.source === "account") {
        await markAccountAlertRead({ alertId: alert._id });
      } else if (workspaceId) {
        await markRead({ workspaceId, id: alert._id });
      }
    }
    if (alert.source === "workspace" && alert.link) {
      navigate(alert.link);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="relative rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer"
      >
        <Bell size={18} />
        {totalUnread > 0 && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary border border-background animate-pulse" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] max-h-[480px] flex flex-col rounded-xl border border-border bg-card shadow-2xl z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">
                Notifications
              </span>
              {totalUnread > 0 && (
                <span className="rounded-full bg-primary/20 border border-primary/30 px-1.5 text-[10px] font-bold text-primary">
                  {totalUnread}
                </span>
              )}
            </div>
            {totalUnread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] text-muted-foreground hover:text-primary px-2"
                onClick={() => {
                  if (workspaceId) void markAllRead({ workspaceId });
                  void markAllAccountAlertsRead({});
                }}
              >
                <CheckCheck size={11} className="mr-1" />
                Mark all read
              </Button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/40">
            {status === "LoadingFirstPage" ||
            accountAlertStatus === "LoadingFirstPage" ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-4 py-3">
                  <Skeleton className="h-10 w-full" />
                </div>
              ))
            ) : mergedAlerts.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell
                  size={24}
                  className="mx-auto mb-2 text-muted-foreground/30"
                />
                <p className="text-sm text-muted-foreground">
                  No notifications yet
                </p>
              </div>
            ) : (
              mergedAlerts.map((n) => {
                const Icon = TYPE_ICONS[n.type];
                return (
                  <div
                    key={`${n.source}-${n._id}`}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-background/40 transition-colors group",
                      !n.read && "bg-primary/5",
                    )}
                    onClick={() => void handleClick(n)}
                  >
                    <div className={cn("mt-0.5 shrink-0", TYPE_COLORS[n.type])}>
                      <Icon size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-sm font-medium leading-tight",
                          !n.read ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {n.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        {n.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground/60">
                          {formatTs(n.createdAt)}
                        </span>
                        {n.source === "account" && (
                          <span className="text-[10px] text-muted-foreground/60">
                            {n.workspaceName}
                          </span>
                        )}
                        {n.source === "workspace" && n.link && (
                          <span className="text-[10px] text-primary/70 flex items-center gap-0.5">
                            <ExternalLink size={9} /> View
                          </span>
                        )}
                      </div>
                    </div>
                    {!n.read && (
                      <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (n.source === "account") {
                          void removeAccountAlert({ alertId: n._id });
                        } else if (workspaceId) {
                          void remove({ workspaceId, id: n._id });
                        }
                      }}
                      className="hidden group-hover:flex items-center justify-center h-6 w-6 rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors shrink-0"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
