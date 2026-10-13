import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  createWorkspace: (name: string) => Promise<Id<"workspaces">>;
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
  return error instanceof Error ? error.message : "Unable to create workspace.";
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
  const createWorkspaceMutation = useMutation(api.workspaces.create);
  const [selectedWorkspaceId, setSelectedWorkspaceId] =
    useState<Id<"workspaces"> | null>(readStoredWorkspaceId);
  const [error, setError] = useState<string | null>(null);
  const pendingCreatedWorkspaceId = useRef<Id<"workspaces"> | null>(null);
  const memberships = useMemo(
    () => (membershipsResult ?? []) as WorkspaceMembership[],
    [membershipsResult],
  );
  const membershipsLoaded = !isAuthenticated || membershipsResult !== undefined;

  useEffect(() => {
    if (!isAuthenticated || membershipsResult === undefined) return;

    const available = membershipsResult as WorkspaceMembership[];
    const pendingCreatedId = pendingCreatedWorkspaceId.current;
    if (pendingCreatedId && !available.some((item) => item.workspaceId === pendingCreatedId)) {
      return;
    }
    if (pendingCreatedId) pendingCreatedWorkspaceId.current = null;

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

  const createWorkspace = useCallback(
    async (name: string) => {
      setError(null);
      try {
        const workspaceId = await createWorkspaceMutation({ name });
        pendingCreatedWorkspaceId.current = workspaceId;
        setSelectedWorkspaceId(workspaceId);
        persistWorkspaceId(workspaceId);
        return workspaceId;
      } catch (caughtError) {
        const message = errorMessage(caughtError);
        setError(message);
        throw caughtError;
      }
    },
    [createWorkspaceMutation],
  );

  const selectionPending =
    isAuthenticated &&
    membershipsResult !== undefined &&
    selectedWorkspaceId !== null &&
    !memberships.some((item) => item.workspaceId === selectedWorkspaceId);

  return (
    <WorkspaceContext.Provider
      value={{
        selectedWorkspaceId:
          memberships.some((item) => item.workspaceId === selectedWorkspaceId) ||
          pendingCreatedWorkspaceId.current === selectedWorkspaceId
            ? selectedWorkspaceId
            : null,
        memberships,
        loading: authLoading || !membershipsLoaded || selectionPending,
        error,
        selectWorkspace,
        createWorkspace,
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
