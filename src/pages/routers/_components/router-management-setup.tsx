import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Check, Copy, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import type { Doc, Id } from "@/convex/_generated/dataModel.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { buildRouterManagementScript } from "./router-management-script.ts";

type RouterManagementSetupProps = {
  router: Pick<Doc<"routers">, "_id" | "name" | "tunnelIp">;
};

function randomHex(byteLength: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(byteLength)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export default function RouterManagementSetup({ router }: RouterManagementSetupProps) {
  const { selectedWorkspaceId: workspaceId, memberships } = useWorkspace();
  const membership = memberships.find((item) => item.workspaceId === workspaceId);
  const canManage =
    membership?.role === "owner" ||
    membership?.role === "admin" ||
    membership?.role === "network";
  const setups = useQuery(
    api.routers.listManagementSetups,
    workspaceId && canManage ? { workspaceId, routerId: router._id } : "skip",
  );
  const gatewayCredential = useQuery(
    api.routerGateway.getCredentialStatus,
    workspaceId && canManage ? { workspaceId } : "skip",
  );
  const operations = useQuery(
    api.routerGateway.listOperations,
    workspaceId && canManage ? { workspaceId, routerId: router._id } : "skip",
  );
  const recordSetup = useMutation(api.routers.recordManagementSetup);
  const markApplied = useMutation(api.routers.markManagementSetupApplied);
  const enqueueVerification = useMutation(api.routerGateway.enqueueManagementVerification);
  const [open, setOpen] = useState(false);
  const [managementAddress, setManagementAddress] = useState(
    router.tunnelIp?.split("/")[0] ?? "10.77.0.2",
  );
  const [gatewaySourceAddress, setGatewaySourceAddress] = useState("10.77.0.1");
  const [certificateName, setCertificateName] = useState("astrid-api-ssl");
  const [script, setScript] = useState<string | null>(null);
  const [scriptPassword, setScriptPassword] = useState<string | null>(null);
  const [apiUsername, setApiUsername] = useState<string | null>(null);
  const [setupId, setSetupId] = useState<Id<"router_management_setups"> | null>(null);
  const [queueingSetupId, setQueueingSetupId] = useState<Id<"router_management_setups"> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setScript(null);
      setScriptPassword(null);
      setApiUsername(null);
      setSetupId(null);
    }
  };

  const prepare = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId) return;
    setSubmitting(true);
    try {
      const username = `astrid-api-${randomHex(6)}`;
      const password = randomHex(32);
      const generatedScript = buildRouterManagementScript({
        managementAddress: managementAddress.trim(),
        gatewaySourceAddress: gatewaySourceAddress.trim(),
        apiUsername: username,
        apiPassword: password,
        certificateName: certificateName.trim(),
      });
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(generatedScript),
      );
      const scriptSha256 = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const createdSetupId = await recordSetup({
        workspaceId,
        routerId: router._id,
        managementAddress: managementAddress.trim(),
        gatewaySourceAddress: gatewaySourceAddress.trim(),
        apiUsername: username,
        certificateName: certificateName.trim(),
        scriptSha256,
      });
      setScript(generatedScript);
      setScriptPassword(password);
      setApiUsername(username);
      setSetupId(createdSetupId);
      toast.success("One-time RouterOS management script prepared.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not prepare the management script.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const copyScript = async () => {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script);
      toast.success("Management script copied.");
    } catch {
      toast.error("Could not copy the script. Select and copy it manually.");
    }
  };

  const applied = async (id: Id<"router_management_setups">) => {
    if (!workspaceId) return;
    try {
      await markApplied({ workspaceId, setupId: id });
      toast.success("Recorded as operator-applied; gateway connectivity is not verified.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update the setup status.",
      );
    }
  };

  const queueVerification = async (id: Id<"router_management_setups">) => {
    if (!workspaceId) return;
    setQueueingSetupId(id);
    try {
      await enqueueVerification({ workspaceId, routerId: router._id, setupId: id });
      toast.success("Gateway verification queued.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue gateway verification.");
    } finally {
      setQueueingSetupId(null);
    }
  };

  if (!canManage || !workspaceId) return null;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="mr-2 size-4" />
          Configure API-SSL
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Router management gateway</DialogTitle>
          <DialogDescription>
            Prepare a scoped RouterOS v7 API-SSL account for {router.name}. No credentials or
            script contents are stored in Convex.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <ShieldCheck className="size-4" />
          <AlertTitle>Certificate and network prerequisites</AlertTitle>
          <AlertDescription>
            Install a trusted server certificate on the router with a SAN matching its management
            IP. The gateway must trust its issuing CA and validate the certificate name. This
            script does not alter firewall rules; preserve a local management path and restrict
            the service at the firewall as well.
          </AlertDescription>
        </Alert>

        {script ? (
          <div className="space-y-4">
            <Alert>
              <AlertTitle>One-time API password</AlertTitle>
              <AlertDescription>
                Save the router ID, API username, and password in the Ubuntu gateway’s protected
                secret store before closing. The password is never recoverable from this app.
              </AlertDescription>
            </Alert>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Router ID</p>
                <p className="break-all font-mono text-sm">{router._id}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">API username</p>
                <p className="break-all font-mono text-sm">{apiUsername}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">One-time password</p>
                <p className="break-all font-mono text-sm">{scriptPassword}</p>
              </div>
            </div>
            <Textarea
              aria-label="RouterOS API-SSL setup script"
              className="min-h-72 font-mono text-xs"
              readOnly
              value={script}
            />
            <Button type="button" className="w-full" onClick={() => void copyScript()}>
              <Copy className="mr-2 size-4" />
              Copy setup script
            </Button>
            {setupId && (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => void applied(setupId)}
              >
                <Check className="mr-2 size-4" />
                Mark as applied on router
              </Button>
            )}
          </div>
        ) : (
          <form onSubmit={(event) => void prepare(event)} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                Router management IPv4
                <Input
                  required
                  value={managementAddress}
                  onChange={(event) => setManagementAddress(event.target.value)}
                  placeholder="10.77.0.2"
                  inputMode="decimal"
                />
              </label>
              <label className="space-y-1 text-sm">
                Gateway source IPv4
                <Input
                  required
                  value={gatewaySourceAddress}
                  onChange={(event) => setGatewaySourceAddress(event.target.value)}
                  placeholder="10.77.0.1"
                  inputMode="decimal"
                />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                Installed RouterOS certificate name
                <Input
                  required
                  value={certificateName}
                  onChange={(event) => setCertificateName(event.target.value)}
                  pattern="[A-Za-z0-9_.-]{1,64}"
                  title="Use 1-64 letters, digits, dots, dashes, or underscores"
                />
              </label>
            </div>
            <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
              This prepares only RouterOS v7 API-SSL on TCP 8729. The gateway and API user are
              restricted to the selected source IP; the unencrypted API service is disabled.
              The API account has RouterOS <code>api,read,write</code> policies. Its TLS certificate
              must already be trusted and match the router management IP.
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <LoaderCircle className="mr-2 size-4 animate-spin" />}
              Prepare one-time setup script
            </Button>
          </form>
        )}

        {setups && setups.length > 0 && (
          <section className="space-y-2 border-t border-border pt-4">
            <h3 className="text-sm font-medium">Recent setup records</h3>
            {setups.map((setup) => (
              <div
                key={setup._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 p-3 text-xs"
              >
                <div>
                  <p className="font-medium">
                    {setup.apiUsername} · {setup.status === "prepared" ? "Script prepared" : "Operator applied"}
                  </p>
                  <p className="text-muted-foreground">
                    {setup.gatewaySourceAddress} → {setup.managementAddress}:{setup.apiPort} ·{" "}
                    {new Date(setup.createdAt).toLocaleString()}
                  </p>
                </div>
                {setup.status === "prepared" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void applied(setup._id)}
                  >
                    Mark applied
                  </Button>
                )}
                {setup.status === "operator_applied" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !gatewayCredential?.configured ||
                      operations === undefined ||
                      queueingSetupId === setup._id ||
                      operations.some((operation) =>
                        operation.setupId === setup._id &&
                        (operation.status === "pending" || operation.status === "leased"),
                      )
                    }
                    onClick={() => void queueVerification(setup._id)}
                  >
                    {queueingSetupId === setup._id ? "Queueing…" : "Verify via gateway"}
                  </Button>
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              “Operator applied” is a manual record only; it does not mean the gateway has
              connected or validated the certificate.
            </p>
          </section>
        )}
        {operations && operations.length > 0 && (
          <section className="space-y-2 border-t border-border pt-4">
            <h3 className="text-sm font-medium">Gateway operations</h3>
            {operations.map((operation) => (
              <div key={operation._id} className="rounded-md bg-muted/40 p-3 text-xs">
                <p className="font-medium">
                  API-SSL verification · {operation.status.replace("_", " ")}
                </p>
                <p className="text-muted-foreground">
                  Attempt {operation.attemptCount} · queued {new Date(operation.createdAt).toLocaleString()}
                </p>
                {operation.detail && (
                  <p className="mt-1 break-words text-muted-foreground">{operation.detail}</p>
                )}
              </div>
            ))}
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
