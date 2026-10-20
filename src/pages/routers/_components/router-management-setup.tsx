import { useEffect, useState, type FormEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api.js";
import type { Doc, Id } from "@/convex/_generated/dataModel.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import RouterGatewayCredentials from "./router-gateway-credentials.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { buildRouterManagementScript } from "./router-management-script.ts";
import gatewayInstaller from "../../../../gateway/install_ubuntu.sh?raw";
import gatewayUninstaller from "../../../../gateway/uninstall_ubuntu.sh?raw";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Copy,
  KeyRound,
  LoaderCircle,
  RotateCcw,
  Router as RouterIcon,
  Server,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";

type RouterManagementSetupProps = {
  router: Pick<Doc<"routers">, "_id" | "name" | "tunnelIp" | "serverTunnelIp">;
};

type SavedWizardDraft = {
  managementAddress: string;
  gatewaySourceAddress: string;
  certificateName: string;
};

const gatewayInstallCommand = `(
cat > "$HOME/astrid-gateway-install.sh" <<'ASTRID_GATEWAY_INSTALLER'
${gatewayInstaller}
ASTRID_GATEWAY_INSTALLER
bash "$HOME/astrid-gateway-install.sh"
install_status=$?
rm -f "$HOME/astrid-gateway-install.sh"
exit "$install_status"
)`;

const gatewayUninstallCommand = `(
cat > "$HOME/astrid-gateway-uninstall.sh" <<'ASTRID_GATEWAY_UNINSTALLER'
${gatewayUninstaller}
ASTRID_GATEWAY_UNINSTALLER
bash "$HOME/astrid-gateway-uninstall.sh"
uninstall_status=$?
rm -f "$HOME/astrid-gateway-uninstall.sh"
exit "$uninstall_status"
)`;

function loadSavedDraft(key: string): SavedWizardDraft | null {
  const saved = localStorage.getItem(key);
  if (!saved) return null;
  const parsed: unknown = JSON.parse(saved);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("managementAddress" in parsed) ||
    !("gatewaySourceAddress" in parsed) ||
    !("certificateName" in parsed) ||
    typeof parsed.managementAddress !== "string" ||
    typeof parsed.gatewaySourceAddress !== "string" ||
    typeof parsed.certificateName !== "string"
  ) {
    throw new Error("Saved API-SSL setup progress is not valid.");
  }
  return {
    managementAddress: parsed.managementAddress,
    gatewaySourceAddress: parsed.gatewaySourceAddress,
    certificateName: parsed.certificateName,
  };
}

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
  const wizardProgress = useQuery(
    api.routers.getManagementWizardProgress,
    workspaceId && canManage ? { workspaceId, routerId: router._id } : "skip",
  );
  const recordSetup = useMutation(api.routers.recordManagementSetup);
  const markApplied = useMutation(api.routers.markManagementSetupApplied);
  const saveWizardProgress = useMutation(
    api.routers.saveManagementWizardProgress,
  );
  const restartWizardStep = useMutation(
    api.routers.restartManagementWizardStep,
  );
  const enqueueVerification = useMutation(
    api.routerGateway.enqueueManagementVerification,
  );
  const configureRadius = useAction(api.routerGateway.configureRadius);
  const [open, setOpen] = useState(false);
  const [managementAddress, setManagementAddress] = useState(
    router.tunnelIp?.split("/")[0] ?? "10.77.0.2",
  );
  const [gatewaySourceAddress, setGatewaySourceAddress] = useState(
    router.serverTunnelIp?.split("/")[0] ?? "10.77.0.1",
  );
  const [certificateName, setCertificateName] = useState("astrid-api-ssl");
  const [activeStep, setActiveStep] = useState(0);
  const [gatewayReady, setGatewayReady] = useState(false);
  const [gatewayConfigSaved, setGatewayConfigSaved] = useState(false);
  const [loadedProgressKey, setLoadedProgressKey] = useState<string | null>(
    null,
  );
  const [loadedServerProgressKey, setLoadedServerProgressKey] = useState<
    string | null
  >(null);
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
  const [radiusSecret, setRadiusSecret] = useState("");
  const [radiusOperationId, setRadiusOperationId] =
    useState<Id<"router_gateway_operations"> | null>(null);
  const [configuringRadius, setConfiguringRadius] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const progressKey = workspaceId
    ? `astrid:router-api-ssl:${workspaceId}:${router._id}`
    : null;
  const convexSiteUrl =
    import.meta.env.VITE_CONVEX_SITE_URL ??
    "https://<your-deployment>.convex.site";
  const currentSetups = setups?.filter(
    (setup) =>
      !wizardProgress?.setupResetAt ||
      setup._id === wizardProgress.activeSetupId,
  );
  const activeSetup =
    (setupId
      ? currentSetups?.find((setup) => setup._id === setupId)
      : undefined) ?? currentSetups?.[0];
  const gatewayStepDone = Boolean(
    gatewayCredential?.configured && gatewayReady,
  );
  const routerStepDone = activeSetup?.status === "operator_applied";
  const gatewayConfigDone = gatewayConfigSaved;
  const verificationDone = Boolean(
    activeSetup &&
    operations?.some(
      (operation) =>
        operation.setupId === activeSetup._id &&
        operation.operationType === "verify_management" &&
        (!wizardProgress?.verificationResetAt ||
          operation.createdAt > wizardProgress.verificationResetAt) &&
        operation.status === "succeeded",
    ),
  );
  const stepDone = [
    gatewayStepDone,
    routerStepDone,
    gatewayConfigDone,
    verificationDone,
  ];
  const stepNames = [
    "Ubuntu gateway",
    "RouterOS API-SSL",
    "Certificate & credentials",
    "Verify connection",
  ];

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(
        `Could not copy ${label.toLowerCase()}. Select and copy it manually.`,
      );
    }
  };

  useEffect(() => {
    if (!progressKey) return;
    try {
      const draft = loadSavedDraft(progressKey);
      if (draft) {
        setManagementAddress(draft.managementAddress);
        setGatewaySourceAddress(draft.gatewaySourceAddress);
        setCertificateName(draft.certificateName);
      } else {
        setManagementAddress(router.tunnelIp?.split("/")[0] ?? "10.77.0.2");
        setGatewaySourceAddress(
          router.serverTunnelIp?.split("/")[0] ?? "10.77.0.1",
        );
        setCertificateName("astrid-api-ssl");
      }
      setLoadedProgressKey(progressKey);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not restore API-SSL setup progress.",
      );
      setLoadedProgressKey(progressKey);
    }
  }, [progressKey, router.serverTunnelIp, router.tunnelIp]);

  useEffect(() => {
    if (!progressKey || loadedProgressKey !== progressKey) return;
    try {
      const draft: SavedWizardDraft = {
        managementAddress,
        gatewaySourceAddress,
        certificateName,
      };
      localStorage.setItem(progressKey, JSON.stringify(draft));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Could not save API-SSL setup progress: ${error.message}`
          : "Could not save API-SSL setup progress.",
      );
    }
  }, [
    certificateName,
    gatewaySourceAddress,
    loadedProgressKey,
    managementAddress,
    progressKey,
  ]);

  useEffect(() => {
    if (!progressKey || wizardProgress === undefined) return;
    setActiveStep(wizardProgress?.activeStep ?? 0);
    setGatewayReady(wizardProgress?.gatewayReady ?? false);
    setGatewayConfigSaved(wizardProgress?.gatewayConfigSaved ?? false);
    setLoadedServerProgressKey(progressKey);
  }, [progressKey, wizardProgress]);

  useEffect(() => {
    if (
      !open ||
      !workspaceId ||
      !progressKey ||
      loadedServerProgressKey !== progressKey
    ) {
      return;
    }
    void saveWizardProgress({
      workspaceId,
      routerId: router._id,
      activeStep,
      gatewayReady,
      gatewayConfigSaved,
    }).catch((error: unknown) => {
      toast.error(
        error instanceof Error
          ? `Could not save API-SSL setup progress: ${error.message}`
          : "Could not save API-SSL setup progress.",
      );
    });
  }, [
    activeStep,
    gatewayConfigSaved,
    gatewayReady,
    loadedServerProgressKey,
    open,
    progressKey,
    router._id,
    saveWizardProgress,
    workspaceId,
  ]);

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

  useEffect(() => {
    if (!radiusOperationId || !operations) return;
    const operation = operations.find(
      (candidate) => candidate._id === radiusOperationId,
    );
    if (operation?.status === "succeeded") {
      toast.success("MikroTik PPPoE RADIUS configuration applied.");
      setRadiusOperationId(null);
    } else if (operation?.status === "failed") {
      toast.error(
        operation.detail ??
          "RADIUS configuration failed. Review the gateway operation details.",
      );
      setRadiusOperationId(null);
    }
  }, [operations, radiusOperationId]);

  const close = (next: boolean) => {
    setOpen(next);
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

  const applyRadiusConfiguration = async () => {
    if (!workspaceId || !activeSetup || configuringRadius) return;
    setConfiguringRadius(true);
    try {
      const operationId = await configureRadius({
        workspaceId,
        routerId: router._id,
        setupId: activeSetup._id,
        radiusSecret: radiusSecret.trim() || undefined,
      });
      setRadiusSecret("");
      setRadiusOperationId(operationId);
      toast.message(
        "RADIUS configuration queued. Keep the Ubuntu gateway online while it applies the settings.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not queue RouterOS RADIUS configuration.",
      );
    } finally {
      setConfiguringRadius(false);
    }
  };

  const markScriptApplied = async (id: Id<"router_management_setups">) => {
    if (!workspaceId) return;
    setQueueingSetupId(id);
    try {
      await markApplied({ workspaceId, setupId: id });
      setSetupId(id);
      setActiveStep(2);
      toast.success(
        "RouterOS setup marked complete. Continue with the Ubuntu certificate and credentials.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save the RouterOS setup step.",
      );
    } finally {
      setQueueingSetupId(null);
    }
  };

  const goToStep = (step: number) => {
    if (step === 0 || stepDone[step - 1]) setActiveStep(step);
  };

  const restartCurrentStep = async () => {
    if (!workspaceId) return;
    const stepName = stepNames[activeStep];
    const confirmed = window.confirm(
      `Restart Step ${activeStep + 1}: ${stepName}? Astrid will clear saved progress for this step and later steps. RouterOS setup records remain as history, but Astrid will no longer treat an earlier setup as current. This does not uninstall the gateway or undo settings already applied on Ubuntu or RouterOS.`,
    );
    if (!confirmed) return;

    try {
      await restartWizardStep({
        workspaceId,
        routerId: router._id,
        step: activeStep,
      });
      if (activeStep <= 1) {
        setManagementAddress(router.tunnelIp?.split("/")[0] ?? "10.77.0.2");
        setGatewaySourceAddress(
          router.serverTunnelIp?.split("/")[0] ?? "10.77.0.1",
        );
        setCertificateName("astrid-api-ssl");
        setScript(null);
        setScriptPassword(null);
        setApiUsername(null);
        setSetupId(null);
      }
      if (activeStep === 0) setGatewayReady(false);
      if (activeStep <= 2) setGatewayConfigSaved(false);
      setVerificationOperationId(null);
      toast.success(
        `Step ${activeStep + 1} restarted. Earlier steps remain complete.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not restart this API-SSL setup step.",
      );
    }
  };

  const gatewayConfig = JSON.stringify(
    {
      convex_site_url: convexSiteUrl,
      workspace_id: workspaceId,
      gateway_token: "PASTE_THE_ONE_TIME_GATEWAY_TOKEN_HERE",
      poll_interval_seconds: 3,
      request_timeout_seconds: 20,
      ca_bundle: "/etc/astrid-router-gateway/router-ca.pem",
      routers: {
        [router._id]: {
          username:
            apiUsername ?? activeSetup?.apiUsername ?? "GENERATED_API_USERNAME",
          password:
            scriptPassword ?? "PASTE_THE_ONE_TIME_ROUTER_API_PASSWORD_HERE",
          ca_bundle: "/etc/astrid-router-gateway/router-ca.pem",
        },
      },
    },
    null,
    2,
  );

  if (!canManage || !workspaceId) return null;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="mr-2 size-4" />
          Configure API-SSL
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] max-w-4xl overflow-y-auto overscroll-contain"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Secure API-SSL setup for {router.name}</DialogTitle>
          <DialogDescription>
            Follow the steps in order. Your progress and non-secret settings
            save automatically, so you can close this window and continue later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {stepNames.map((name, index) => {
              const done = stepDone[index];
              const canOpen = index === 0 || stepDone[index - 1];
              const StepIcon =
                index === 0
                  ? Server
                  : index === 1
                    ? RouterIcon
                    : index === 2
                      ? ShieldCheck
                      : CircleCheck;
              return (
                <button
                  key={name}
                  type="button"
                  disabled={!canOpen}
                  onClick={() => goToStep(index)}
                  className={`flex min-w-[9rem] flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    activeStep === index
                      ? "border-primary bg-primary/10 text-primary"
                      : done
                        ? "border-emerald-500/40 bg-emerald-500/5 text-foreground"
                        : "border-border text-muted-foreground"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {done ? (
                    <CircleCheck className="size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <StepIcon className="size-4 shrink-0" />
                  )}
                  <span>
                    <span className="block text-[10px] uppercase tracking-wide">
                      Step {index + 1}
                    </span>
                    <span className="font-medium">{name}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {stepDone.filter(Boolean).length} of {stepNames.length} steps
            complete · Progress is saved in this browser; credentials are not
            saved by the app.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={wizardProgress === undefined}
            onClick={() => void restartCurrentStep()}
          >
            <RotateCcw className="mr-2 size-4" />
            Restart Step {activeStep + 1}
          </Button>
          <p className="text-xs text-muted-foreground">
            Restart clears Astrid’s saved progress from this step onward. It
            does not undo changes already made directly on Ubuntu or RouterOS.
          </p>
        </div>

        {activeStep === 0 && (
          <section className="space-y-4">
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <Server className="size-4 text-primary" />
                Prepare the Ubuntu gateway
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                This gateway makes the encrypted connection to the router. Use
                the gateway’s WireGuard IP as its source address in the next
                step.
              </p>
            </div>
            <Alert>
              <ShieldCheck className="size-4" />
              <AlertTitle>Before you begin</AlertTitle>
              <AlertDescription>
                The router must run RouterOS v7 and have a reachable
                WireGuard/tunnel IP. You need administrator access to its CHR
                terminal, and the Ubuntu gateway must have its own reachable
                WireGuard IP. If the tunnel is not configured yet, complete the
                router network setup first.
              </AlertDescription>
            </Alert>
            <RouterGatewayCredentials />
            <Alert>
              <TerminalSquare className="size-4" />
              <AlertTitle>Install and start the Ubuntu gateway</AlertTitle>
              <AlertDescription>
                Copy the complete command below into the Ubuntu SSH terminal. It
                may ask for the Ubuntu account’s sudo password; this is not the
                one-time gateway credential or RouterOS password. It needs
                outbound HTTPS to GitHub and your Convex deployment. The
                installer uses existing Python 3 when available, avoiding apt
                and clock synchronization in that case. If Python is missing, it
                synchronizes the system clock before installing Python with apt.
                It downloads checksum-verified, pinned Astrid gateway files,
                installs the worker and protected service account, then on a
                first install prompts for the Convex URL and workspace ID shown
                below and the one-time gateway credential shown above. It writes
                the protected config, enables the service, and checks that it is
                running. A rerun preserves an existing gateway config. No
                project-file copy or manual config-file editing is required.
              </AlertDescription>
            </Alert>
            <Textarea
              aria-label="Ubuntu gateway installer command"
              className="min-h-72 font-mono text-xs"
              readOnly
              value={gatewayInstallCommand}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void copyText(gatewayInstallCommand, "Ubuntu gateway installer")
              }
            >
              <Copy className="mr-2 size-4" />
              Copy Ubuntu installer
            </Button>
            <section className="space-y-3 rounded-lg border border-destructive/40 p-4">
              <div>
                <h4 className="font-semibold text-destructive">
                  Separate action: uninstall the Ubuntu gateway
                </h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Do not run this as part of installation. Use this separate
                  command only when you intentionally want to remove Astrid’s
                  gateway service and its Ubuntu configuration, including stored
                  router passwords, the gateway token, and CA certificate. It
                  does not change the router or WireGuard. Before reinstalling,
                  create or rotate the one-time gateway credential in Astrid;
                  the removed token cannot be recovered. It asks for the Ubuntu
                  account’s sudo password, not the gateway token.
                </p>
              </div>
              <Textarea
                aria-label="Separate Ubuntu gateway uninstaller command"
                className="min-h-72 font-mono text-xs"
                readOnly
                value={gatewayUninstallCommand}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void copyText(
                    gatewayUninstallCommand,
                    "Separate Ubuntu gateway uninstaller",
                  )
                }
              >
                <Copy className="mr-2 size-4" />
                Copy separate uninstaller
              </Button>
            </section>
            <div className="grid gap-3 rounded-lg border border-border p-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Convex site URL</p>
                <code className="break-all">{convexSiteUrl}</code>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Workspace ID</p>
                <code className="break-all">{workspaceId}</code>
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={gatewayReady}
                disabled={!gatewayCredential?.configured}
                onChange={(event) => setGatewayReady(event.target.checked)}
              />
              <span>
                I ran the installer and it confirmed the Ubuntu gateway service
                is active. I saved the one-time token securely.
              </span>
            </label>
            <Button
              type="button"
              className="w-full"
              disabled={!gatewayCredential?.configured || !gatewayReady}
              onClick={() => setActiveStep(1)}
            >
              Continue to the router script
              <ChevronRight className="ml-2 size-4" />
            </Button>
            {!gatewayCredential?.configured && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Create the workspace gateway credential above first. The
                installer prompts for its one-time value; it cannot be recovered
                after the alert is closed.
              </p>
            )}
          </section>
        )}

        {activeStep === 1 && (
          <section className="space-y-4">
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <RouterIcon className="size-4 text-primary" />
                Create the RouterOS certificate and API-SSL account
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the router’s reachable tunnel IP and the Ubuntu gateway’s
                tunnel IP. The generated script is scoped to this gateway only.
              </p>
            </div>
            <Alert>
              <ShieldCheck className="size-4" />
              <AlertTitle>What the RouterOS script does</AlertTitle>
              <AlertDescription>
                It creates or reuses the Astrid CA and router certificate,
                creates a gateway-restricted API user, disables unencrypted API,
                and enables API-SSL on TCP 8729. It does not alter firewall
                rules. Run it in the main terminal on the MikroTik CHR and wait
                for <code>ASTRID API-SSL SETUP SUCCEEDED</code>.
              </AlertDescription>
            </Alert>
            {script ? (
              <div className="space-y-4">
                <Alert>
                  <AlertTitle>
                    Save these one-time router credentials now
                  </AlertTitle>
                  <AlertDescription>
                    The password and full script exist only in this open browser
                    session. The app stores neither. Keep this window open until
                    you have configured the Ubuntu gateway in Step 3.
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
                    <p className="break-all font-mono text-sm">
                      {scriptPassword}
                    </p>
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
                    disabled={queueingSetupId === setupId}
                    onClick={() => void markScriptApplied(setupId)}
                  >
                    {queueingSetupId === setupId ? (
                      <LoaderCircle className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 size-4" />
                    )}
                    I ran it successfully — continue
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {activeSetup?.status === "prepared" && (
                  <Alert>
                    <AlertTitle>A setup script was already prepared</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p>
                        The saved record is still here, but its one-time
                        password cannot be recovered. If you already ran this
                        script, mark it applied below. Otherwise create a fresh
                        script and use its new credentials.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={queueingSetupId === activeSetup._id}
                        onClick={() => void markScriptApplied(activeSetup._id)}
                      >
                        {queueingSetupId === activeSetup._id
                          ? "Saving…"
                          : "I already ran this script successfully"}
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
                <form
                  onSubmit={(event) => void prepare(event)}
                  className="space-y-4"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      Router management IPv4
                      <Input
                        required
                        value={managementAddress}
                        onChange={(event) =>
                          setManagementAddress(event.target.value)
                        }
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
                        onChange={(event) =>
                          setCertificateName(event.target.value)
                        }
                        pattern="[A-Za-z0-9_.-]{1,64}"
                        title="Use 1-64 letters, digits, dots, dashes, or underscores"
                      />
                    </label>
                  </div>
                  <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
                    This creates or reuses the Astrid CA and router certificate,
                    generates the scoped API user, disables plain API, and
                    configures API-SSL on port 8729. Run the complete copied
                    script in the main CHR terminal. The script reports success
                    only after verifying its settings. The Ubuntu gateway must
                    trust the exported Astrid CA PEM and have the generated API
                    username/password in its protected local configuration.
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={submitting}
                  >
                    {submitting && (
                      <LoaderCircle className="mr-2 size-4 animate-spin" />
                    )}
                    Prepare one-time setup script
                  </Button>
                </form>
              </div>
            )}
          </section>
        )}

        {activeStep === 2 && (
          <section className="space-y-4">
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <ShieldCheck className="size-4 text-primary" />
                Trust the certificate and add router credentials
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Export only the CA certificate from RouterOS, then install it
                alongside the router credentials on Ubuntu.
              </p>
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>
                In RouterOS WinBox, open <strong>System → Certificates</strong>,
                select <code>astrid-api-ca</code>, choose{" "}
                <strong>Export</strong>, and export the certificate as PEM. Do
                not export or copy its private key. Download the resulting
                certificate file to Ubuntu.
              </li>
              <li>
                Save it at <code>/etc/astrid-router-gateway/router-ca.pem</code>{" "}
                and make it readable by the <code>astrid-gateway</code> service
                user.
              </li>
              <li>
                Save the JSON below as{" "}
                <code>/etc/astrid-router-gateway/config.json</code>. Replace the
                gateway-token placeholder with the one-time token from Step 1,
                and keep the password as shown.
              </li>
              <li>
                Protect the config file, enable the service, then start it:
                <code className="mt-1 block">
                  sudo chown astrid-gateway:astrid-gateway
                  /etc/astrid-router-gateway/config.json &amp;&amp; sudo chmod
                  0600 /etc/astrid-router-gateway/config.json &amp;&amp; sudo
                  systemctl enable --now astrid-router-gateway
                </code>
              </li>
            </ol>
            <div className="grid gap-2 text-xs">
              <p>
                Router ID: <code className="break-all">{router._id}</code>
              </p>
              <p>
                API username:{" "}
                <code>
                  {apiUsername ?? activeSetup?.apiUsername ?? "Not generated"}
                </code>
              </p>
            </div>
            {scriptPassword ? (
              <>
                <Textarea
                  aria-label="Ubuntu gateway configuration"
                  className="min-h-64 font-mono text-xs"
                  readOnly
                  value={gatewayConfig}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void copyText(gatewayConfig, "Ubuntu gateway config")
                  }
                >
                  <Copy className="mr-2 size-4" />
                  Copy gateway config
                </Button>
              </>
            ) : (
              <Alert>
                <AlertTitle>
                  The one-time router password is no longer available
                </AlertTitle>
                <AlertDescription>
                  If it was not saved in the Ubuntu config, go back to Step 2
                  and prepare a fresh script. A new script creates a new
                  password; do not reuse the old setup.
                </AlertDescription>
              </Alert>
            )}
            <Textarea
              aria-label="Ubuntu certificate installation command"
              className="min-h-20 font-mono text-xs"
              readOnly
              value="sudo install -o astrid-gateway -g astrid-gateway -m 0640 router-ca.pem /etc/astrid-router-gateway/router-ca.pem"
            />
            <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={gatewayConfigSaved}
                disabled={!scriptPassword && !gatewayConfigSaved}
                onChange={(event) =>
                  setGatewayConfigSaved(event.target.checked)
                }
              />
              <span>
                I exported the CA certificate without its private key, saved the
                protected gateway config, and enabled the Ubuntu gateway
                service.
              </span>
            </label>
            <Button
              type="button"
              className="w-full"
              disabled={!gatewayConfigSaved}
              onClick={() => setActiveStep(3)}
            >
              Continue to connection verification
              <ChevronRight className="ml-2 size-4" />
            </Button>
          </section>
        )}

        {activeStep === 3 && (
          <section className="space-y-4">
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <CircleCheck className="size-4 text-primary" />
                Verify the live API-SSL connection
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                The Ubuntu gateway checks the TLS certificate, API login, port,
                source restrictions, and that plain API is disabled.
              </p>
            </div>
            {verificationDone ? (
              <Alert className="border-emerald-500/40">
                <Check className="size-4 text-emerald-500" />
                <AlertTitle>API-SSL setup complete</AlertTitle>
                <AlertDescription>
                  The Ubuntu gateway connected successfully and verified the
                  RouterOS security settings. Your setup record is saved.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {!gatewayCredential?.configured && (
                  <Alert>
                    <AlertTitle>
                      Gateway credential is not configured
                    </AlertTitle>
                    <AlertDescription>
                      Return to Step 1 and configure the workspace gateway token
                      before requesting verification.
                    </AlertDescription>
                  </Alert>
                )}
                {activeSetup?.status !== "operator_applied" && (
                  <Alert>
                    <AlertTitle>
                      RouterOS setup is not marked as applied
                    </AlertTitle>
                    <AlertDescription>
                      Return to Step 2, run the generated script in the CHR
                      terminal, and confirm the success message.
                    </AlertDescription>
                  </Alert>
                )}
                {activeSetup && (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={
                      !gatewayCredential?.configured ||
                      activeSetup.status !== "operator_applied" ||
                      queueingSetupId === activeSetup._id
                    }
                    onClick={() => void verifySetup(activeSetup._id, true)}
                  >
                    {queueingSetupId === activeSetup._id ? (
                      <LoaderCircle className="mr-2 size-4 animate-spin" />
                    ) : (
                      <CircleCheck className="mr-2 size-4" />
                    )}
                    Verify API-SSL now
                  </Button>
                )}
                {operations?.some(
                  (operation) =>
                    operation.setupId === activeSetup?._id &&
                    operation.operationType === "verify_management" &&
                    (operation.status === "pending" ||
                      operation.status === "leased"),
                ) && (
                  <p className="text-sm text-muted-foreground">
                    Verification is queued. Keep the Ubuntu gateway service
                    running; this page will update when it reports back.
                  </p>
                )}
                {operations?.find(
                  (operation) =>
                    operation.setupId === activeSetup?._id &&
                    operation.operationType === "verify_management" &&
                    operation.status === "failed",
                )?.detail && (
                  <Alert variant="destructive">
                    <AlertTitle>Verification did not pass</AlertTitle>
                    <AlertDescription>
                      {
                        operations.find(
                          (operation) =>
                            operation.setupId === activeSetup?._id &&
                            operation.operationType === "verify_management" &&
                            operation.status === "failed",
                        )?.detail
                      }
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
            {verificationDone && (
              <section className="space-y-3 rounded-lg border border-border p-4">
                <div>
                  <h4 className="font-semibold">
                    Connect this MikroTik to RADIUS
                  </h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    API-SSL will configure the router’s PPP RADIUS client and
                    accounting. Subscriber credentials remain in Convex; this
                    does not create local PPP secrets.
                  </p>
                </div>
                <Alert>
                  <AlertTitle>Match the FreeRADIUS shared secret</AlertTitle>
                  <AlertDescription>
                    Newly enrolled routers already have the shared secret saved
                    encrypted. If this router was enrolled before that change,
                    paste the same 64-character secret configured in Ubuntu
                    FreeRADIUS. Confirm its client uses NAS address{" "}
                    {router.tunnelIp ?? "the router tunnel IP"}. Do not rotate
                    the secret unless you also update FreeRADIUS.
                  </AlertDescription>
                </Alert>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p>
                    RADIUS server:{" "}
                    <code>
                      {activeSetup?.gatewaySourceAddress ?? "not configured"}
                    </code>
                  </p>
                  <p>
                    Router source:{" "}
                    <code>{router.tunnelIp ?? "not configured"}</code>
                  </p>
                </div>
                <label className="block space-y-1 text-sm">
                  FreeRADIUS shared secret (only needed for older routers)
                  <Input
                    type="password"
                    autoComplete="off"
                    value={radiusSecret}
                    onChange={(event) => setRadiusSecret(event.target.value)}
                    placeholder="Leave blank if the router was enrolled recently"
                  />
                </label>
                <Button
                  type="button"
                  className="w-full"
                  disabled={
                    !router.tunnelIp ||
                    !activeSetup?.gatewaySourceAddress ||
                    (radiusSecret.trim().length > 0 &&
                      !/^[a-f0-9]{64}$/.test(radiusSecret.trim())) ||
                    configuringRadius ||
                    operations?.some(
                      (operation) =>
                        operation.setupId === activeSetup?._id &&
                        operation.operationType === "configure_radius" &&
                        (operation.status === "pending" ||
                          operation.status === "leased"),
                    ) === true
                  }
                  onClick={() => void applyRadiusConfiguration()}
                >
                  {configuringRadius ? (
                    <LoaderCircle className="mr-2 size-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-2 size-4" />
                  )}
                  Apply PPPoE RADIUS settings via API-SSL
                </Button>
                {operations?.find(
                  (operation) =>
                    operation.setupId === activeSetup?._id &&
                    operation.operationType === "configure_radius",
                )?.status === "pending" ||
                operations?.find(
                  (operation) =>
                    operation.setupId === activeSetup?._id &&
                    operation.operationType === "configure_radius",
                )?.status === "leased" ? (
                  <p className="text-sm text-muted-foreground">
                    Router configuration is queued. Keep the Ubuntu gateway
                    service running while it applies.
                  </p>
                ) : null}
                {operations?.find(
                  (operation) =>
                    operation.setupId === activeSetup?._id &&
                    operation.operationType === "configure_radius",
                )?.status === "succeeded" && (
                  <Alert className="border-emerald-500/40">
                    <Check className="size-4 text-emerald-500" />
                    <AlertTitle>RouterOS RADIUS settings applied</AlertTitle>
                    <AlertDescription>
                      The router now sends PPP authentication and accounting to
                      RADIUS. No per-subscriber MikroTik secret is needed.
                    </AlertDescription>
                  </Alert>
                )}
                {operations?.find(
                  (operation) =>
                    operation.setupId === activeSetup?._id &&
                    operation.operationType === "configure_radius" &&
                    operation.status === "failed",
                )?.detail && (
                  <Alert variant="destructive">
                    <AlertTitle>RADIUS setup did not apply</AlertTitle>
                    <AlertDescription>
                      {
                        operations.find(
                          (operation) =>
                            operation.setupId === activeSetup?._id &&
                            operation.operationType === "configure_radius" &&
                            operation.status === "failed",
                        )?.detail
                      }
                    </AlertDescription>
                  </Alert>
                )}
              </section>
            )}
          </section>
        )}

        <div className="flex justify-between border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={activeStep === 0}
            onClick={() => setActiveStep((step) => Math.max(0, step - 1))}
          >
            <ChevronLeft className="mr-2 size-4" />
            Back
          </Button>
          {activeStep > 0 && activeStep < 3 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => goToStep(activeStep + 1)}
              disabled={!stepDone[activeStep]}
            >
              Continue
              <ChevronRight className="ml-2 size-4" />
            </Button>
          )}
        </div>

        {setups && setups.length > 0 && (
          <details className="border-t border-border pt-4">
            <summary className="cursor-pointer text-sm font-medium">
              Setup history and troubleshooting
            </summary>
            <section className="mt-3 space-y-2">
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
                      disabled={queueingSetupId === setup._id}
                      onClick={() => void markScriptApplied(setup._id)}
                    >
                      {queueingSetupId === setup._id
                        ? "Saving…"
                        : "I ran it — mark applied"}
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
                “Operator applied” means the script was reported as run. A
                successful status appears only after the Ubuntu gateway verifies
                the live RouterOS settings.
              </p>
            </section>
          </details>
        )}
        {operations && operations.length > 0 && (
          <details className="border-t border-border pt-4">
            <summary className="cursor-pointer text-sm font-medium">
              Gateway operation details
            </summary>
            <section className="mt-3 space-y-2">
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
          </details>
        )}
      </DialogContent>
    </Dialog>
  );
}
