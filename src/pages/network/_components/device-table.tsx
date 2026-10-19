import { useState } from "react";
import { usePaginatedQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  Wifi,
  WifiOff,
  Wrench,
  Server,
  Router,
  Network,
  MoreHorizontal,
  Pencil,
  Trash2,
  ChevronRight,
  MonitorCheck,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { useDebounce } from "@/hooks/use-debounce.ts";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { WifiStatus } from "@/components/ui/wifi-status.tsx";

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

type Props = {
  statusFilter: string;
  typeFilter: string;
  search: string;
  onEdit: (id: Id<"network_devices">, data: EditData) => void;
};

const STATUS_STYLES: Record<DeviceStatus, string> = {
  online: "bg-green-400/10 text-green-400 border-green-400/30",
  offline: "bg-red-400/10 text-red-400 border-red-400/30",
  maintenance: "bg-amber-400/10 text-amber-400 border-amber-400/30",
};

const STATUS_ICONS: Record<
  DeviceStatus,
  React.ComponentType<{ size?: number }>
> = {
  online: Wifi,
  offline: WifiOff,
  maintenance: Wrench,
};

const TYPE_ICONS: Record<
  DeviceType,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  router: Router,
  switch: Network,
  access_point: Wifi,
  server: Server,
  other: MonitorCheck,
};

const TYPE_COLORS: Record<DeviceType, string> = {
  router: "text-cyan-400",
  switch: "text-blue-400",
  access_point: "text-green-400",
  server: "text-violet-400",
  other: "text-muted-foreground",
};

function formatTs(iso: string | undefined) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "dd MMM yy, HH:mm");
  } catch {
    return iso;
  }
}

export default function DeviceTable({
  statusFilter,
  typeFilter,
  search,
  onEdit,
}: Props) {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [debouncedSearch] = useDebounce(search, 300);
  const removeDevice = useMutation(api.network.remove);
  const toggleStatus = useMutation(api.network.toggleStatus);
  const [confirmDelete, setConfirmDelete] =
    useState<Id<"network_devices"> | null>(null);

  const paginationStatus =
    statusFilter === "online" ||
    statusFilter === "offline" ||
    statusFilter === "maintenance"
      ? (statusFilter as DeviceStatus)
      : "all";
  const paginationType =
    typeFilter !== "all" ? (typeFilter as DeviceType) : "all";

  const { results, status, loadMore } = usePaginatedQuery(
    api.network.list,
    workspaceId
      ? {
          workspaceId,
          status: paginationStatus,
          type: paginationType,
          search: debouncedSearch || undefined,
        }
      : "skip",
    { initialNumItems: 20 },
  );

  const handleDelete = async (id: Id<"network_devices">) => {
    if (!workspaceId) return;
    try {
      await removeDevice({ workspaceId, id });
      toast.success("Device removed");
      setConfirmDelete(null);
    } catch {
      toast.error("Failed to remove device");
    }
  };

  const handleToggle = async (
    id: Id<"network_devices">,
    current: DeviceStatus,
  ) => {
    if (!workspaceId) return;
    const next: DeviceStatus = current === "online" ? "offline" : "online";
    try {
      await toggleStatus({ workspaceId, id, status: next });
      toast.success(`Device marked as ${next}`);
    } catch {
      toast.error("Failed to update status");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background/50">
              {[
                "Device",
                "Type",
                "IP Address",
                "Location",
                "Last Seen",
                "Status",
                "",
              ].map((h, i) => (
                <th
                  key={h || i}
                  className={cn(
                    "px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider",
                    i === 3 && "hidden lg:table-cell",
                    i === 4 && "hidden lg:table-cell",
                    i === 6 && "w-10",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {status === "LoadingFirstPage" ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-4 py-3">
                    <Skeleton className="h-10 w-full" />
                  </td>
                </tr>
              ))
            ) : results.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-14 text-center">
                  <Network
                    size={28}
                    className="mx-auto mb-2 text-muted-foreground/30"
                  />
                  <p className="text-sm text-muted-foreground">
                    No devices found
                  </p>
                </td>
              </tr>
            ) : (
              results.map((device) => {
                const TypeIcon =
                  TYPE_ICONS[device.type as DeviceType] ?? MonitorCheck;
                const StatusIcon = STATUS_ICONS[device.status as DeviceStatus];
                return (
                  <tr
                    key={device._id}
                    className="hover:bg-background/40 transition-colors group"
                  >
                    {/* Device name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg border border-border bg-background flex items-center justify-center shrink-0">
                          <TypeIcon
                            size={15}
                            className={
                              TYPE_COLORS[device.type as DeviceType] ??
                              "text-muted-foreground"
                            }
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {device.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground capitalize">
                            {device.type.replace("_", " ")}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span
                        className={cn(
                          "text-xs font-medium capitalize",
                          TYPE_COLORS[device.type as DeviceType],
                        )}
                      >
                        {device.type.replace("_", " ")}
                      </span>
                    </td>

                    {/* IP */}
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-foreground">
                        {device.ipAddress}
                      </span>
                    </td>

                    {/* Location */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {device.location ?? "—"}
                      </span>
                    </td>

                    {/* Last seen */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {formatTs(device.lastSeen)}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {device.status === "maintenance" ? (
                        <Badge
                          className={cn(
                            "text-[10px] px-2 py-0.5 border flex items-center gap-1 w-fit",
                            STATUS_STYLES[device.status],
                          )}
                        >
                          <StatusIcon size={9} />
                          {device.status}
                        </Badge>
                      ) : (
                        <WifiStatus status={device.status} />
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      {confirmDelete === device._id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(device._id)}
                            className="text-[11px] text-destructive hover:underline font-medium"
                          >
                            Confirm
                          </button>
                          <span className="text-muted-foreground/40 text-xs">
                            ·
                          </span>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-[11px] text-muted-foreground hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-colors cursor-pointer opacity-0 group-hover:opacity-100">
                              <MoreHorizontal size={15} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="bg-card border-border w-44"
                          >
                            <DropdownMenuItem
                              className="cursor-pointer text-sm gap-2"
                              onClick={() =>
                                onEdit(device._id, {
                                  name: device.name,
                                  type: device.type as DeviceType,
                                  ipAddress: device.ipAddress,
                                  status: device.status as DeviceStatus,
                                  location: device.location,
                                  notes: device.notes,
                                })
                              }
                            >
                              <Pencil size={13} /> Edit device
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer text-sm gap-2"
                              onClick={() =>
                                handleToggle(
                                  device._id,
                                  device.status as DeviceStatus,
                                )
                              }
                            >
                              {device.status === "online" ? (
                                <>
                                  <WifiOff size={13} /> Mark offline
                                </>
                              ) : (
                                <>
                                  <Wifi size={13} /> Mark online
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer text-sm gap-2"
                              onClick={() => {
                                if (workspaceId) {
                                  void toggleStatus({
                                    workspaceId,
                                    id: device._id,
                                    status: "maintenance",
                                  });
                                }
                              }}
                            >
                              <AlertTriangle size={13} /> Set maintenance
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="cursor-pointer text-sm gap-2 text-destructive focus:text-destructive"
                              onClick={() => setConfirmDelete(device._id)}
                            >
                              <Trash2 size={13} /> Remove device
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
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
            {results.length} devices shown
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs border border-border text-muted-foreground hover:text-foreground"
            onClick={() => loadMore(20)}
            disabled={status === "LoadingMore"}
          >
            {status === "LoadingMore" ? (
              "Loading..."
            ) : (
              <>
                <ChevronRight size={12} className="mr-1" />
                Load More
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
