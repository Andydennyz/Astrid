import { useState } from "react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { motion } from "motion/react";
import { BarChart2, TrendingUp, Users, ArrowLeftRight, Network, Download } from "lucide-react";
import RevenueReport from "./_components/revenue-report.tsx";
import SubscriberReport from "./_components/subscriber-report.tsx";
import TransactionReport from "./_components/transaction-report.tsx";
import NetworkReport from "./_components/network-report.tsx";
import ExportPanel from "./_components/export-panel.tsx";

type Tab = "revenue" | "subscribers" | "transactions" | "network" | "export";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "revenue", label: "Revenue", icon: TrendingUp },
  { id: "subscribers", label: "Subscribers", icon: Users },
  { id: "transactions", label: "Transactions", icon: ArrowLeftRight },
  { id: "network", label: "Network", icon: Network },
  { id: "export", label: "Export Data", icon: Download },
];

function ReportsInner() {
  const [activeTab, setActiveTab] = useState<Tab>("revenue");

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
          <div className="h-9 w-9 rounded-lg bg-violet-400/10 border border-violet-400/20 flex items-center justify-center">
            <BarChart2 size={18} className="text-violet-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Reports & Export</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Analytics, summaries, and CSV data exports
            </p>
          </div>
        </div>
      </motion.div>

      {/* Tab nav */}
      <div className="flex items-center gap-1 flex-wrap border-b border-border pb-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all cursor-pointer
                ${active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === "revenue" && <RevenueReport />}
        {activeTab === "subscribers" && <SubscriberReport />}
        {activeTab === "transactions" && <TransactionReport />}
        {activeTab === "network" && <NetworkReport />}
        {activeTab === "export" && <ExportPanel />}
      </motion.div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex h-full items-center justify-center">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-bold">Sign in to continue</h2>
            <SignInButton />
          </div>
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="p-6 space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </AuthLoading>
      <Authenticated>
        <ReportsInner />
      </Authenticated>
    </>
  );
}
