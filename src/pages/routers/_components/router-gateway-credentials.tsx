import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { toast } from "sonner";
import { Copy, KeyRound, RotateCw } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";

export default function RouterGatewayCredentials() {
  const { selectedWorkspaceId: workspaceId, memberships } = useWorkspace();
  const membership = memberships.find((item) => item.workspaceId === workspaceId);
  const canManage =
    membership?.role === "owner" ||
    membership?.role === "admin" ||
    membership?.role === "network";
  const credential = useQuery(
    api.routerGateway.getCredentialStatus,
    workspaceId && canManage ? { workspaceId } : "skip",
  );
  const rotateCredential = useAction(api.routerGateway.rotateGatewayCredential);
  const [token, setToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!workspaceId || !canManage) return null;

  const rotate = async () => {
    if (credential?.configured && !window.confirm("Rotating this credential immediately disconnects the current Ubuntu gateway agent. Continue?")) {
      return;
    }
    setSaving(true);
    try {
      const result = await rotateCredential({ workspaceId });
      setToken(result.token);
      toast.success("Gateway credential rotated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rotate the gateway credential.");
    } finally {
      setSaving(false);
    }
  };

  const copyToken = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      toast.success("Gateway credential copied.");
    } catch {
      toast.error("Could not copy the credential. Select and copy it manually.");
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <KeyRound className="size-4 text-primary" />
            Ubuntu gateway access
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each workspace has a separate gateway credential. Only its hash is stored; rotating
            it immediately invalidates the previous credential.
          </p>
        </div>
        <Button variant="outline" onClick={() => void rotate()} disabled={saving}>
          <RotateCw className="mr-2 size-4" />
          {saving ? "Rotating…" : credential?.configured ? "Rotate credential" : "Create credential"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {credential === undefined
          ? "Checking gateway configuration…"
          : credential.configured
            ? `Credential configured${credential.createdAt ? ` · rotated ${new Date(credential.createdAt).toLocaleString()}` : ""}`
            : "No gateway credential is configured."}
      </p>

      {token && (
        <Alert>
          <AlertTitle>Copy this one-time credential to the Ubuntu gateway</AlertTitle>
          <AlertDescription className="mt-2 space-y-3">
            <p>The full value will not be shown again. Store it in the gateway’s protected secret store.</p>
            <div className="flex flex-wrap gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-muted p-2">{token}</code>
              <Button type="button" variant="secondary" onClick={() => void copyToken()}>
                <Copy className="mr-2 size-4" />
                Copy
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
