import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ArrowLeft } from "lucide-react";
import { WifiSignalIcon } from "@/components/ui/wifi-status.tsx";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";

export type SubscriberProfile = NonNullable<
  FunctionReturnType<typeof api.subscriberProfile.get>
>;

export type SubscriberProfileOutlet = {
  profile: SubscriberProfile;
};

const sections = [
  { slug: "overview", label: "Overview" },
  { slug: "router-accounts", label: "Router Accounts" },
  { slug: "sessions", label: "Sessions" },
  { slug: "payments", label: "Payments" },
  { slug: "invoices", label: "Invoices" },
  { slug: "sms", label: "SMS" },
  { slug: "usage-analytics", label: "Usage Analytics" },
  { slug: "devices", label: "Devices" },
  { slug: "tickets", label: "Tickets" },
  { slug: "activities", label: "Activities" },
] as const;

const statusStyles = {
  active: "border-green-400/30 bg-green-400/10 text-green-400",
  suspended: "border-amber-400/30 bg-amber-400/10 text-amber-400",
  expired: "border-red-400/30 bg-red-400/10 text-red-400",
  pending: "border-blue-400/30 bg-blue-400/10 text-blue-400",
} as const;

export default function SubscriberProfileLayout() {
  const { subscriberId } = useParams<{ subscriberId: string }>();
  const { selectedWorkspaceId } = useWorkspace();
  const navigate = useNavigate();
  const id = subscriberId as Id<"subscribers">;
  const profile = useQuery(
    api.subscriberProfile.get,
    selectedWorkspaceId && subscriberId
      ? { workspaceId: selectedWorkspaceId, subscriberId: id }
      : "skip",
  );

  if (!selectedWorkspaceId || !subscriberId || profile === undefined) {
    return (
      <div className="space-y-5 p-4 lg:p-6">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (profile === null) {
    return (
      <div className="space-y-4 p-6">
        <Button variant="ghost" onClick={() => navigate("/subscribers")}>
          <ArrowLeft className="mr-2 size-4" /> Back to subscribers
        </Button>
        <p className="text-sm text-muted-foreground">
          This subscriber could not be found in the selected workspace.
        </p>
      </div>
    );
  }

  const { subscriber } = profile;
  const accountUsername =
    subscriber.connectionType === "pppoe"
      ? subscriber.pppoeUsername
      : subscriber.connectionType === "hotspot"
        ? subscriber.hotspotUsername
        : undefined;
  const accountCount = accountUsername ? 1 : 0;

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 text-muted-foreground"
        onClick={() => navigate("/subscribers")}
      >
        <ArrowLeft className="mr-2 size-4" /> Subscribers
      </Button>

      <section className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-lg font-bold text-primary">
          {subscriber.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold text-foreground">
              {subscriber.name}
            </h1>
            <Badge className={`border ${statusStyles[subscriber.status]}`}>
              {subscriber.status}
            </Badge>
            <Badge variant="outline" className="uppercase">
              {subscriber.connectionType}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {subscriber.phone}
            {subscriber.email ? ` · ${subscriber.email}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <WifiSignalIcon status={subscriber.isOnline ? "online" : "offline"} />
          {subscriber.isOnline ? "Online" : "Offline"}
        </div>
      </section>

      <nav
        aria-label="Subscriber profile sections"
        className="flex overflow-x-auto border-b border-border"
      >
        {sections.map((section) => (
          <NavLink
            key={section.slug}
            to={`/subscribers/${subscriberId}/${section.slug}`}
            className={({ isActive }) =>
              `flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-3 text-sm transition-colors ${
                isActive
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`
            }
          >
            {section.label}
            {section.slug === "router-accounts" && ` (${accountCount})`}
          </NavLink>
        ))}
      </nav>

      <Outlet context={{ profile } satisfies SubscriberProfileOutlet} />
    </div>
  );
}
