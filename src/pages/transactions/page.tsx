import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
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
import { ArrowLeftRight, Plus, Search } from "lucide-react";
import { motion } from "motion/react";
import TransactionStatsBar from "./_components/transaction-stats-bar.tsx";
import TransactionTable from "./_components/transaction-table.tsx";
import TransactionFormDialog from "./_components/transaction-form-dialog.tsx";
import VolumeAreaChart from "./_components/volume-area-chart.tsx";
import MethodBreakdown from "./_components/method-breakdown.tsx";

function TransactionsInner() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const stats = useQuery(api.transactions.getStats, {});
  const dailyVolume = useQuery(api.transactions.getDailyVolume, {});

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
          <div className="h-9 w-9 rounded-lg bg-blue-400/10 border border-blue-400/20 flex items-center justify-center">
            <ArrowLeftRight size={18} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Transactions</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              All payments, refunds and credit adjustments
            </p>
          </div>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2"
          size="sm"
        >
          <Plus size={14} />
          Record Payment
        </Button>
      </motion.div>

      {/* Stats bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <TransactionStatsBar
          stats={stats}
          loading={stats === undefined}
          activeFilter={statusFilter}
          onFilterChange={setStatusFilter}
        />
      </motion.div>

      {/* Charts row */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        {/* 14-day area chart */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Transaction Volume</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Last 14 days</p>
            </div>
            {stats && (
              <div className="text-right">
                <p className="text-lg font-bold text-cyan-400">
                  Ksh {stats.thisMonthVolume.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">This month</p>
              </div>
            )}
          </div>
          <div className="h-48">
            <VolumeAreaChart
              data={dailyVolume ?? []}
              loading={dailyVolume === undefined}
            />
          </div>
        </div>

        {/* Method breakdown donut */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-foreground">By Payment Method</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Volume distribution</p>
          </div>
          <div className="h-52">
            <MethodBreakdown stats={stats} loading={stats === undefined} />
          </div>
        </div>
      </motion.div>

      {/* Filters + Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="space-y-3"
      >
        {/* Filter controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search subscriber, reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 bg-card border-border text-foreground text-sm"
            />
          </div>

          {/* Method */}
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="w-[130px] h-9 bg-card border-border text-foreground text-sm">
              <SelectValue placeholder="Method" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Methods</SelectItem>
              <SelectItem value="mpesa">M-Pesa</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="bank">Bank</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="paypal">PayPal</SelectItem>
            </SelectContent>
          </Select>

          {/* Type */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[120px] h-9 bg-card border-border text-foreground text-sm">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="payment">Payment</SelectItem>
              <SelectItem value="refund">Refund</SelectItem>
              <SelectItem value="credit">Credit</SelectItem>
              <SelectItem value="debit">Debit</SelectItem>
            </SelectContent>
          </Select>

          {/* Status pills */}
          <div className="flex items-center gap-1.5">
            {(["all", "completed", "pending", "failed"] as const).map((s) => (
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

        {/* Table */}
        <TransactionTable
          statusFilter={statusFilter}
          methodFilter={methodFilter}
          typeFilter={typeFilter}
          search={search}
        />
      </motion.div>

      {/* Record transaction dialog */}
      <TransactionFormDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
      />
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex h-full items-center justify-center">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-bold text-foreground">Sign in to continue</h2>
            <p className="text-sm text-muted-foreground">Access transactions by signing in</p>
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
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </AuthLoading>
      <Authenticated>
        <TransactionsInner />
      </Authenticated>
    </>
  );
}
