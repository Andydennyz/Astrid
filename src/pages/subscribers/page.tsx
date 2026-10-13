import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
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
import { Plus, Search, Users } from "lucide-react";
import { motion } from "motion/react";
import SubscriberStatsBar from "./_components/subscriber-stats-bar.tsx";
import SubscriberTable from "./_components/subscriber-table.tsx";
import SubscriberFormDialog from "./_components/subscriber-form-dialog.tsx";
import SubscriberDetailDrawer from "./_components/subscriber-detail-drawer.tsx";

function SubscribersInner() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [connFilter, setConnFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<Id<"subscribers"> | null>(null);
  const [viewId, setViewId] = useState<Id<"subscribers"> | null>(null);

  const stats = useQuery(api.subscribers.getStats, {});

  const handleEdit = (id: Id<"subscribers">) => {
    setViewId(null);
    setEditId(id);
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-start justify-between flex-wrap gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
            <Users size={18} className="text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Subscribers</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage PPPoE, Hotspot, and Static subscribers
            </p>
          </div>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2"
          size="sm"
        >
          <Plus size={14} />
          Add Subscriber
        </Button>
      </motion.div>

      {/* Stats Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <SubscriberStatsBar
          stats={stats}
          loading={stats === undefined}
          activeFilter={statusFilter}
          onFilterChange={(filter) => {
            // "online" is not a DB status — handle separately
            if (filter === "online") {
              setStatusFilter("all");
            } else {
              setStatusFilter(filter);
            }
          }}
        />
      </motion.div>

      {/* Filters Row */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="flex items-center gap-2 flex-wrap"
      >
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search by name, phone, IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 bg-card border-border text-foreground text-sm h-9"
          />
        </div>

        {/* Connection type filter */}
        <Select value={connFilter} onValueChange={setConnFilter}>
          <SelectTrigger className="w-[140px] h-9 bg-card border-border text-foreground text-sm">
            <SelectValue placeholder="Connection" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="pppoe">PPPoE</SelectItem>
            <SelectItem value="hotspot">Hotspot</SelectItem>
            <SelectItem value="static">Static</SelectItem>
          </SelectContent>
        </Select>

        {/* Status quick filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["all", "active", "suspended", "expired", "pending"] as const).map((s) => (
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
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
      >
        <SubscriberTable
          statusFilter={statusFilter}
          connFilter={connFilter}
          search={search}
          onSelect={(id) => setViewId(id)}
          onEdit={handleEdit}
        />
      </motion.div>

      {/* Add / Edit Dialog */}
      <SubscriberFormDialog
        open={addOpen || !!editId}
        onClose={() => {
          setAddOpen(false);
          setEditId(null);
        }}
        editId={editId}
      />

      {/* Detail Drawer */}
      <SubscriberDetailDrawer
        subscriberId={viewId}
        onClose={() => setViewId(null)}
        onEdit={handleEdit}
      />
    </div>
  );
}

export default function SubscribersPage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex h-full items-center justify-center">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-bold text-foreground">Sign in to continue</h2>
            <p className="text-sm text-muted-foreground">
              Access your subscriber management portal by signing in
            </p>
            <SignInButton />
          </div>
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="p-6 space-y-4">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </AuthLoading>
      <Authenticated>
        <SubscribersInner />
      </Authenticated>
    </>
  );
}
