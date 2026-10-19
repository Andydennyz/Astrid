import { useEffect, useState, type FormEvent } from "react";
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
  return Array.from(
    crypto.getRandomValues(new Uint8Array(byteLength)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export default function RouterManagementSetup({
  router,
}: RouterManagementSetupProps) {
  const { selectedWorkspaceId: workspaceId, memberships } = useWorkspace();
  const membership = memberships.find(
    (item) => item.workspaceId === workspaceId,
  );
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
  const enqueueVerification = useMutation(
    api.routerGateway.enqueueManagementVerification,
  );
  const [open, setOpen] = useState(false);
  const [managementAddress, setManagementAddress] = useState(
    router.tunnelIp?.split("/")[0] ?? "10.77.0.2",
  );
  const [gatewaySourceAddress, setGatewaySourceAddress] = useState("10.77.0.1");
  const [certificateName, setCertificateName] = useState("astrid-api-ssl");
  const [script, setScript] = useState<string | null>(null);
  const [scriptPassword, setScriptPassword] = useState<string | null>(null);
  const [apiUsername, setApiUsername] = useState<string | null>(null);
  const [setupId, setSetupId] = useState<Id<"router_management_setups"> | null>(
    null,
  );
  const [queueingSetupId, setQueueingSetupId] =
    useState<Id<"router_management_setups"> | null>(null);
  const [verificationOperationId, setVerificationOperationId] =
    useState<Id<"router_gateway_operations"> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!verificationOperationId || !operations) return;
    const operation = operations.find(
      (candidate) => candidate._id === verificationOperationId,
    );
    if (operation?.status === "succeeded") {
      toast.success(
        "API-SSL setup verified successfully by the Ubuntu gateway.",
      );
      setVerificationOperationId(null);
    } else if (operation?.status === "failed") {
      toast.error(
        operation.detail ??
          "API-SSL verification failed. Review the gateway operation details.",
      );
      setVerificationOperationId(null);
    }
  }, [operations, verificationOperationId]);

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
        error instanceof Error
          ? error.message
          : "Could not prepare the management script.",
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

  const verifySetup = async (
    id: Id<"router_management_setups">,
    alreadyApplied: boolean,
  ) => {
    if (!workspaceId || !gatewayCredential?.configured) return;
    setQueueingSetupId(id);
    try {
      if (!alreadyApplied) {
        await markApplied({ workspaceId, setupId: id });
      }
      const operationId = await enqueueVerification({
        workspaceId,
        routerId: router._id,
        setupId: id,
      });
      setVerificationOperationId(operationId);
      toast.message(
        "API-SSL verification queued. The app will report the gateway result here.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not queue gateway verification.",
      );
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
            Prepare a scoped RouterOS v7 API-SSL account for {router.name}. No
            credentials or script contents are stored in Convex.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <ShieldCheck className="size-4" />
          <AlertTitle>What this setup configures</AlertTitle>
          <AlertDescription>
            The script safely creates or reuses the Astrid CA and a server
            certificate whose IP SAN matches the router address. It configures a
            gateway-restricted API user, disables plain API, and enables
            API-SSL. It does not change firewall rules. For automatic
            verification, the Ubuntu gateway agent must be running with this API
            account and the Astrid CA certificate trusted.
          </AlertDescription>
        </Alert>

        {script ? (
          <div className="space-y-4">
            <Alert>
              <AlertTitle>One-time API password</AlertTitle>
              <AlertDescription>
                Save the router ID, API username, and password in the Ubuntu
                gateway’s protected secret configuration. Export only the{" "}
                <code>astrid-api-ca</code> certificate (never its private key)
                and add it to the gateway CA bundle. The app cannot recover this
                password after you close this dialog.
              </AlertDescription>
            </Alert>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Router ID
                </p>
                <p className="break-all font-mono text-sm">{router._id}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  API username
                </p>
                <p className="break-all font-mono text-sm">{apiUsername}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  One-time password
                </p>
                <p className="break-all font-mono text-sm">{scriptPassword}</p>
              </div>
            </div>
            <Textarea
              aria-label="RouterOS API-SSL setup script"
              className="min-h-72 font-mono text-xs"
              readOnly
              value={script}
            />
            <Button
              type="button"
              className="w-full"
              onClick={() => void copyScript()}
            >
              <Copy className="mr-2 size-4" />
              Copy setup script
            </Button>
            {setupId && (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={
                  !gatewayCredential?.configured || queueingSetupId === setupId
                }
                onClick={() => void verifySetup(setupId, false)}
              >
                {queueingSetupId === setupId ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                ) : (
                  <Check className="mr-2 size-4" />
                )}
                I ran it — verify API-SSL
              </Button>
            )}
            {!gatewayCredential?.configured && (
              <p className="text-xs text-amber-300">
                Configure the workspace gateway credential and run the Ubuntu
                gateway agent to enable automatic verification.
              </p>
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
                  onChange={(event) =>
                    setGatewaySourceAddress(event.target.value)
                  }
                  placeholder="10.77.0.1"
                  inputMode="decimal"
                />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                API-SSL certificate name
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
              This creates or reuses the Astrid CA and router certificate,
              generates the scoped API user, disables plain API, and configures
              API-SSL on port 8729. Run the complete copied script in the main
              CHR terminal. The script reports success only after verifying its
              settings. The Ubuntu gateway must trust the exported Astrid CA PEM
              and have the generated API username/password in its protected
              local configuration.
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && (
                <LoaderCircle className="mr-2 size-4 animate-spin" />
              )}
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
                    {setup.apiUsername} ·{" "}
                    {setup.status === "prepared"
                      ? "Script prepared"
                      : "Operator applied"}
                  </p>
                  <p className="text-muted-foreground">
                    {setup.gatewaySourceAddress} → {setup.managementAddress}:
                    {setup.apiPort} ·{" "}
                    {new Date(setup.createdAt).toLocaleString()}
                  </p>
                </div>
                {setup.status === "prepared" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !gatewayCredential?.configured ||
                      operations === undefined ||
                      queueingSetupId === setup._id
                    }
                    onClick={() => void verifySetup(setup._id, false)}
                  >
                    {queueingSetupId === setup._id
                      ? "Queueing…"
                      : "I ran it — verify"}
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
                      operations.some(
                        (operation) =>
                          operation.setupId === setup._id &&
                          operation.operationType === "verify_management" &&
                          (operation.status === "pending" ||
                            operation.status === "leased"),
                      )
                    }
                    onClick={() => void verifySetup(setup._id, true)}
                  >
                    {queueingSetupId === setup._id
                      ? "Queueing…"
                      : "Verify API-SSL"}
                  </Button>
                )}
                {operations?.some(
                  (operation) =>
                    operation.setupId === setup._id &&
                    operation.operationType === "verify_management" &&
                    operation.status === "succeeded",
                ) && (
                  <Alert className="w-full border-green-500/40">
                    <Check className="size-4 text-green-400" />
                    <AlertTitle>API-SSL verified</AlertTitle>
                    <AlertDescription>
                      The Ubuntu gateway authenticated over TLS and confirmed
                      TLS 1.2, the certificate, port, API user, gateway-only
                      access restrictions, and that plain API is disabled.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              “Operator applied” records that you ran the script. A success
              alert appears only after the Ubuntu gateway connects and verifies
              the live RouterOS settings.
            </p>
          </section>
        )}
        {operations && operations.length > 0 && (
          <section className="space-y-2 border-t border-border pt-4">
            <h3 className="text-sm font-medium">Gateway operations</h3>
            {operations.map((operation) => (
              <div
                key={operation._id}
                className="rounded-md bg-muted/40 p-3 text-xs"
              >
                <p className="font-medium">
                  {operation.operationType === "verify_management"
                    ? "API-SSL verification"
                    : `PPPoE disconnect${operation.targetSessionId ? ` · ${operation.targetSessionId}` : ""}`}{" "}
                  · {operation.status.replace("_", " ")}
                </p>
                <p className="text-muted-foreground">
                  Attempt {operation.attemptCount} · queued{" "}
                  {new Date(operation.createdAt).toLocaleString()}
                </p>
                {operation.detail && (
                  <p className="mt-1 break-words text-muted-foreground">
                    {operation.detail}
                  </p>
                )}
              </div>
            ))}
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
