import { useState } from "react";
import { useQuery } from "convex/react";
import { Outlet, useLocation, Navigate } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import Sidebar from "./sidebar.tsx";
import Navbar from "./navbar.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { WorkspaceEmptyState } from "./workspace-control.tsx";
import { useWorkspace } from "@/components/providers/workspace.tsx";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/subscribers": "Subscribers",
  "/network": "Network",
  "/packages": "Packages",
  "/financials": "Financials",
  "/transactions": "Transactions",
  "/billing": "My Billing",
  "/tickets": "Tickets",
  "/sms-reports": "SMS Reports",
  "/settings": "Settings",
  "/whats-new": "What's New",
  "/feature-requests": "Feature Requests",
  "/reports": "Reports & Export",
  "/onboarding": "Onboarding",
  "/platform/tenants": "Tenant directory",
};

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { memberships, loading, selectedWorkspaceId } = useWorkspace();
  const isPlatformOwner = useQuery(api.platformAdmin.isCurrentPlatformOwner, {});
  const isPlatformTenantsRoute = location.pathname === "/platform/tenants";
  const platformAccessPending = isPlatformTenantsRoute && isPlatformOwner === undefined;
  const canUsePlatformRoute = isPlatformTenantsRoute && isPlatformOwner === true;

  const currentTitle = pageTitles[location.pathname] ?? "Dashboard";

  return (
    <>
      <AuthLoading>
        <div className="flex h-screen items-center justify-center bg-background">
          <Spinner className="size-8" />
        </div>
      </AuthLoading>

      <Unauthenticated>
        <Navigate to="/" replace />
      </Unauthenticated>

      <Authenticated>
        <div className="flex h-screen overflow-hidden bg-background">
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

          <div className="flex flex-1 flex-col overflow-hidden min-w-0">
            <Navbar
              onMenuToggle={() => setSidebarOpen((prev) => !prev)}
              title={currentTitle}
            />
            <main className="flex-1 overflow-y-auto">
              {loading || platformAccessPending ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner className="size-8" />
                </div>
              ) : memberships.length === 0 && !canUsePlatformRoute ? (
                <WorkspaceEmptyState />
              ) : selectedWorkspaceId || canUsePlatformRoute ? (
                <Outlet />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Spinner className="size-8" />
                </div>
              )}
            </main>
          </div>
        </div>
      </Authenticated>
    </>
  );
}
