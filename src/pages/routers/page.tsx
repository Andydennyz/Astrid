import { useState } from "react";
import { useAction, useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import { Authenticated, Unauthenticated } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty.tsx";
import { toast } from "sonner";
import {
  Router as RouterIcon,
  Plus,
  MoreVertical,
  Trash2,
  RotateCw,
  Copy,
  MapPin,
  Cpu,
  ShieldCheck,
  Activity,
  Signal,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import RouterEnrollment from "./_components/router-enrollment.tsx";
import RouterManagementSetup from "./_components/router-management-setup.tsx";
import RouterNetworkAddressDialog from "./_components/router-network-address-dialog.tsx";
import RouterGatewayCredentials from "./_components/router-gateway-credentials.tsx";
import RouterFeatureBoundary from "./_components/router-feature-boundary.tsx";
import { WifiStatus } from "@/components/ui/wifi-status.tsx";

type PublicRouter = Omit<
  Doc<"routers">,
  "privateKey" | "presharedKey" | "radiusSecret" | "radiusSecretHash"
>;

function StatusBadge({ status }: { status: Doc<"routers">["status"] }) {
  return <WifiStatus status={status} />;
}

function RouterCard({
  router,
  onDelete,
}: {
  router: PublicRouter;
  onDelete: (id: Id<"routers">) => void;
}) {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [rotationSecret, setRotationSecret] = useState<string | null>(null);
  const [confirmRotation, setConfirmRotation] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const rotateRadiusSecret = useAction(
    api.routerEnrollments.rotateRadiusSecret,
  );
  const stats = useQuery(
    api.routers.getStats,
    workspaceId ? { workspaceId, routerId: router._id } : "skip",
  );

  const handleRotateRadiusSecret = async () => {
    if (!workspaceId || isRotating) return;
    setConfirmRotation(false);
    setIsRotating(true);
    try {
      const { radiusSecret } = await rotateRadiusSecret({
        workspaceId,
        routerId: router._id,
      });
      setRotationSecret(radiusSecret);
      toast.success("RADIUS secret rotated");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Could not rotate the RADIUS secret: ${error.message}`
          : "Could not rotate the RADIUS secret",
      );
    } finally {
      setIsRotating(false);
    }
  };

  const handleCopyRotationSecret = async () => {
    if (!rotationSecret) return;
    try {
      await navigator.clipboard.writeText(rotationSecret);
      toast.success("New RADIUS secret copied");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Could not copy the new RADIUS secret: ${error.message}`
          : "Could not copy the new RADIUS secret",
      );
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  return (
    <Card className="border-border/60 hover:border-primary/30 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <RouterIcon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{router.name}</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {router.nasIdentifier}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge
              status={
                router.status === "unknown" && (stats?.activeSessions ?? 0) > 0
                  ? "online"
                  : router.status
              }
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 cursor-pointer"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={isRotating}
                  onClick={() => setConfirmRotation(true)}
                  className="cursor-pointer"
                >
                  <RotateCw className="w-4 h-4 mr-2" /> Rotate RADIUS Secret
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(router._id)}
                  className="text-destructive cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete Router
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Details */}
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          {router.model && (
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 shrink-0" />
              <span>{router.model}</span>
            </div>
          )}
          {router.location && (
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{router.location}</span>
            </div>
          )}
          {router.ipAddress && (
            <div className="flex items-center gap-1.5">
              <Signal className="w-3.5 h-3.5 shrink-0" />
              <span>{router.ipAddress}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span className="font-mono">
              {router.tunnelIp ?? "Tunnel IP not set"}
            </span>
          </div>
        </div>

        <RouterNetworkAddressDialog router={router} />

        <RouterFeatureBoundary feature="Router management setup">
          <RouterManagementSetup router={router} />
        </RouterFeatureBoundary>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <StatTile
            label="Active Sessions"
            value={stats ? String(stats.activeSessions) : "—"}
            icon={<Activity className="w-3 h-3" />}
          />
          <StatTile
            label="↓ Download"
            value={stats ? formatBytes(stats.totalDownloadBytes) : "—"}
            icon={<ArrowDownToLine className="w-3.5 h-3.5 text-cyan-400" />}
            title="Downloaded data in recent RADIUS session records; not live throughput"
            valueClassName="text-cyan-400"
          />
          <StatTile
            label="↑ Upload"
            value={stats ? formatBytes(stats.totalUploadBytes) : "—"}
            icon={<ArrowUpFromLine className="w-3.5 h-3.5 text-violet-400" />}
            title="Uploaded data in recent RADIUS session records; not live throughput"
            valueClassName="text-violet-400"
          />
        </div>

        {router.lastSeen && (
          <p className="text-[10px] text-muted-foreground">
            Last seen: {new Date(router.lastSeen).toLocaleString()}
          </p>
        )}
      </CardContent>
      <AlertDialog open={confirmRotation} onOpenChange={setConfirmRotation}>
        <AlertDialogContent
          className="border-border bg-card"
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate RADIUS secret?</AlertDialogTitle>
            <AlertDialogDescription>
              Rotation immediately invalidates the current shared secret. New
              PPPoE/Hotspot authentication and RADIUS accounting can fail until
              both the CHR PPP RADIUS entry and Ubuntu FreeRADIUS client
              configuration are updated. The new secret will be shown once; save
              it securely. Continue only if both systems are ready to update.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRotating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRotating}
              onClick={(event) => {
                event.preventDefault();
                void handleRotateRadiusSecret();
              }}
            >
              {isRotating ? "Rotating..." : "Rotate secret"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={rotationSecret !== null}
        onOpenChange={(open) => {
          if (!open) setRotationSecret(null);
        }}
      >
        <DialogContent
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>New RADIUS secret for {router.name}</DialogTitle>
            <DialogDescription>
              This secret is shown only once. The previous secret is already
              invalid. Update both the CHR PPP RADIUS client and the Ubuntu
              FreeRADIUS client before the next authentication or accounting
              request.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              aria-label="One-time RADIUS secret"
              autoComplete="off"
              className="font-mono"
              readOnly
              value={rotationSecret ?? ""}
            />
            <Button onClick={() => void handleCopyRotationSecret()}>
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function StatTile({
  label,
  value,
  icon,
  title,
  valueClassName,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  title?: string;
  valueClassName?: string;
}) {
  return (
    <div
      className="rounded-md bg-muted/40 border border-border/40 p-2 text-center"
      title={title}
    >
      <div className="flex items-center justify-center gap-1 mb-0.5">
        {icon}
        <span className="text-[9px] uppercase tracking-wide">{label}</span>
      </div>
      <p
        className={`text-sm font-semibold ${valueClassName ?? "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

function RoutersPageInner({ onAddRouter }: { onAddRouter: () => void }) {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const routers = useQuery(
    api.routers.list,
    workspaceId ? { workspaceId } : "skip",
  );
  const removeRouter = useMutation(api.routers.remove);
  const handleDelete = async (id: Id<"routers">) => {
    if (!workspaceId) return;
    if (
      !confirm("Delete this router? This will also remove its session history.")
    )
      return;
    try {
      await removeRouter({ workspaceId, id });
      toast.success("Router deleted");
    } catch {
      toast.error("Failed to delete router");
    }
  };

  if (routers === undefined) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-52 w-full" />
        ))}
      </div>
    );
  }

  return (
    <>
      {routers.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <RouterIcon />
            </EmptyMedia>
            <EmptyTitle>No routers yet</EmptyTitle>
            <EmptyDescription>
              Start a secure enrollment to register a RouterOS-generated public
              key and prepare matching RouterOS and FreeRADIUS client
              configuration.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={onAddRouter}>
              <Plus className="w-4 h-4 mr-2" /> Start Enrollment
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {routers.map((router) => (
            <RouterCard
              key={router._id}
              router={router}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </>
  );
}

export default function RoutersPage() {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <RouterIcon className="w-6 h-6 text-primary" />
            Router Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Securely enroll MikroTik routers and generate matching manual RADIUS
            configuration. The Ubuntu gateway worker, automated WireGuard
            provisioning, and live integration verification remain outstanding.
          </p>
        </div>
        <Authenticated>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Start Enrollment
          </Button>
        </Authenticated>
      </div>

      {/* Info banner */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm space-y-1">
        <p className="font-semibold text-foreground">Architecture Overview</p>
        <div className="grid sm:grid-cols-3 gap-3 mt-2 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-primary font-bold text-[10px]">1</span>
            </div>
            <span>
              <strong className="text-foreground">WireGuard</strong> — The lab
              tunnel is verified; router peer and address provisioning remains a
              separate operator-applied step.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-primary font-bold text-[10px]">2</span>
            </div>
            <span>
              <strong className="text-foreground">FreeRADIUS</strong> — RouterOS
              and FreeRADIUS client snippets are generated at enrollment; server
              configuration, service setup, and CHR connectivity still need
              verification.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-primary font-bold text-[10px]">3</span>
            </div>
            <span>
              <strong className="text-foreground">Subscribers</strong> — PPPoE
              and Hotspot credentials are encrypted server-side and checked by
              the app-side RADIUS flow.
            </span>
          </div>
        </div>
      </div>

      <Unauthenticated>
        <div className="flex items-center justify-center py-12">
          <SignInButton />
        </div>
      </Unauthenticated>

      <Authenticated>
        <div className="space-y-6">
          <RouterFeatureBoundary feature="Ubuntu gateway access">
            <RouterGatewayCredentials />
          </RouterFeatureBoundary>
          <RoutersPageInner onAddRouter={() => setAddOpen(true)} />
          <RouterEnrollment open={addOpen} onOpenChange={setAddOpen} />
        </div>
      </Authenticated>
    </div>
  );
}
