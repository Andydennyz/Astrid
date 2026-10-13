import { useState } from "react";
import { usePaginatedQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { MoreHorizontal, ChevronRight, CheckCircle } from "lucide-react";
import RecordPaymentDialog from "./record-payment-dialog.tsx";
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
import { format } from "date-fns";
import { useDebounce } from "@/hooks/use-debounce.ts";

const STATUS_STYLES = {
  paid: "bg-green-400/10 text-green-400 border-green-400/30",
  pending: "bg-amber-400/10 text-amber-400 border-amber-400/30",
  overdue: "bg-red-400/10 text-red-400 border-red-400/30",
  cancelled: "bg-muted/30 text-muted-foreground border-border",
};

type Props = {
  statusFilter: string;
  search: string;
  onEdit: (id: Id<"invoices">) => void;
};

export default function InvoiceTable({ statusFilter, search, onEdit }: Props) {
  const [selected, setSelected] = useState<Set<Id<"invoices">>>(new Set());
  const [paymentInvoice, setPaymentInvoice] = useState<{
    id: Id<"invoices">;
    amount: number;
    number: string;
  } | null>(null);
  const [debouncedSearch] = useDebounce(search, 300);

  const markAsPaid = useMutation(api.financials.markAsPaid);
  const deleteInvoice = useMutation(api.financials.deleteInvoice);

  const { results, status, loadMore } = usePaginatedQuery(
    api.financials.listInvoices,
    {
      status: statusFilter as "pending" | "paid" | "overdue" | "cancelled" | "all",
      search: debouncedSearch || undefined,
    },
    { initialNumItems: 25 },
  );

  const toggleSelect = (id: Id<"invoices">) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });

  const toggleAll = () =>
    setSelected(selected.size === results.length ? new Set() : new Set(results.map((r) => r._id)));

  const handleBulkPaid = async () => {
    if (!selected.size) return;
    const unpaid = results
      .filter((r) => selected.has(r._id) && r.status !== "paid" && r.status !== "cancelled")
      .map((r) => r._id);
    if (!unpaid.length) return toast.error("No payable invoices selected");
    try {
      await markAsPaid({ ids: unpaid });
      toast.success(`${unpaid.length} invoice(s) marked as paid`);
      setSelected(new Set());
    } catch {
      toast.error("Failed to update invoices");
    }
  };

  const handleDelete = async (id: Id<"invoices">) => {
    try {
      await deleteInvoice({ id });
      toast.success("Invoice deleted");
    } catch {
      toast.error("Failed to delete invoice");
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

  const formatDate = (iso: string) => {
    try {
      return format(new Date(iso), "dd MMM yyyy");
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-3">
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-green-400/30 bg-green-400/5 px-4 py-2">
          <span className="text-xs text-green-400 font-medium">{selected.size} selected</span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs border border-green-400/30 text-green-400 hover:bg-green-400/10"
            onClick={handleBulkPaid}
          >
            Mark Paid
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs border border-border text-muted-foreground"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background/50">
                <th className="px-4 py-3 w-10">
                  <Checkbox
                    checked={results.length > 0 && selected.size === results.length}
                    onCheckedChange={toggleAll}
                    className="border-border"
                  />
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Invoice #
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Subscriber
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                  Description
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                  Due Date
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden xl:table-cell">
                  Paid Date
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {results.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No invoices found
                  </td>
                </tr>
              ) : (
                results.map((inv) => (
                  <tr
                    key={inv._id}
                    className="hover:bg-background/40 transition-colors group"
                  >
                    <td
                      className="px-4 py-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(inv._id);
                      }}
                    >
                      <Checkbox
                        checked={selected.has(inv._id)}
                        onCheckedChange={() => toggleSelect(inv._id)}
                        className="border-border"
                      />
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-primary">{inv.invoiceNumber}</span>
                    </td>

                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground truncate max-w-[140px]">
                          {inv.subscriberName}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{inv.subscriberPhone}</p>
                      </div>
                    </td>

                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {inv.description}
                      </p>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-foreground">
                        Ksh {inv.amount.toLocaleString()}
                      </span>
                    </td>

                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Badge
                        className={`text-[10px] px-2 py-0.5 border ${STATUS_STYLES[inv.status]}`}
                      >
                        {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                      </Badge>
                    </td>

                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span
                        className={`text-xs ${
                          inv.status === "overdue" ? "text-red-400 font-medium" : "text-muted-foreground"
                        }`}
                      >
                        {formatDate(inv.dueDate)}
                      </span>
                    </td>

                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {inv.paidDate ? formatDate(inv.paidDate) : "—"}
                      </span>
                    </td>

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
                        <DropdownMenuContent
                          align="end"
                          className="bg-card border-border text-sm w-40"
                        >
                          <DropdownMenuItem
                            className="text-foreground cursor-pointer hover:bg-muted/20"
                            onClick={() => onEdit(inv._id)}
                          >
                            Edit
                          </DropdownMenuItem>
                          {inv.status !== "paid" && inv.status !== "cancelled" && (
                            <DropdownMenuItem
                              className="text-green-400 cursor-pointer hover:bg-green-400/10"
                              onClick={() =>
                                setPaymentInvoice({
                                  id: inv._id,
                                  amount: inv.amount,
                                  number: inv.invoiceNumber,
                                })
                              }
                            >
                              <CheckCircle size={12} className="mr-2" /> Record Payment
                            </DropdownMenuItem>
                          )}
                          {inv.status !== "paid" && inv.status !== "cancelled" && (
                            <DropdownMenuItem
                              className="text-green-400 cursor-pointer hover:bg-green-400/10"
                              onClick={() => markAsPaid({ ids: [inv._id] })}
                            >
                              Mark as Paid
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator className="bg-border" />
                          <DropdownMenuItem
                            className="text-red-400 cursor-pointer hover:bg-red-400/10"
                            onClick={() => handleDelete(inv._id)}
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

        {(status === "CanLoadMore" || status === "LoadingMore") && (
          <div className="border-t border-border px-4 py-3 flex items-center justify-between bg-background/30">
            <span className="text-xs text-muted-foreground">
              Showing {results.length} invoices
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs border border-border text-muted-foreground hover:text-foreground"
              onClick={() => loadMore(25)}
              disabled={status === "LoadingMore"}
            >
              {status === "LoadingMore" ? "Loading..." : <><ChevronRight size={12} className="mr-1" /> Load More</>}
            </Button>
          </div>
        )}
      </div>

      {/* Record Payment Dialog */}
      <RecordPaymentDialog
        open={!!paymentInvoice}
        onClose={() => setPaymentInvoice(null)}
        invoiceId={paymentInvoice?.id ?? null}
        invoiceAmount={paymentInvoice?.amount}
        invoiceNumber={paymentInvoice?.number}
      />
    </div>
  );
}
