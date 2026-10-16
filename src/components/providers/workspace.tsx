import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel.js";
import { api } from "@/convex/_generated/api.js";

const STORAGE_KEY = "astrid-selected-workspace";

export type WorkspaceMembership = {
  workspaceId: Id<"workspaces">;
  name: string;
  role: "owner" | "admin" | "billing" | "network" | "read_only";
};

type WorkspaceContextValue = {
  selectedWorkspaceId: Id<"workspaces"> | null;
  memberships: WorkspaceMembership[];
  loading: boolean;
  error: string | null;
  selectWorkspace: (workspaceId: Id<"workspaces">) => void;
  requestWorkspaceCreation: (name: string) => Promise<Id<"workspace_creation_requests">>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function readStoredWorkspaceId(): Id<"workspaces"> | null {
  try {
    return (localStorage.getItem(STORAGE_KEY) as Id<"workspaces"> | null) ?? null;
  } catch {
    return null;
  }
}

function persistWorkspaceId(workspaceId: Id<"workspaces"> | null) {
  try {
    if (workspaceId) localStorage.setItem(STORAGE_KEY, workspaceId);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Workspace selection remains available for the current session.
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to request a workspace.";
}

export function WorkspaceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const membershipsResult = useQuery(
    api.workspaces.listMine,
    isAuthenticated ? {} : "skip",
  );
  const requestWorkspaceMutation = useMutation(api.workspaceCreationRequests.request);
  const [selectedWorkspaceId, setSelectedWorkspaceId] =
    useState<Id<"workspaces"> | null>(readStoredWorkspaceId);
  const [error, setError] = useState<string | null>(null);
  const memberships = useMemo(
    () => (membershipsResult ?? []) as WorkspaceMembership[],
    [membershipsResult],
  );
  const membershipsLoaded = !isAuthenticated || membershipsResult !== undefined;

  useEffect(() => {
    if (!isAuthenticated || membershipsResult === undefined) return;

    const available = membershipsResult as WorkspaceMembership[];
    const savedWorkspaceId = readStoredWorkspaceId();
    const nextWorkspaceId =
      available.find((item) => item.workspaceId === selectedWorkspaceId)?.workspaceId ??
      available.find((item) => item.workspaceId === savedWorkspaceId)?.workspaceId ??
      available[0]?.workspaceId ??
      null;
    setSelectedWorkspaceId(nextWorkspaceId);
    persistWorkspaceId(nextWorkspaceId);
  }, [isAuthenticated, membershipsResult, selectedWorkspaceId]);

  const selectWorkspace = useCallback(
    (workspaceId: Id<"workspaces">) => {
      if (!memberships.some((item) => item.workspaceId === workspaceId)) return;
      setSelectedWorkspaceId(workspaceId);
      persistWorkspaceId(workspaceId);
      setError(null);
    },
    [memberships],
  );

  const requestWorkspaceCreation = useCallback(
    async (name: string) => {
      setError(null);
      try {
        return await requestWorkspaceMutation({ name });
      } catch (caughtError) {
        const message = errorMessage(caughtError);
        setError(message);
        throw caughtError;
      }
    },
    [requestWorkspaceMutation],
  );

  const selectionPending =
    isAuthenticated &&
    membershipsResult !== undefined &&
    selectedWorkspaceId !== null &&
    !memberships.some((item) => item.workspaceId === selectedWorkspaceId);

  return (
    <WorkspaceContext.Provider
      value={{
        selectedWorkspaceId: memberships.some(
          (item) => item.workspaceId === selectedWorkspaceId,
        )
          ? selectedWorkspaceId
          : null,
        memberships,
        loading: authLoading || !membershipsLoaded || selectionPending,
        error,
        selectWorkspace,
        requestWorkspaceCreation,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

// Keep the hook with its context; the provider is the only rendered export here.
// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
