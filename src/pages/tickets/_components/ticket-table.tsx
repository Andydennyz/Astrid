import { useState } from "react";
import { usePaginatedQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { MoreHorizontal, ChevronRight, User } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { useDebounce } from "@/hooks/use-debounce.ts";

const STATUS_STYLES = {
  open:        "bg-amber-400/10 text-amber-400 border-amber-400/30",
  in_progress: "bg-blue-400/10 text-blue-400 border-blue-400/30",
  resolved:    "bg-green-400/10 text-green-400 border-green-400/30",
  closed:      "bg-muted/20 text-muted-foreground border-border",
};

const PRIORITY_STYLES = {
  low:      "bg-muted/20 text-muted-foreground border-border",
  medium:   "bg-blue-400/10 text-blue-400 border-blue-400/30",
  high:     "bg-orange-400/10 text-orange-400 border-orange-400/30",
  critical: "bg-red-400/10 text-red-400 border-red-400/30",
};

const PRIORITY_DOT = {
  low:      "bg-muted-foreground",
  medium:   "bg-blue-400",
  high:     "bg-orange-400",
  critical: "bg-red-400",
};

const CATEGORY_LABELS = {
  connectivity: "Connectivity",
  billing:      "Billing",
  hardware:     "Hardware",
  other:        "Other",
};

type EnrichedTicket = {
  _id: Id<"tickets">;
  title: string;
  description: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "critical";
  category: "connectivity" | "billing" | "hardware" | "other";
  assignedTo?: string;
  subscriberName: string | null;
  subscriberPhone: string | null;
  subscriberId?: Id<"subscribers">;
  createdAt: string;
  resolvedAt?: string;
};

type Props = {
  statusFilter: string;
  priorityFilter: string;
  categoryFilter: string;
  search: string;
  onEdit: (id: Id<"tickets">, data: EnrichedTicket) => void;
};

export default function TicketTable({ statusFilter, priorityFilter, categoryFilter, search, onEdit }: Props) {
  const [debouncedSearch] = useDebounce(search, 300);

  const updateTicket = useMutation(api.tickets.update);
  const removeTicket = useMutation(api.tickets.remove);

  const { results, status, loadMore } = usePaginatedQuery(
    api.tickets.list,
    {
      status: statusFilter as "open" | "in_progress" | "resolved" | "closed" | "all",
      priority: priorityFilter as "low" | "medium" | "high" | "critical" | "all",
      category: categoryFilter as "connectivity" | "billing" | "hardware" | "other" | "all",
      search: debouncedSearch || undefined,
    },
    { initialNumItems: 20 },
  );

  const handleDelete = async (id: Id<"tickets">) => {
    try {
      await removeTicket({ id });
      toast.success("Ticket deleted");
    } catch {
      toast.error("Failed to delete ticket");
    }
  };

  const handleQuickStatus = async (
    id: Id<"tickets">,
    s: "open" | "in_progress" | "resolved" | "closed",
  ) => {
    try {
      await updateTicket({ id, status: s });
      toast.success(`Ticket marked as ${s.replace("_", " ")}`);
    } catch {
      toast.error("Failed to update ticket");
    }
  };

  if (status === "LoadingFirstPage") {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {results.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">No tickets found</p>
        </div>
      ) : (
        results.map((ticket) => {
          const t = ticket as EnrichedTicket;
          return (
            <div
              key={t._id}
              className="rounded-xl border border-border bg-card px-4 py-3.5 hover:border-border/80 hover:bg-card/80 transition-colors group"
            >
              <div className="flex items-start gap-3">
                {/* Priority dot */}
                <div className="pt-1.5 shrink-0">
                  <span
                    className={`block h-2 w-2 rounded-full ${PRIORITY_DOT[t.priority]}`}
                  />
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground flex-1 min-w-0 truncate">
                      {t.title}
                    </p>

                    {/* Badges */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        className={`text-[9px] px-1.5 py-0 border ${STATUS_STYLES[t.status]}`}
                      >
                        {t.status.replace("_", " ")}
                      </Badge>
                      <Badge
                        className={`text-[9px] px-1.5 py-0 border ${PRIORITY_STYLES[t.priority]}`}
                      >
                        {t.priority}
                      </Badge>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                    {t.description}
                  </p>

                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {/* Category */}
                    <span className="text-[10px] text-muted-foreground bg-background/60 border border-border/50 px-1.5 py-0.5 rounded">
                      {CATEGORY_LABELS[t.category]}
                    </span>

                    {/* Subscriber */}
                    {t.subscriberName && (
                      <span className="text-[10px] text-cyan-400 flex items-center gap-1">
                        <User size={9} />
                        {t.subscriberName}
                      </span>
                    )}

                    {/* Assigned */}
                    {t.assignedTo && (
                      <span className="text-[10px] text-muted-foreground">
                        → {t.assignedTo}
                      </span>
                    )}

                    {/* Age */}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {(() => {
                        try {
                          return formatDistanceToNow(new Date(t.createdAt), { addSuffix: true });
                        } catch {
                          return t.createdAt;
                        }
                      })()}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreHorizontal size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-card border-border w-44">
                    <DropdownMenuItem
                      className="text-foreground cursor-pointer hover:bg-muted/20 text-xs"
                      onClick={() => onEdit(t._id, t)}
                    >
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-border" />
                    {t.status !== "in_progress" && (
                      <DropdownMenuItem
                        className="text-blue-400 cursor-pointer hover:bg-blue-400/10 text-xs"
                        onClick={() => handleQuickStatus(t._id, "in_progress")}
                      >
                        Mark In Progress
                      </DropdownMenuItem>
                    )}
                    {t.status !== "resolved" && (
                      <DropdownMenuItem
                        className="text-green-400 cursor-pointer hover:bg-green-400/10 text-xs"
                        onClick={() => handleQuickStatus(t._id, "resolved")}
                      >
                        Mark Resolved
                      </DropdownMenuItem>
                    )}
                    {t.status !== "closed" && (
                      <DropdownMenuItem
                        className="text-muted-foreground cursor-pointer hover:bg-muted/20 text-xs"
                        onClick={() => handleQuickStatus(t._id, "closed")}
                      >
                        Close Ticket
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator className="bg-border" />
                    <DropdownMenuItem
                      className="text-red-400 cursor-pointer hover:bg-red-400/10 text-xs"
                      onClick={() => handleDelete(t._id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })
      )}

      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <div className="flex items-center justify-between px-2 pt-1">
          <span className="text-xs text-muted-foreground">{results.length} tickets shown</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs border border-border text-muted-foreground hover:text-foreground"
            onClick={() => loadMore(20)}
            disabled={status === "LoadingMore"}
          >
            {status === "LoadingMore" ? "Loading..." : <><ChevronRight size={12} className="mr-1" />Load More</>}
          </Button>
        </div>
      )}
    </div>
  );
}
