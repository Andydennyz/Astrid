import { useState, type FormEvent } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel.js";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";

type Tenant = {
  workspaceId: Id<"workspaces">;
  name: string;
  ownerId: Id<"users">;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerAccessSuspended: boolean;
  status: "active" | "suspended" | "archived" | "expired" | "deleting";
  expiresAt: number | null;
  deletionPending: boolean;
};

function dateInputValue(value: number | null) {
  if (value === null) return "";
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function todayInputValue() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function endOfSelectedDate(value: string) {
  const timestamp = new Date(`${value}T23:59:59.999`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function TenantManagementPanel({
  tenant,
  onClose,
}: {
  tenant: Tenant;
  onClose: () => void;
}) {
  const {
    results: members,
    status: membersStatus,
    loadMore,
  } = usePaginatedQuery(
    api.platformManagement.listMembers,
    { workspaceId: tenant.workspaceId },
    { initialNumItems: 50 },
  );
  const suspendOwner = useMutation(
    api.platformManagement.setOwnerAccessSuspended,
  );
  const setTenantStatus = useMutation(api.platformManagement.setTenantStatus);
  const restoreTenant = useMutation(api.platformManagement.restoreTenant);
  const setExpiry = useMutation(api.platformManagement.setExpiry);
  const extendDuration = useMutation(api.platformManagement.extendDuration);
  const sendAlert = useMutation(api.platformManagement.sendAlert);
  const revokeAccess = useMutation(api.platformManagement.revokeMemberAccess);
  const transferOwnership = useMutation(
    api.platformManagement.transferOwnership,
  );
  const permanentlyDelete = useMutation(
    api.platformManagement.permanentlyDeleteTenant,
  );
  const [expiryDate, setExpiryDate] = useState(
    dateInputValue(tenant.expiresAt),
  );
  const [extensionDays, setExtensionDays] = useState("30");
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertRecipient, setAlertRecipient] = useState("");
  const [newOwnerId, setNewOwnerId] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const perform = async (action: string, operation: () => Promise<unknown>) => {
    setBusyAction(action);
    setError(null);
    setSuccess(null);
    try {
      await operation();
      setSuccess(`${action} completed. The tenant was notified.`);
      return true;
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : `${action} failed.`,
      );
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  const handleExpirySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const expiresAt = endOfSelectedDate(expiryDate);
    if (expiresAt === null) {
      setError("Choose a valid expiry date.");
      return;
    }
    await perform("Expiry update", () =>
      setExpiry({ workspaceId: tenant.workspaceId, expiresAt }),
    );
  };

  const handleAlertSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sent = await perform("Alert", () =>
      sendAlert({
        workspaceId: tenant.workspaceId,
        userId: alertRecipient ? (alertRecipient as Id<"users">) : null,
        title: alertTitle,
        message: alertMessage,
      }),
    );
    if (sent) {
      setAlertTitle("");
      setAlertMessage("");
    }
  };

  const handlePermanentDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (deleteConfirmation !== tenant.name) return;
    await perform("Permanent deletion", () =>
      permanentlyDelete({
        workspaceId: tenant.workspaceId,
        confirmWorkspaceName: deleteConfirmation,
      }),
    );
    setDeleteConfirmation("");
  };

  const currentOwner = members.find(
    (member) => member.userId === tenant.ownerId,
  );
  const eligibleOwners = members.filter(
    (member) => member.userId !== tenant.ownerId && !member.accessSuspended,
  );
  const isDeleting = tenant.deletionPending || tenant.status === "deleting";

  return (
    <section className="rounded-xl border border-primary/30 bg-card p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Manage {tenant.name}</h3>
          <p className="text-sm text-muted-foreground">
            Tenant lifecycle actions are audited and generate account-level
            in-app alerts.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </header>

      {(error || success) && (
        <p
          role={error ? "alert" : "status"}
          className={`mt-4 rounded-md border px-3 py-2 text-sm ${error ? "border-destructive/40 text-destructive" : "border-primary/30 text-primary"}`}
        >
          {error ?? success}
        </p>
      )}

      {isDeleting ? (
        <p className="mt-5 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Permanent deletion is underway. Tenant records are being erased in
          bounded batches and this cannot be cancelled or restored.
        </p>
      ) : (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-border p-4">
            <h4 className="font-medium">Workspace status</h4>
            <p className="text-sm text-muted-foreground">
              Status:{" "}
              <span className="capitalize text-foreground">
                {tenant.status}
              </span>
              {tenant.expiresAt !== null && (
                <>
                  {" "}
                  · Expires{" "}
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                  }).format(tenant.expiresAt)}
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {tenant.status === "archived" ||
              tenant.status === "suspended" ||
              tenant.status === "expired" ? (
                <Button
                  size="sm"
                  disabled={busyAction !== null}
                  onClick={() =>
                    void perform("Restore", () =>
                      restoreTenant({ workspaceId: tenant.workspaceId }),
                    )
                  }
                >
                  Restore tenant
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyAction !== null}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Archive ${tenant.name}? Tenant members will be blocked, but data is preserved and can be restored.`,
                      )
                    ) {
                      void perform("Archive", () =>
                        setTenantStatus({
                          workspaceId: tenant.workspaceId,
                          status: "archived",
                        }),
                      );
                    }
                  }}
                >
                  Archive tenant
                </Button>
              )}
              <Button
                size="sm"
                variant={tenant.ownerAccessSuspended ? "default" : "outline"}
                disabled={busyAction !== null}
                onClick={() =>
                  void perform(
                    tenant.ownerAccessSuspended
                      ? "Owner access restore"
                      : "Owner suspension",
                    () =>
                      suspendOwner({
                        workspaceId: tenant.workspaceId,
                        suspended: !tenant.ownerAccessSuspended,
                      }),
                  )
                }
              >
                {tenant.ownerAccessSuspended
                  ? "Restore owner access"
                  : "Suspend owner access"}
              </Button>
            </div>
            {currentOwner && (
              <p className="text-xs text-muted-foreground">
                Owner: {currentOwner.name ?? currentOwner.email ?? "Unknown"}
              </p>
            )}
          </div>

          <form
            onSubmit={handleExpirySubmit}
            className="space-y-3 rounded-lg border border-border p-4"
          >
            <h4 className="font-medium">Expiry and duration</h4>
            <label
              htmlFor="tenant-expiry"
              className="text-sm text-muted-foreground"
            >
              Expiry date
            </label>
            <Input
              id="tenant-expiry"
              type="date"
              value={expiryDate}
              onChange={(event) => setExpiryDate(event.target.value)}
              min={todayInputValue()}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={busyAction !== null || !expiryDate}
              >
                Set expiry
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyAction !== null || !tenant.expiresAt}
                onClick={() =>
                  void perform("Expiry removal", () =>
                    setExpiry({
                      workspaceId: tenant.workspaceId,
                      expiresAt: null,
                    }),
                  )
                }
              >
                Remove expiry
              </Button>
            </div>
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <Input
                aria-label="Extension days"
                type="number"
                min={1}
                max={3650}
                value={extensionDays}
                onChange={(event) => setExtensionDays(event.target.value)}
                className="max-w-28"
              />
              <span className="text-sm text-muted-foreground">days</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() =>
                  void perform("Duration extension", () =>
                    extendDuration({
                      workspaceId: tenant.workspaceId,
                      days: Number(extensionDays),
                    }),
                  )
                }
              >
                Extend duration
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Expiry automatically suspends workspace access. Extending an
              expired term restores access; archived workspaces still require a
              separate restore.
            </p>
          </form>

          <form
            onSubmit={handleAlertSubmit}
            className="space-y-3 rounded-lg border border-border p-4"
          >
            <h4 className="font-medium">Send an in-app alert</h4>
            <label
              htmlFor="tenant-alert-recipient"
              className="text-sm text-muted-foreground"
            >
              Recipient
            </label>
            <select
              id="tenant-alert-recipient"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={alertRecipient}
              onChange={(event) => setAlertRecipient(event.target.value)}
            >
              <option value="">All tenant members</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name ?? member.email ?? member.userId}
                  {member.accessSuspended ? " (suspended)" : ""}
                </option>
              ))}
            </select>
            <Input
              aria-label="Alert title"
              placeholder="Alert title"
              minLength={2}
              maxLength={100}
              required
              value={alertTitle}
              onChange={(event) => setAlertTitle(event.target.value)}
            />
            <textarea
              aria-label="Alert message"
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Message for the tenant"
              minLength={2}
              maxLength={2000}
              required
              value={alertMessage}
              onChange={(event) => setAlertMessage(event.target.value)}
            />
            <Button type="submit" size="sm" disabled={busyAction !== null}>
              Send alert
            </Button>
          </form>

          <div className="space-y-3 rounded-lg border border-border p-4">
            <h4 className="font-medium">Tenant members</h4>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {membersStatus === "LoadingFirstPage"
                  ? "Loading members…"
                  : "No tenant members found."}
              </p>
            ) : (
              <div className="space-y-2">
                {members.map((member) => (
                  <div
                    key={member.userId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {member.name ?? "Unknown"}
                        {member.userId === tenant.ownerId ? " · owner" : ""}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {member.email ?? "No email"} ·{" "}
                        {member.accessSuspended ? "suspended" : member.role}
                      </p>
                    </div>
                    {member.userId !== tenant.ownerId && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyAction !== null}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Revoke ${member.name ?? member.email ?? "this member"}'s access to ${tenant.name}? Their sign-in account will remain active.`,
                            )
                          ) {
                            void perform("Access revocation", () =>
                              revokeAccess({
                                workspaceId: tenant.workspaceId,
                                userId: member.userId,
                              }),
                            );
                          }
                        }}
                      >
                        Revoke access
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {membersStatus === "CanLoadMore" ||
            membersStatus === "LoadingMore" ? (
              <Button
                variant="outline"
                size="sm"
                disabled={membersStatus === "LoadingMore"}
                onClick={() => loadMore(50)}
              >
                {membersStatus === "LoadingMore"
                  ? "Loading…"
                  : "Load more members"}
              </Button>
            ) : null}
            <div className="border-t border-border pt-3">
              <label
                htmlFor="new-tenant-owner"
                className="text-sm text-muted-foreground"
              >
                Transfer ownership to
              </label>
              <select
                id="new-tenant-owner"
                className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={newOwnerId}
                onChange={(event) => setNewOwnerId(event.target.value)}
              >
                <option value="">Select an active tenant member</option>
                {eligibleOwners.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name ?? member.email ?? member.userId}
                  </option>
                ))}
              </select>
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                disabled={busyAction !== null || !newOwnerId}
                onClick={() => {
                  const newOwner = eligibleOwners.find(
                    (member) => member.userId === newOwnerId,
                  );
                  if (
                    newOwner &&
                    window.confirm(
                      `Transfer ownership of ${tenant.name} to ${newOwner.name ?? newOwner.email ?? "this member"}? The current owner will become an admin.`,
                    )
                  ) {
                    void perform("Ownership transfer", () =>
                      transferOwnership({
                        workspaceId: tenant.workspaceId,
                        newOwnerId: newOwner.userId,
                      }),
                    );
                  }
                }}
              >
                Transfer ownership
              </Button>
            </div>
          </div>

          <form
            onSubmit={handlePermanentDelete}
            className="space-y-3 rounded-lg border border-destructive/40 p-4 xl:col-span-2"
          >
            <h4 className="font-medium text-destructive">
              Permanently delete tenant
            </h4>
            <p className="text-sm text-muted-foreground">
              This irreversibly deletes the workspace, members, invitations,
              subscriber and billing records, network configuration, and tenant
              audit data. A notice is sent first, and deletion runs in bounded
              batches. External sign-in identities are not deleted.
            </p>
            <label
              htmlFor="confirm-tenant-delete"
              className="text-sm text-muted-foreground"
            >
              Type{" "}
              <span className="font-semibold text-foreground">
                {tenant.name}
              </span>{" "}
              to confirm.
            </label>
            <Input
              id="confirm-tenant-delete"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              autoComplete="off"
            />
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={
                busyAction !== null || deleteConfirmation !== tenant.name
              }
            >
              Start permanent deletion
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}
