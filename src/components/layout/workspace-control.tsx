import { useState, type FormEvent } from "react";
import { BriefcaseBusiness, LoaderCircle } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { useWorkspace } from "@/components/providers/workspace.tsx";

export function WorkspacePicker() {
  const { memberships, selectedWorkspaceId, selectWorkspace } = useWorkspace();
  if (memberships.length < 2 || !selectedWorkspaceId) return null;

  return (
    <div className="max-w-36 sm:max-w-52">
      <Select
        value={selectedWorkspaceId}
        onValueChange={(value) =>
          selectWorkspace(value as Id<"workspaces">)
        }
      >
        <SelectTrigger
          aria-label="Select workspace"
          className="h-9 max-w-52 border-border bg-card text-foreground"
        >
          <BriefcaseBusiness className="size-4 text-primary" />
          <SelectValue placeholder="Select workspace" />
        </SelectTrigger>
        <SelectContent>
          {memberships.map((membership) => (
            <SelectItem
              key={membership.workspaceId}
              value={membership.workspaceId}
            >
              {membership.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function WorkspaceEmptyState() {
  const { createWorkspace, error } = useWorkspace();
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreating(true);
    setFormError(null);
    try {
      await createWorkspace(name);
      setName("");
    } catch (caughtError) {
      setFormError(
        caughtError instanceof Error
          ? caughtError.message
          : error ?? "Could not create workspace. Please try again.",
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-5 flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BriefcaseBusiness className="size-5" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">
          Create your workspace
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          A workspace keeps your subscribers, network, billing, and reports
          together. Create one to get started.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <label htmlFor="workspace-name" className="text-sm font-medium">
            Workspace name
          </label>
          <Input
            id="workspace-name"
            autoFocus
            autoComplete="organization"
            minLength={2}
            maxLength={80}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Astrid Networks"
            disabled={isCreating}
          />
          {(formError || error) && (
            <p role="alert" className="text-sm text-destructive">
              {formError || error}
            </p>
          )}
          <Button type="submit" disabled={isCreating} className="w-full">
            {isCreating && <LoaderCircle className="mr-2 size-4 animate-spin" />}
            Create workspace
          </Button>
        </form>
      </div>
    </section>
  );
}
