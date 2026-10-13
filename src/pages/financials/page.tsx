import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { TrendingUp, Plus, Search, Zap, AlertTriangle } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import InvoiceStatsBar from "./_components/invoice-stats-bar.tsx";
import InvoiceTable from "./_components/invoice-table.tsx";
import InvoiceFormDialog from "./_components/invoice-form-dialog.tsx";
import RevenueBarChart from "./_components/revenue-bar-chart.tsx";
import BulkGenerateDialog from "./_components/bulk-generate-dialog.tsx";

function FinancialsInner() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<Id<"invoices"> | null>(null);
  const [bulkGenOpen, setBulkGenOpen] = useState(false);
  const [markingOverdue, setMarkingOverdue] = useState(false);

  const stats = useQuery(api.financials.getInvoiceStats, {});
  const monthlyRevenue = useQuery(api.financials.getMonthlyRevenue, {});
  const markOverdue = useMutation(api.financials.markOverdueInvoices);

  const handleMarkOverdue = async () => {
    setMarkingOverdue(true);
    try {
      const count = await markOverdue({});
      if (count === 0) {
        toast.info("No past-due pending invoices found");
      } else {
        toast.success(`Marked ${count} invoice${count !== 1 ? "s" : ""} as overdue`);
      }
    } catch {
      toast.error("Failed to mark overdue invoices");
    } finally {
      setMarkingOverdue(false);
    }
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
          <div className="h-9 w-9 rounded-lg bg-green-400/10 border border-green-400/20 flex items-center justify-center">
            <TrendingUp size={18} className="text-green-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Financials</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Revenue, invoices, and billing management
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => setBulkGenOpen(true)}
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 border border-amber-400/30 text-amber-400 hover:bg-amber-400/10 hover:text-amber-300"
          >
            <Zap size={13} />
            Bulk Generate
          </Button>
          <Button
            onClick={handleMarkOverdue}
            disabled={markingOverdue}
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 border border-red-400/30 text-red-400 hover:bg-red-400/10 hover:text-red-300"
          >
            <AlertTriangle size={13} />
            {markingOverdue ? "Checking..." : "Mark Overdue"}
          </Button>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2 h-8"
            size="sm"
          >
            <Plus size={14} />
            Create Invoice
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <InvoiceStatsBar
          stats={stats}
          loading={stats === undefined}
          activeFilter={statusFilter}
          onFilterChange={setStatusFilter}
        />
      </motion.div>

      {/* Revenue chart + quick info */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        {/* 6-month bar chart */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Monthly Revenue</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Last 6 months collected</p>
            </div>
            {stats && (
              <div className="text-right">
                <p className="text-lg font-bold text-green-400">
                  Ksh {stats.thisMonthRevenue.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {stats.revenueGrowth >= 0 ? "+" : ""}
                  {stats.revenueGrowth}% vs last month
                </p>
              </div>
            )}
          </div>
          <div className="h-52">
            <RevenueBarChart
              data={monthlyRevenue ?? []}
              loading={monthlyRevenue === undefined}
            />
          </div>
        </div>

        {/* Financial summary */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Financial Summary</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Current billing period</p>
          </div>

          {stats === undefined ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {[
                {
                  label: "Total Revenue",
                  value: `Ksh ${stats.totalRevenue.toLocaleString()}`,
                  color: "text-green-400",
                },
                {
                  label: "This Month",
                  value: `Ksh ${stats.thisMonthRevenue.toLocaleString()}`,
                  color: "text-cyan-400",
                },
                {
                  label: "Outstanding",
                  value: `Ksh ${stats.outstandingAmount.toLocaleString()}`,
                  color: "text-amber-400",
                },
                {
                  label: "Paid Invoices",
                  value: `${stats.paid} / ${stats.total}`,
                  color: "text-foreground",
                },
                {
                  label: "Overdue",
                  value: `${stats.overdue} invoice${stats.overdue !== 1 ? "s" : ""}`,
                  color: stats.overdue > 0 ? "text-red-400" : "text-muted-foreground",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2.5"
                >
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <span className={`text-xs font-bold ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* Invoices table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="space-y-3"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground flex-1">Invoices</h3>

          {/* Search */}
          <div className="relative min-w-[200px] max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search invoices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 bg-card border-border text-foreground text-sm"
            />
          </div>

          {/* Status filters */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["all", "pending", "paid", "overdue", "cancelled"] as const).map((s) => (
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

        <InvoiceTable
          statusFilter={statusFilter}
          search={search}
          onEdit={(id) => setEditId(id)}
        />
      </motion.div>

      {/* Invoice dialog */}
      <InvoiceFormDialog
        open={createOpen || !!editId}
        onClose={() => {
          setCreateOpen(false);
          setEditId(null);
        }}
        editId={editId}
      />

      {/* Bulk generate dialog */}
      <BulkGenerateDialog open={bulkGenOpen} onClose={() => setBulkGenOpen(false)} />
    </div>
  );
}

export default function FinancialsPage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex h-full items-center justify-center">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-bold text-foreground">Sign in to continue</h2>
            <p className="text-sm text-muted-foreground">Access financials by signing in</p>
            <SignInButton />
          </div>
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="p-6 space-y-4">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </AuthLoading>
      <Authenticated>
        <FinancialsInner />
      </Authenticated>
    </>
  );
}
