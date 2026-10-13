import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
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
import { Package, Plus, Search } from "lucide-react";
import { motion } from "motion/react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty.tsx";
import PackageStatsBar from "./_components/package-stats-bar.tsx";
import PackageCard from "./_components/package-card.tsx";
import PackageFormDialog from "./_components/package-form-dialog.tsx";
import { useQuery } from "convex/react";

function PackagesInner() {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [typeFilter, setTypeFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<Id<"packages"> | null>(null);

  const stats = useQuery(
    api.packages.getStats,
    workspaceId ? { workspaceId } : "skip",
  );

  const { results, status, loadMore } = usePaginatedQuery(
    api.packages.list,
    workspaceId
      ? {
          workspaceId,
          type: typeFilter === "pppoe" || typeFilter === "hotspot" || typeFilter === "static"
            ? typeFilter
            : "all",
          isActive:
            activeFilter === "active" || activeFilter === "inactive"
              ? activeFilter
              : "all",
          search: search || undefined,
        }
      : "skip",
    { initialNumItems: 12 },
  );

  const handleStatsFilter = (filter: string) => {
    if (filter === "pppoe" || filter === "hotspot" || filter === "static") {
      setTypeFilter(filter);
      setActiveFilter("all");
    } else if (filter === "active" || filter === "inactive") {
      setActiveFilter(filter);
      setTypeFilter("all");
    } else {
      setTypeFilter("all");
      setActiveFilter("all");
    }
  };

  const activeStatKey =
    typeFilter !== "all"
      ? typeFilter
      : activeFilter !== "all"
        ? activeFilter
        : "all";

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
            <Package size={18} className="text-violet-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Packages</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage internet packages and speed tiers
            </p>
          </div>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2"
          size="sm"
        >
          <Plus size={14} />
          Add Package
        </Button>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <PackageStatsBar
          stats={stats}
          loading={stats === undefined}
          activeFilter={activeStatKey}
          onFilterChange={handleStatsFilter}
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
            placeholder="Search packages..."
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
            <SelectItem value="pppoe">PPPoE</SelectItem>
            <SelectItem value="hotspot">Hotspot</SelectItem>
            <SelectItem value="static">Static IP</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`h-7 px-3 rounded-full text-[11px] font-medium border transition-all cursor-pointer ${
                activeFilter === f
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "bg-card border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Grid */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
      >
        {status === "LoadingFirstPage" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Package />
              </EmptyMedia>
              <EmptyTitle>No packages found</EmptyTitle>
              <EmptyDescription>
                {search ? "Try a different search term" : "Create your first package to get started"}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus size={14} className="mr-1.5" />
                Add Package
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {results.map((pkg) => (
                <PackageCard key={pkg._id} pkg={pkg} onEdit={(id) => setEditId(id)} />
              ))}
            </div>
            {status === "CanLoadMore" && (
              <div className="flex justify-center mt-6">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => loadMore(12)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </motion.div>

      {/* Add / Edit Dialog */}
      <PackageFormDialog
        open={addOpen || !!editId}
        onClose={() => {
          setAddOpen(false);
          setEditId(null);
        }}
        editId={editId}
      />
    </div>
  );
}

export default function PackagesPage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex h-full items-center justify-center">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-bold text-foreground">Sign in to continue</h2>
            <p className="text-sm text-muted-foreground">Access package management by signing in</p>
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
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        </div>
      </AuthLoading>
      <Authenticated>
        <PackagesInner />
      </Authenticated>
    </>
  );
}
