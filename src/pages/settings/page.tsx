import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { motion } from "motion/react";
import { Settings, User, Bell, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils.ts";
import ProfileTab from "./_components/profile-tab.tsx";
import NotificationsTab from "./_components/notifications-tab.tsx";
import AuditLogsTab from "./_components/audit-logs-tab.tsx";

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "audit", label: "Audit Logs", icon: ShieldCheck },
] as const;

type TabId = (typeof TABS)[number]["id"];

function SettingsInner() {
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-3"
      >
        <div className="h-9 w-9 rounded-lg bg-muted/50 border border-border flex items-center justify-center">
          <Settings size={18} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Settings</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage your profile, notification preferences and audit history
          </p>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="flex items-center gap-1 border-b border-border"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all cursor-pointer",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </motion.div>

      {/* Tab content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {activeTab === "profile" && <ProfileTab />}
        {activeTab === "notifications" && <NotificationsTab />}
        {activeTab === "audit" && <AuditLogsTab />}
      </motion.div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex h-full items-center justify-center">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-bold text-foreground">Sign in to continue</h2>
            <p className="text-sm text-muted-foreground">Access settings by signing in</p>
            <SignInButton />
          </div>
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="p-6 space-y-4">
          <Skeleton className="h-10 w-64" />
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-28" />)}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </AuthLoading>
      <Authenticated>
        <SettingsInner />
      </Authenticated>
    </>
  );
}
