import { useState } from "react";
import { usePaginatedQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { MoreHorizontal, ChevronRight, Smartphone, Banknote, CreditCard, Building2, Globe } from "lucide-react";
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
import { format } from "date-fns";
import { useDebounce } from "@/hooks/use-debounce.ts";

const STATUS_STYLES = {
  completed: "bg-green-400/10 text-green-400 border-green-400/30",
  pending:   "bg-amber-400/10 text-amber-400 border-amber-400/30",
  failed:    "bg-red-400/10 text-red-400 border-red-400/30",
};

const TYPE_STYLES = {
  payment: "text-green-400",
  refund:  "text-red-400",
  credit:  "text-cyan-400",
  debit:   "text-amber-400",
};

const METHOD_ICONS = {
  mpesa:  Smartphone,
  cash:   Banknote,
  card:   CreditCard,
  bank:   Building2,
  paypal: Globe,
};

const METHOD_COLORS = {
  mpesa:  "text-green-400",
  cash:   "text-amber-400",
  card:   "text-blue-400",
  bank:   "text-cyan-400",
  paypal: "text-indigo-400",
};

type Props = {
  statusFilter: string;
  methodFilter: string;
  typeFilter: string;
  search: string;
};

export default function TransactionTable({ statusFilter, methodFilter, typeFilter, search }: Props) {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [debouncedSearch] = useDebounce(search, 300);

  const updateStatus = useMutation(api.transactions.updateStatus);
  const removeTx = useMutation(api.transactions.remove);

  const { results, status, loadMore } = usePaginatedQuery(
    api.transactions.list,
    workspaceId
      ? {
          workspaceId,
          status: statusFilter as "completed" | "pending" | "failed" | "all",
          method: methodFilter as "mpesa" | "cash" | "bank" | "card" | "paypal" | "all",
          type: typeFilter as "payment" | "refund" | "credit" | "debit" | "all",
          search: debouncedSearch || undefined,
        }
      : "skip",
    { initialNumItems: 25 },
  );

  const handleDelete = async (id: Id<"transactions">) => {
    if (!workspaceId) return;
    try {
      await removeTx({ workspaceId, id });
      toast.success("Transaction deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleUpdateStatus = async (
    id: Id<"transactions">,
    s: "completed" | "pending" | "failed",
  ) => {
    if (!workspaceId) return;
    try {
      await updateStatus({ workspaceId, id, status: s });
      toast.success(`Marked as ${s}`);
    } catch {
      toast.error("Failed to update");
    }
  };

  const formatDate = (iso: string) => {
    try { return format(new Date(iso), "dd MMM yyyy, HH:mm"); }
    catch { return iso; }
  };

  if (status === "LoadingFirstPage") {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background/50">
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Subscriber
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
                Type
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                Method
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Amount
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
                Status
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                Reference
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden xl:table-cell">
                Date
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {results.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No transactions found
                </td>
              </tr>
            ) : (
              results.map((tx) => {
                const MethodIcon = METHOD_ICONS[tx.method] ?? Globe;
                return (
                  <tr key={tx._id} className="hover:bg-background/40 transition-colors group">
                    {/* Subscriber */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-primary">
                            {tx.subscriberName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate max-w-[140px]">
                            {tx.subscriberName}
                          </p>
                          {tx.subscriberPhone && (
                            <p className="text-[10px] text-muted-foreground">{tx.subscriberPhone}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={`text-xs font-semibold capitalize ${TYPE_STYLES[tx.type]}`}>
                        {tx.type}
                      </span>
                    </td>

                    {/* Method */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-1.5">
                        <MethodIcon size={12} className={METHOD_COLORS[tx.method]} />
                        <span className="text-xs text-muted-foreground capitalize">
                          {tx.method === "mpesa" ? "M-Pesa" : tx.method.charAt(0).toUpperCase() + tx.method.slice(1)}
                        </span>
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`text-sm font-bold ${
                          tx.type === "refund" || tx.type === "debit"
                            ? "text-red-400"
                            : "text-foreground"
                        }`}
                      >
                        {tx.type === "refund" || tx.type === "debit" ? "−" : "+"}Ksh{" "}
                        {tx.amount.toLocaleString()}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Badge className={`text-[10px] px-2 py-0.5 border ${STATUS_STYLES[tx.status]}`}>
                        {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                      </Badge>
                    </td>

                    {/* Reference */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {tx.reference ?? "—"}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</span>
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
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
                        <DropdownMenuContent align="end" className="bg-card border-border w-44">
                          {tx.status !== "completed" && (
                            <DropdownMenuItem
                              className="text-green-400 cursor-pointer hover:bg-green-400/10 text-xs"
                              onClick={() => handleUpdateStatus(tx._id, "completed")}
                            >
                              Mark Completed
                            </DropdownMenuItem>
                          )}
                          {tx.status !== "failed" && (
                            <DropdownMenuItem
                              className="text-red-400 cursor-pointer hover:bg-red-400/10 text-xs"
                              onClick={() => handleUpdateStatus(tx._id, "failed")}
                            >
                              Mark Failed
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator className="bg-border" />
                          <DropdownMenuItem
                            className="text-red-400 cursor-pointer hover:bg-red-400/10 text-xs"
                            onClick={() => handleDelete(tx._id)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <div className="border-t border-border px-4 py-3 flex items-center justify-between bg-background/30">
          <span className="text-xs text-muted-foreground">
            Showing {results.length} transactions
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs border border-border text-muted-foreground hover:text-foreground"
            onClick={() => loadMore(25)}
            disabled={status === "LoadingMore"}
          >
            {status === "LoadingMore" ? (
              "Loading..."
            ) : (
              <><ChevronRight size={12} className="mr-1" /> Load More</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
