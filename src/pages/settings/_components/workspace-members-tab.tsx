import { useState, type FormEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { LoaderCircle, Copy, UserPlus, X } from "lucide-react";

const roleNames = {
  owner: "Owner",
  admin: "Administrator",
  billing: "Billing staff",
  network: "Network operator",
  read_only: "Read only",
} as const;

type InviteRole = "admin" | "billing" | "network" | "read_only";

export default function WorkspaceMembersTab() {
  const { selectedWorkspaceId: workspaceId, memberships } = useWorkspace();
  const membership = memberships.find((item) => item.workspaceId === workspaceId);
  const canManage = membership?.role === "owner" || membership?.role === "admin";
  const members = useQuery(
    api.workspaces.listMembers,
    workspaceId && canManage ? { workspaceId } : "skip",
  );
  const invitations = useQuery(
    api.workspaceInvitations.listPending,
    workspaceId && canManage ? { workspaceId } : "skip",
  );
  const createInvitation = useAction(api.workspaceInvitationsActions.create);
  const revokeInvitation = useMutation(api.workspaceInvitations.revoke);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("billing");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!canManage || !workspaceId) {
    return (
      <p className="text-sm text-muted-foreground">
        Workspace membership management is available to workspace owners and administrators.
      </p>
    );
  }

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setInviteLink(null);
    try {
      const result = await createInvitation({ workspaceId, email, role });
      const link = `${window.location.origin}/accept-invite?token=${encodeURIComponent(result.token)}`;
      setInviteLink(link);
      setEmail("");
      toast.success("Invitation created. Copy and share the link securely.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create invitation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold">Invite a teammate</h3>
          <p className="text-sm text-muted-foreground">
            Invitations expire after seven days and can only be accepted by the invited email account.
            The invite link is shown once; share it directly and securely.
          </p>
        </div>
        <form onSubmit={invite} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
          <Input
            type="email"
            required
            autoComplete="email"
            placeholder="teammate@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitting}
          />
          <Select value={role} onValueChange={(value) => setRole(value as InviteRole)}>
            <SelectTrigger aria-label="Invitation role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Administrator</SelectItem>
              <SelectItem value="billing">Billing staff</SelectItem>
              <SelectItem value="network">Network operator</SelectItem>
              <SelectItem value="read_only">Read only</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={submitting}>
            {submitting ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <UserPlus className="mr-2 size-4" />}
            Create invite
          </Button>
        </form>
        {inviteLink && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row">
            <Input readOnly aria-label="New invitation link" value={inviteLink} />
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                void navigator.clipboard.writeText(inviteLink).then(
                  () => toast.success("Invitation link copied"),
                  () => toast.error("Could not copy the invitation link"),
                )
              }
            >
              <Copy className="mr-2 size-4" />
              Copy link
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Members</h3>
        {members === undefined ? (
          <p className="text-sm text-muted-foreground">Loading members…</p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {members.map((member) => (
              <div key={member.userId} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <p className="text-sm font-medium">{member.name || member.email || "Workspace member"}</p>
                  {member.name && member.email && (
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{roleNames[member.role]}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Pending invitations</h3>
        {invitations === undefined ? (
          <p className="text-sm text-muted-foreground">Loading invitations…</p>
        ) : invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invitations.</p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {invitations.map((invitation) => (
              <div key={invitation._id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <p className="text-sm font-medium">{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {roleNames[invitation.role]} · Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void revokeInvitation({ workspaceId, invitationId: invitation._id }).then(
                      () => toast.success("Invitation revoked"),
                      (error: unknown) =>
                        toast.error(error instanceof Error ? error.message : "Could not revoke invitation"),
                    )
                  }
                  aria-label={`Revoke invitation for ${invitation.email}`}
                >
                  <X className="mr-1 size-4" />
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
