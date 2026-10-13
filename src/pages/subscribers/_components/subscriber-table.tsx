import { useState } from "react";
import { usePaginatedQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Wifi, WifiOff, MoreHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce.ts";

const STATUS_STYLES = {
  active: "bg-green-400/10 text-green-400 border-green-400/30",
  suspended: "bg-amber-400/10 text-amber-400 border-amber-400/30",
  expired: "bg-red-400/10 text-red-400 border-red-400/30",
  pending: "bg-blue-400/10 text-blue-400 border-blue-400/30",
};

const CONN_STYLES = {
  pppoe: "bg-cyan-400/10 text-cyan-400",
  hotspot: "bg-purple-400/10 text-purple-400",
  static: "bg-orange-400/10 text-orange-400",
};

type Props = {
  statusFilter: string;
  connFilter: string;
  search: string;
  onSelect: (id: Id<"subscribers">) => void;
  onEdit: (id: Id<"subscribers">) => void;
};

export default function SubscriberTable({ statusFilter, connFilter, search, onSelect, onEdit }: Props) {
  const [selected, setSelected] = useState<Set<Id<"subscribers">>>(new Set());
  const [debouncedSearch] = useDebounce(search, 300);

  const updateStatus = useMutation(api.subscribers.updateStatus);
  const removeSub = useMutation(api.subscribers.remove);

  const { results, status, loadMore } = usePaginatedQuery(
    api.subscribers.list,
    {
      status: statusFilter as "active" | "suspended" | "expired" | "pending" | "all",
      connectionType: connFilter as "pppoe" | "hotspot" | "static" | "all",
      search: debouncedSearch || undefined,
    },
    { initialNumItems: 20 },
  );

  const toggleSelect = (id: Id<"subscribers">) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === results.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(results.map((r) => r._id)));
    }
  };

  const bulkUpdateStatus = async (newStatus: "active" | "suspended" | "expired" | "pending") => {
    if (selected.size === 0) return toast.error("Select subscribers first");
    try {
      await updateStatus({ ids: Array.from(selected), status: newStatus });
      toast.success(`${selected.size} subscriber(s) updated to ${newStatus}`);
      setSelected(new Set());
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (id: Id<"subscribers">) => {
    try {
      await removeSub({ id });
      toast.success("Subscriber deleted");
    } catch {
      toast.error("Failed to delete subscriber");
    }
  };

  const isLoading = status === "LoadingFirstPage";

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2">
          <span className="text-xs text-primary font-medium">
            {selected.size} selected
          </span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs border border-green-400/30 text-green-400 hover:bg-green-400/10"
            onClick={() => bulkUpdateStatus("active")}
          >
            Activate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs border border-amber-400/30 text-amber-400 hover:bg-amber-400/10"
            onClick={() => bulkUpdateStatus("suspended")}
          >
            Suspend
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs border border-border text-muted-foreground hover:text-foreground"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background/50">
                <th className="px-4 py-3 text-left w-10">
                  <Checkbox
                    checked={results.length > 0 && selected.size === results.length}
                    onCheckedChange={toggleAll}
                    className="border-border"
                  />
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Subscriber
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                  Package
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                  Monthly Fee
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden xl:table-cell">
                  IP Address
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Online
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {results.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No subscribers found
                  </td>
                </tr>
              ) : (
                results.map((sub) => (
                  <tr
                    key={sub._id}
                    className="hover:bg-background/40 transition-colors cursor-pointer group"
                    onClick={() => onSelect(sub._id)}
                  >
                    <td
                      className="px-4 py-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(sub._id);
                      }}
                    >
                      <Checkbox
                        checked={selected.has(sub._id)}
                        onCheckedChange={() => toggleSelect(sub._id)}
                        className="border-border"
                      />
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-primary">
                            {sub.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate max-w-[160px]">
                            {sub.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                            {sub.phone}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Badge
                        className={`text-[10px] px-2 py-0.5 border ${STATUS_STYLES[sub.status]}`}
                      >
                        {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                      </Badge>
                    </td>

                    <td className="px-4 py-3 hidden md:table-cell">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase ${CONN_STYLES[sub.connectionType]}`}
                      >
                        {sub.connectionType}
                      </span>
                    </td>

                    <td className="px-4 py-3 hidden lg:table-cell">
                      <p className="text-xs text-foreground truncate max-w-[120px]">
                        {sub.packageName ?? <span className="text-muted-foreground">—</span>}
                      </p>
                      {sub.packageSpeed && (
                        <p className="text-[10px] text-muted-foreground">{sub.packageSpeed}</p>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right hidden lg:table-cell">
                      <span className="text-xs font-semibold text-foreground">
                        Ksh {sub.monthlyFee.toLocaleString()}
                      </span>
                    </td>

                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="text-xs font-mono text-muted-foreground">
                        {sub.ipAddress ?? "—"}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-center">
                      {sub.isOnline ? (
                        <Wifi size={14} className="text-green-400 mx-auto" />
                      ) : (
                        <WifiOff size={14} className="text-muted-foreground mx-auto" />
                      )}
                    </td>

                    <td
                      className="px-2 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal size={14} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="bg-card border-border text-sm w-40"
                        >
                          <DropdownMenuItem
                            className="text-foreground cursor-pointer hover:bg-muted/20"
                            onClick={() => onSelect(sub._id)}
                          >
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-foreground cursor-pointer hover:bg-muted/20"
                            onClick={() => onEdit(sub._id)}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-border" />
                          {sub.status !== "active" ? (
                            <DropdownMenuItem
                              className="text-green-400 cursor-pointer hover:bg-green-400/10"
                              onClick={() => updateStatus({ ids: [sub._id], status: "active" })}
                            >
                              Activate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="text-amber-400 cursor-pointer hover:bg-amber-400/10"
                              onClick={() =>
                                updateStatus({ ids: [sub._id], status: "suspended" })
                              }
                            >
                              Suspend
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator className="bg-border" />
                          <DropdownMenuItem
                            className="text-red-400 cursor-pointer hover:bg-red-400/10"
                            onClick={() => handleDelete(sub._id)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Load more footer */}
        {(status === "CanLoadMore" || status === "LoadingMore") && (
          <div className="border-t border-border px-4 py-3 flex items-center justify-between bg-background/30">
            <span className="text-xs text-muted-foreground">
              Showing {results.length} subscribers
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs border border-border text-muted-foreground hover:text-foreground"
              onClick={() => loadMore(20)}
              disabled={status === "LoadingMore"}
            >
              {status === "LoadingMore" ? (
                "Loading..."
              ) : (
                <>
                  <ChevronRight size={12} className="mr-1" />
                  Load More
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
