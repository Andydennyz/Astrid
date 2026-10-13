import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import StatsCard from "./_components/stats-card.tsx";
import RevenueChart from "./_components/revenue-chart.tsx";
import SubscriberDonut from "./_components/subscriber-donut.tsx";
import RecentTransactions from "./_components/recent-transactions.tsx";
import { useAuth } from "@/hooks/use-auth.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Users,
  DollarSign,
  AlertCircle,
  Wifi,
  WifiOff,
  TicketCheck,
  RefreshCw,
  Database,
  Server,
} from "lucide-react";
import { motion } from "motion/react";

function DashboardInner() {
  const { user } = useAuth();
  const stats = useQuery(api.dashboard.getStats, {});
  const revenueData = useQuery(api.dashboard.getRevenueChart, {});
  const recentTx = useQuery(api.dashboard.getRecentTransactions, {});
  const subscriberBreakdown = useQuery(api.dashboard.getSubscriberBreakdown, {});

  const isLoading = stats === undefined || revenueData === undefined;

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  })();

  const cards = [
    {
      title: "Active Subscribers",
      value: stats?.activeSubscribers ?? 0,
      icon: Users,
      iconBg: "bg-cyan-400/10 border-cyan-400/20",
      iconColor: "text-cyan-400",
      glowColor: "rgba(0,200,255,0.06)",
      trend: { value: 11.0, isPositive: true },
      subStats: stats
        ? `${stats.pppoeCount} PPPoE · ${stats.hotspotCount} Hotspot`
        : undefined,
    },
    {
      title: "Monthly Revenue",
      value: stats?.monthlyRevenue ?? 0,
      icon: DollarSign,
      iconBg: "bg-green-400/10 border-green-400/20",
      iconColor: "text-green-400",
      glowColor: "rgba(74,222,128,0.06)",
      trend: { value: 100.0, isPositive: true },
      subStats: stats ? `Today Ksh ${stats.todayRevenue.toLocaleString()}` : undefined,
      prefix: "Ksh",
    },
    {
      title: "Outstanding Invoices",
      value: stats?.pendingInvoices ?? 0,
      icon: AlertCircle,
      iconBg: "bg-amber-400/10 border-amber-400/20",
      iconColor: "text-amber-400",
      glowColor: "rgba(251,191,36,0.06)",
      subStats: stats
        ? stats.outstandingAmount > 0
          ? `Ksh ${stats.outstandingAmount.toLocaleString()} outstanding`
          : "No unpaid invoices"
        : undefined,
    },
    {
      title: "Online Subscribers",
      value: stats?.onlineSubscribers ?? 0,
      icon: Wifi,
      iconBg: "bg-primary/10 border-primary/20",
      iconColor: "text-primary",
      glowColor: "rgba(0,200,255,0.06)",
      trend: { value: 12.0, isPositive: true },
      subStats: stats
        ? `${Math.round(stats.totalSubscribers > 0 ? (stats.onlineSubscribers / stats.totalSubscribers) * 100 : 0)}% of total`
        : undefined,
    },
    {
      title: "Offline Subscribers",
      value: stats?.offlineSubscribers ?? 0,
      icon: WifiOff,
      iconBg: "bg-red-400/10 border-red-400/20",
      iconColor: "text-red-400",
      glowColor: "rgba(248,113,113,0.06)",
      subStats: stats
        ? `${stats.expiredSubscribers} expired devices`
        : undefined,
    },
    {
      title: "Open Tickets",
      value: stats?.openTickets ?? 0,
      icon: TicketCheck,
      iconBg: "bg-accent/10 border-accent/20",
      iconColor: "text-accent",
      glowColor: "rgba(167,139,250,0.06)",
      subStats: stats
        ? `${stats.totalNetworkDevices} total devices`
        : undefined,
    },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-start justify-between flex-wrap gap-3"
      >
        <div>
          <h2 className="text-xl font-bold text-foreground">Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {greeting}, {user?.profile?.name ?? "Operator"} — here's what's happening today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="rounded-lg border border-border bg-card text-sm text-foreground px-3 py-1.5 focus:outline-none focus:border-primary/50 transition-colors">
            <option>This Month</option>
            <option>Last Month</option>
            <option>Last 3 Months</option>
            <option>This Year</option>
          </select>
          <button className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3"
      >
        {cards.map((card, i) => (
          <StatsCard
            key={card.title}
            {...card}
            loading={isLoading}
          />
        ))}
      </motion.div>

      {/* Charts Row */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        {/* Revenue Chart */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Revenue</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Last 30 days collection</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-primary/80" />
                Revenue
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-green-400/60" style={{ borderTop: "2px dashed oklch(0.72 0.18 145)" }} />
                Payments
              </span>
            </div>
          </div>
          <div className="h-56">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <RevenueChart data={revenueData ?? []} loading={false} />
            )}
          </div>
        </div>

        {/* Subscriber Donut */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-foreground">Subscriber Status</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Current distribution</p>
          </div>
          <div className="h-64">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <SubscriberDonut
                data={
                  subscriberBreakdown ?? {
                    active: 0,
                    suspended: 0,
                    expired: 0,
                    pending: 0,
                    total: 0,
                  }
                }
                loading={false}
              />
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-2 border-t border-border mt-2">
            <button className="flex-1 rounded-lg border border-amber-400/30 bg-amber-400/10 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-400/20 transition-colors">
              View Suspended
            </button>
            <button className="flex-1 rounded-lg border border-primary/30 bg-primary/10 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors">
              Send Reminder
            </button>
          </div>
        </div>
      </motion.div>

      {/* Bottom Row */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        {/* Recent Transactions */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Recent Transactions</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Latest payment activity</p>
            </div>
            <a
              href="/transactions"
              className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
            >
              View all →
            </a>
          </div>
          <RecentTransactions data={recentTx ?? []} loading={recentTx === undefined} />
        </div>

        {/* Quick Stats */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">System Overview</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Infrastructure health</p>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {[
                {
                  label: "Network Devices",
                  value: stats?.totalNetworkDevices ?? 0,
                  sub: `${stats?.onlineDevices ?? 0} online`,
                  icon: Server,
                  color: "text-cyan-400",
                },
                {
                  label: "Total Subscribers",
                  value: stats?.totalSubscribers ?? 0,
                  sub: `${stats?.activeSubscribers ?? 0} active`,
                  icon: Users,
                  color: "text-green-400",
                },
                {
                  label: "Pending Invoices",
                  value: stats?.pendingInvoices ?? 0,
                  sub: `${stats?.overdueInvoices ?? 0} overdue`,
                  icon: AlertCircle,
                  color: "text-amber-400",
                },
                {
                  label: "Storage / DB",
                  value: "Healthy",
                  sub: "All systems operational",
                  icon: Database,
                  color: "text-primary",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-3 rounded-lg border border-border bg-background/50 px-3 py-2.5 hover:bg-card transition-colors"
                >
                  <div
                    className={`h-8 w-8 rounded-lg bg-current/10 flex items-center justify-center shrink-0`}
                    style={{ backgroundColor: "oklch(0.14 0.025 264)" }}
                  >
                    <item.icon size={14} className={item.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-sm font-semibold text-foreground truncate">
                      {typeof item.value === "number" ? item.value.toLocaleString() : item.value}
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-right shrink-0">{item.sub}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex h-full items-center justify-center">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-bold text-foreground">Sign in to continue</h2>
            <p className="text-sm text-muted-foreground">
              Access your operator portal by signing in
            </p>
            <SignInButton />
          </div>
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </AuthLoading>
      <Authenticated>
        <DashboardInner />
      </Authenticated>
    </>
  );
}
