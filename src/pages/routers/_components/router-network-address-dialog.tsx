import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { toast } from "sonner";

type RouterAddress = Pick<Doc<"routers">, "_id" | "name" | "tunnelIp">;

function isValidTunnelIp(value: string) {
  const [address, prefix, ...extra] = value.split("/");
  const octets = address.split(".");
  return (
    extra.length === 0 &&
    octets.length === 4 &&
    octets.every(
      (octet) =>
        /^\d{1,3}$/.test(octet) && Number(octet) >= 0 && Number(octet) <= 255,
    ) &&
    (prefix === undefined || (/^\d{1,2}$/.test(prefix) && Number(prefix) <= 32))
  );
}

export default function RouterNetworkAddressDialog({
  router,
}: {
  router: RouterAddress;
}) {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const updateRouter = useMutation(api.routers.update);
  const [open, setOpen] = useState(false);
  const [tunnelIp, setTunnelIp] = useState(router.tunnelIp ?? "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const value = tunnelIp.trim();
    if (!workspaceId || isSaving) return;
    if (!isValidTunnelIp(value)) {
      toast.error(
        "Enter a valid IPv4 tunnel address, optionally with a CIDR prefix",
      );
      return;
    }

    setIsSaving(true);
    try {
      await updateRouter({
        workspaceId,
        id: router._id,
        tunnelIp: value,
      });
      toast.success("Router tunnel IP updated");
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Could not update the router tunnel IP: ${error.message}`
          : "Could not update the router tunnel IP",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setTunnelIp(router.tunnelIp ?? "");
      }}
    >
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {router.tunnelIp ? "Edit tunnel IP" : "Set tunnel IP"}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Router tunnel address</DialogTitle>
          <DialogDescription>
            Set the WireGuard address assigned to {router.name}. FreeRADIUS
            includes the NAS-IP-Address in authorization requests, and Astrid
            checks it against this registered tunnel IP.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor={`router-tunnel-ip-${router._id}`} className="text-sm">
            WireGuard tunnel IP
          </label>
          <Input
            id={`router-tunnel-ip-${router._id}`}
            autoComplete="off"
            placeholder="10.77.0.2/32"
            value={tunnelIp}
            onChange={(event) => setTunnelIp(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Enter the router&apos;s actual WireGuard address, not the subscriber
            network address.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={isSaving}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button disabled={isSaving} onClick={() => void handleSave()}>
            {isSaving ? "Saving..." : "Save tunnel IP"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
