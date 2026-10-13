import { useEffect, useState } from "react";
import { useAction, useConvexAuth } from "convex/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { BriefcaseBusiness } from "lucide-react";
import { toast } from "sonner";

const PENDING_INVITE_KEY = "astrid-pending-workspace-invite";

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const acceptInvitation = useAction(api.workspaceInvitationsActions.accept);
  const token = searchParams.get("token") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) return;
    try {
      sessionStorage.setItem(PENDING_INVITE_KEY, token);
    } catch {
      setError("This browser could not securely retain the invitation. Reopen the invite link after signing in.");
    }
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    setError(null);
    try {
      await acceptInvitation({ token });
      try {
        sessionStorage.removeItem(PENDING_INVITE_KEY);
      } catch {
        // Acceptance succeeded; storage cleanup must not change the result.
      }
      toast.success("You joined the workspace.");
      navigate("/dashboard", { replace: true });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not accept invitation.");
    } finally {
      setAccepting(false);
    }
  };

  if (!token) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4">
        <section className="w-full max-w-md space-y-3 rounded-xl border border-border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold">Invitation link is incomplete</h1>
          <p className="text-sm text-muted-foreground">Ask the workspace administrator for a new invite link.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <section className="w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BriefcaseBusiness className="size-6" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Join a workspace</h1>
          <p className="text-sm text-muted-foreground">
            Sign in with the email address that received this invitation, then accept it.
          </p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {isLoading ? (
          <Spinner className="mx-auto size-6" />
        ) : isAuthenticated ? (
          <Button className="w-full" onClick={() => void accept()} disabled={accepting}>
            {accepting && <Spinner className="mr-2 size-4" />}
            Accept invitation
          </Button>
        ) : (
          <SignInButton />
        )}
      </section>
    </main>
  );
}
