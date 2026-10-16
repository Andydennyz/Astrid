import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Building2, ShieldCheck } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.js";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { TenantManagementPanel } from "./TenantManagementPanel.tsx";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

export default function PlatformTenantsPage() {
  const isPlatformOwner = useQuery(
    api.platformAdmin.isCurrentPlatformOwner,
    {},
  );
  const isPlatformAdmin = useQuery(
    api.platformAdmin.isCurrentPlatformAdmin,
    {},
  );
  const ownerTokenIdentifier = useQuery(
    api.platformAdmin.currentPlatformOwnerTokenIdentifier,
    isPlatformOwner === true ? {} : "skip",
  );
  const approveRequest = useMutation(api.workspaceCreationRequests.approve);
  const rejectRequest = useMutation(api.workspaceCreationRequests.reject);
  const [savingRequestId, setSavingRequestId] =
    useState<Id<"workspace_creation_requests"> | null>(null);
  const [selectedTenantId, setSelectedTenantId] =
    useState<Id<"workspaces"> | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { results, status, loadMore } = usePaginatedQuery(
    api.platformAdmin.listTenants,
    isPlatformAdmin === true ? {} : "skip",
    { initialNumItems: 25 },
  );
  const {
    results: requests,
    status: requestStatus,
    loadMore: loadMoreRequests,
  } = usePaginatedQuery(
    api.workspaceCreationRequests.listPending,
    isPlatformAdmin === true ? {} : "skip",
    { initialNumItems: 25 },
  );

  if (isPlatformOwner === undefined || isPlatformAdmin === undefined) {
    return (
      <div className="space-y-3 p-4 lg:p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!isPlatformOwner) {
    return (
      <section className="m-4 rounded-xl border border-border bg-card p-6 lg:m-6">
        <h2 className="text-lg font-semibold">Access restricted</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This platform-owner page is available only to the designated
          system-owner account.
        </p>
      </section>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <section className="m-4 rounded-xl border border-border bg-card p-6 lg:m-6">
        <h2 className="text-lg font-semibold">
          Platform access is not enabled
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The owner account is recognized, but its verified token identifier
          must be configured in the{" "}
          <code>PLATFORM_ADMIN_TOKEN_IDENTIFIERS</code> setting for the dev
          deployment before the tenant directory or approval controls can be
          used.
        </p>
        {ownerTokenIdentifier ? (
          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              This account&apos;s token identifier
            </p>
            <code className="mt-1 block break-all text-sm">
              {ownerTokenIdentifier}
            </code>
            <p className="mt-2 text-xs text-muted-foreground">
              Add this value to the comma-separated allowlist in the Convex
              dashboard for this development deployment. Do not add it to
              client-side environment variables or source control.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Loading owner identity details…
          </p>
        )}
      </section>
    );
  }

  if (status === "LoadingFirstPage") {
    return (
      <div className="space-y-3 p-4 lg:p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const isComplete = status === "Exhausted";
  const selectedTenant = results.find(
    (tenant) => tenant.workspaceId === selectedTenantId,
  );
  const handleRequest = async (
    requestId: Id<"workspace_creation_requests">,
    action: "approve" | "reject",
  ) => {
    setSavingRequestId(requestId);
    setActionError(null);
    try {
      if (action === "approve") await approveRequest({ requestId });
      else await rejectRequest({ requestId });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Could not update workspace request.",
      );
    } finally {
      setSavingRequestId(null);
    }
  };

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <header className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted/50">
          <Building2 className="size-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Tenant directory</h2>
          <p className="text-sm text-muted-foreground">
            Platform-level workspace metadata; tenant service and billing
            records are not shown.
          </p>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h3 className="font-semibold">Workspace requests</h3>
          <p className="text-sm text-muted-foreground">
            Approval creates the workspace and grants its requester the owner
            role.
          </p>
        </div>
        {actionError && (
          <p
            role="alert"
            className="border-b border-border px-4 py-3 text-sm text-destructive"
          >
            {actionError}
          </p>
        )}
        {requests.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {requestStatus === "LoadingFirstPage"
              ? "Loading requests…"
              : "No pending workspace requests."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Requested workspace</th>
                  <th className="px-4 py-3 font-medium">Requester</th>
                  <th className="px-4 py-3 font-medium">Requested</th>
                  <th className="px-4 py-3 font-medium">Decision</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr
                    key={request.requestId}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3 font-medium">{request.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div>{request.requesterName ?? "Unknown"}</div>
                      {request.requesterEmail && (
                        <div className="text-xs">{request.requesterEmail}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(request.createdAt)}
                    </td>
                    <td className="flex gap-2 px-4 py-3">
                      <Button
                        size="sm"
                        disabled={savingRequestId !== null}
                        onClick={() =>
                          void handleRequest(request.requestId, "approve")
                        }
                      >
                        {savingRequestId === request.requestId
                          ? "Saving…"
                          : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={savingRequestId !== null}
                        onClick={() =>
                          void handleRequest(request.requestId, "reject")
                        }
                      >
                        Reject
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {requestStatus === "CanLoadMore" || requestStatus === "LoadingMore" ? (
          <div className="border-t border-border p-4 text-center">
            <Button
              variant="outline"
              onClick={() => loadMoreRequests(25)}
              disabled={requestStatus === "LoadingMore"}
            >
              {requestStatus === "LoadingMore"
                ? "Loading…"
                : "Load more requests"}
            </Button>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h3 className="font-semibold">
              {isComplete
                ? `${results.length} tenant${results.length === 1 ? "" : "s"}`
                : `${results.length}+ tenants`}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isComplete
                ? "Complete directory count"
                : "Partial count; load more to enumerate all workspaces"}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" />
            Metadata access only
          </div>
        </div>

        {results.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No tenant workspaces found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Workspace</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Created by</th>
                  <th className="px-4 py-3 font-medium">Status / expiry</th>
                  <th className="px-4 py-3 font-medium">Manage</th>
                </tr>
              </thead>
              <tbody>
                {results.map((tenant) => (
                  <tr
                    key={tenant.workspaceId}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3 font-medium">{tenant.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(tenant.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div>{tenant.ownerName ?? "Unknown"}</div>
                      {tenant.ownerEmail && (
                        <div className="text-xs">{tenant.ownerEmail}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="capitalize">
                        {tenant.deletionPending ? "deleting" : tenant.status}
                        {tenant.ownerAccessSuspended && !tenant.deletionPending
                          ? " · owner suspended"
                          : ""}
                      </div>
                      {tenant.expiresAt !== null && (
                        <div className="text-xs">
                          Expires{" "}
                          {formatDate(new Date(tenant.expiresAt).toISOString())}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedTenantId(tenant.workspaceId)}
                      >
                        Manage
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {status === "CanLoadMore" || status === "LoadingMore" ? (
          <div className="border-t border-border p-4 text-center">
            <Button
              variant="outline"
              onClick={() => loadMore(25)}
              disabled={status === "LoadingMore"}
            >
              {status === "LoadingMore" ? "Loading…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </section>

      {selectedTenant && (
        <TenantManagementPanel
          key={selectedTenant.workspaceId}
          tenant={selectedTenant}
          onClose={() => setSelectedTenantId(null)}
        />
      )}

      <p className="text-xs text-muted-foreground">
        Workspace status is not currently tracked separately. Tenant service
        data remains isolated to each workspace.
      </p>
    </div>
  );
}
