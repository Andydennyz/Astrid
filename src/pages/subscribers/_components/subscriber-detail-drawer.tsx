import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Phone,
  Mail,
  MapPin,
  Server,
  Tag,
  CreditCard,
  FileText,
  Edit,
  Trash2,
  ShieldBan,
  ShieldCheck,
  KeyRound,
} from "lucide-react";
import { WifiSignalIcon } from "@/components/ui/wifi-status.tsx";
import { format } from "date-fns";
import { toast } from "sonner";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";

const STATUS_STYLES = {
  active: "bg-green-400/10 text-green-400 border-green-400/30",
  suspended: "bg-amber-400/10 text-amber-400 border-amber-400/30",
  expired: "bg-red-400/10 text-red-400 border-red-400/30",
  pending: "bg-blue-400/10 text-blue-400 border-blue-400/30",
};

type Props = {
  subscriberId: Id<"subscribers"> | null;
  onClose: () => void;
  onEdit: (id: Id<"subscribers">) => void;
};

export default function SubscriberDetailDrawer({
  subscriberId,
  onClose,
  onEdit,
}: Props) {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sub = useQuery(
    api.subscribers.getById,
    subscriberId && workspaceId ? { id: subscriberId, workspaceId } : "skip",
  );
  const updateStatus = useMutation(api.subscribers.updateStatus);
  const removeSub = useMutation(api.subscribers.remove);

  const handleToggleSuspend = async () => {
    if (!subscriberId || !sub || !workspaceId) return;
    const newStatus = sub.status === "suspended" ? "active" : "suspended";
    try {
      await updateStatus({
        workspaceId,
        ids: [subscriberId],
        status: newStatus,
      });
      toast.success(
        `Subscriber ${newStatus === "active" ? "activated" : "suspended"}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update status",
      );
    }
  };

  const handleDelete = async () => {
    if (!subscriberId || !workspaceId) return;
    try {
      await removeSub({ workspaceId, id: subscriberId });
      toast.success("Subscriber deleted");
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete subscriber",
      );
    }
  };

  return (
    <>
      <Sheet open={!!subscriberId} onOpenChange={(v) => !v && onClose()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg bg-card border-border overflow-y-auto"
        >
          <SheetHeader className="pb-4 border-b border-border">
            <SheetTitle className="text-foreground text-base">
              Subscriber Details
            </SheetTitle>
          </SheetHeader>

          {sub === undefined ? (
            <div className="space-y-4 pt-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sub === null ? (
            <p className="text-muted-foreground text-sm pt-6 text-center">
              Subscriber not found.
            </p>
          ) : (
            <div className="pt-4 space-y-5">
              {/* Header card */}
              <div className="rounded-xl border border-border bg-background/50 p-4 flex items-start gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-lg font-bold text-primary">
                    {sub.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground text-base truncate">
                    {sub.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge
                      className={`text-[10px] px-2 py-0.5 border ${STATUS_STYLES[sub.status]}`}
                    >
                      {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                    </Badge>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <WifiSignalIcon
                        status={sub.isOnline ? "online" : "offline"}
                        className="size-3"
                      />
                      {sub.isOnline ? "Online" : "Offline"}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase font-mono bg-muted/30 px-1.5 py-0.5 rounded">
                      {sub.connectionType}
                    </span>
                  </div>
                </div>
              </div>

              {/* Info rows */}
              <div className="space-y-2">
                {[
                  { icon: Phone, label: "Phone", value: sub.phone },
                  { icon: Mail, label: "Email", value: sub.email ?? "—" },
                  { icon: MapPin, label: "Address", value: sub.address ?? "—" },
                  {
                    icon: Server,
                    label: "IP Address",
                    value: sub.ipAddress ?? "—",
                  },
                  {
                    icon: KeyRound,
                    label: "Service Username",
                    value:
                      sub.connectionType === "pppoe"
                        ? (sub.pppoeUsername ?? "—")
                        : sub.connectionType === "hotspot"
                          ? (sub.hotspotUsername ?? "—")
                          : "—",
                    mono: true,
                  },
                  {
                    icon: Server,
                    label: "MAC Address",
                    value: sub.macAddress ?? "—",
                    mono: true,
                  },
                  {
                    icon: Tag,
                    label: "Package",
                    value: sub.package
                      ? `${sub.package.name} (${sub.package.speed})`
                      : "—",
                  },
                  {
                    icon: CreditCard,
                    label: "Monthly Fee",
                    value: `Ksh ${sub.monthlyFee.toLocaleString()}`,
                  },
                  {
                    icon: CreditCard,
                    label: "Balance",
                    value: `Ksh ${sub.balance.toLocaleString()}`,
                    valueClass:
                      sub.balance < 0
                        ? "text-red-400"
                        : sub.balance > 0
                          ? "text-green-400"
                          : "text-foreground",
                  },
                  {
                    icon: FileText,
                    label: "Joined",
                    value: (() => {
                      try {
                        return format(new Date(sub.createdAt), "dd MMM yyyy");
                      } catch {
                        return sub.createdAt;
                      }
                    })(),
                  },
                ].map(({ icon: Icon, label, value, mono, valueClass }) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-background/40 border border-border/50"
                  >
                    <Icon
                      size={13}
                      className="text-muted-foreground shrink-0"
                    />
                    <span className="text-xs text-muted-foreground w-24 shrink-0">
                      {label}
                    </span>
                    <span
                      className={`text-xs text-right flex-1 truncate ${valueClass ?? "text-foreground"} ${mono ? "font-mono" : ""}`}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Notes */}
              {sub.notes && (
                <div className="rounded-lg border border-border/50 bg-background/40 p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                    Notes
                  </p>
                  <p className="text-xs text-foreground">{sub.notes}</p>
                </div>
              )}

              {/* Recent invoices */}
              {sub.invoices.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">
                    Recent Invoices
                  </p>
                  <div className="space-y-1.5">
                    {sub.invoices.map((inv) => (
                      <div
                        key={inv._id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-background/40 border border-border/50"
                      >
                        <div>
                          <p className="text-xs text-foreground font-medium">
                            {inv.invoiceNumber}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {inv.dueDate}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-foreground">
                            Ksh {inv.amount.toLocaleString()}
                          </p>
                          <Badge
                            className={`text-[9px] px-1.5 ${
                              inv.status === "paid"
                                ? "bg-green-400/10 text-green-400 border-green-400/30"
                                : inv.status === "overdue"
                                  ? "bg-red-400/10 text-red-400 border-red-400/30"
                                  : "bg-amber-400/10 text-amber-400 border-amber-400/30"
                            } border`}
                          >
                            {inv.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="pt-2 border-t border-border grid grid-cols-2 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="border border-border hover:border-primary/50 hover:text-primary text-muted-foreground"
                  onClick={() => subscriberId && onEdit(subscriberId)}
                >
                  <Edit size={13} className="mr-1.5" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`border ${
                    sub.status === "suspended"
                      ? "border-green-400/30 text-green-400 hover:bg-green-400/10"
                      : "border-amber-400/30 text-amber-400 hover:bg-amber-400/10"
                  }`}
                  onClick={handleToggleSuspend}
                >
                  {sub.status === "suspended" ? (
                    <>
                      <ShieldCheck size={13} className="mr-1.5" /> Activate
                    </>
                  ) : (
                    <>
                      <ShieldBan size={13} className="mr-1.5" /> Suspend
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="col-span-2 border border-red-400/30 text-red-400 hover:bg-red-400/10"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={13} className="mr-1.5" /> Delete Subscriber
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              Delete Subscriber?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This action cannot be undone. All data related to this subscriber
              will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-border text-foreground hover:bg-muted/20">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
