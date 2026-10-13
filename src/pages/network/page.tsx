import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
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
import { Network, Plus, Search } from "lucide-react";
import { motion } from "motion/react";
import DeviceStatsBar from "./_components/device-stats-bar.tsx";
import DeviceTable from "./_components/device-table.tsx";
import DeviceFormDialog from "./_components/device-form-dialog.tsx";

type DeviceType = "router" | "switch" | "access_point" | "server" | "other";
type DeviceStatus = "online" | "offline" | "maintenance";

type EditData = {
  name: string;
  type: DeviceType;
  ipAddress: string;
  status: DeviceStatus;
  location?: string;
  notes?: string;
};

function NetworkInner() {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<Id<"network_devices"> | null>(null);
  const [editData, setEditData] = useState<EditData | null>(null);

  const stats = useQuery(
    api.network.getStats,
    workspaceId ? { workspaceId } : "skip",
  );

  const handleEdit = (id: Id<"network_devices">, data: EditData) => {
    setEditId(id);
    setEditData(data);
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
            <Network size={18} className="text-green-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Network Devices</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Monitor and manage routers, switches, access points and servers
            </p>
          </div>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2"
          size="sm"
        >
          <Plus size={14} />
          Add Device
        </Button>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <DeviceStatsBar
          stats={stats}
          loading={stats === undefined}
          activeFilter={statusFilter}
          onFilterChange={(f) => {
            // map type filters to type filter state
            if (f === "router" || f === "server") {
              setTypeFilter(f);
              setStatusFilter("all");
            } else {
              setStatusFilter(f);
              setTypeFilter("all");
            }
          }}
        />
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="flex items-center gap-2 flex-wrap"
      >
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search devices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 bg-card border-border text-foreground text-sm"
          />
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px] h-9 bg-card border-border text-foreground text-sm">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="router">Router</SelectItem>
            <SelectItem value="switch">Switch</SelectItem>
            <SelectItem value="access_point">Access Point</SelectItem>
            <SelectItem value="server">Server</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(["all", "online", "offline", "maintenance"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`h-7 px-3 rounded-full text-[11px] font-medium border transition-all cursor-pointer ${
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
        <DeviceTable
          statusFilter={statusFilter}
          typeFilter={typeFilter}
          search={search}
          onEdit={handleEdit}
        />
      </motion.div>

      {/* Dialogs */}
      <DeviceFormDialog
        open={addOpen || !!editId}
        onClose={() => {
          setAddOpen(false);
          setEditId(null);
          setEditData(null);
        }}
        editId={editId}
        editData={editData}
      />
    </div>
  );
}

export default function NetworkPage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex h-full items-center justify-center">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-bold text-foreground">Sign in to continue</h2>
            <p className="text-sm text-muted-foreground">Access network management by signing in</p>
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
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        </div>
      </AuthLoading>
      <Authenticated>
        <NetworkInner />
      </Authenticated>
    </>
  );
}
