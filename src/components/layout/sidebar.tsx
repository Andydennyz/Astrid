import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils.ts";
import {
  LayoutDashboard,
  Rocket,
  Users,
  Network,
  Package,
  TrendingUp,
  ArrowLeftRight,
  CreditCard,
  TicketCheck,
  MessageSquare,
  Sparkles,
  Lightbulb,
  Settings,
  Zap,
  ChevronRight,
  X,
  BarChart2,
  Router as RouterIcon,
  Activity,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth.ts";

type NavItem = {
  icon: React.ComponentType<{ className?: string; size?: number }>;
  label: string;
  href: string;
  badge?: string;
};

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: Rocket, label: "Onboarding", href: "/onboarding" },
  { icon: Users, label: "Subscribers", href: "/subscribers" },
  { icon: Network, label: "Network", href: "/network" },
  { icon: RouterIcon, label: "Routers", href: "/routers" },
  { icon: Activity, label: "Sessions", href: "/sessions" },
  { icon: ShieldCheck, label: "RADIUS Logs", href: "/radius-logs" },
  { icon: Package, label: "Packages", href: "/packages" },
  { icon: TrendingUp, label: "Financials", href: "/financials" },
  { icon: ArrowLeftRight, label: "Transactions", href: "/transactions" },
  { icon: CreditCard, label: "My Billing", href: "/billing" },
  { icon: TicketCheck, label: "Tickets", href: "/tickets", badge: "New" },
  { icon: MessageSquare, label: "SMS Reports", href: "/sms-reports" },
  { icon: Sparkles, label: "What's New", href: "/whats-new" },
  { icon: Lightbulb, label: "Feature Requests", href: "/feature-requests" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

export default function Sidebar({ open, onClose }: SidebarProps) {
  const location = useLocation();
  const { user } = useAuth();

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-sidebar border-r border-sidebar-border",
          "transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0 lg:static lg:z-auto",
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
              <Zap size={16} className="text-primary" />
              <div className="absolute inset-0 rounded-lg bg-primary/5 blur-sm" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-wide text-foreground">NetAdmin</p>
              <p className="text-[10px] font-medium tracking-widest text-primary uppercase">
                Operator Portal
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? location.pathname === "/dashboard" || location.pathname === "/"
                : location.pathname.startsWith(item.href);

            return (
              <NavLink
                key={item.href}
                to={item.href}
                onClick={onClose}
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium",
                  "transition-all duration-200 cursor-pointer",
                  isActive
                    ? [
                        "bg-gradient-to-r from-primary/20 to-transparent",
                        "text-primary border-l-2 border-primary",
                        "shadow-[0_0_15px_rgba(0,200,255,0.08)]",
                      ]
                    : [
                        "text-muted-foreground border-l-2 border-transparent",
                        "hover:text-sidebar-foreground hover:bg-white/5",
                      ],
                )}
              >
                <item.icon
                  size={17}
                  className={cn(
                    "shrink-0 transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-foreground",
                  )}
                />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="rounded-full bg-primary/20 border border-primary/30 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {item.badge}
                  </span>
                )}
                {isActive && (
                  <ChevronRight size={14} className="text-primary/60 shrink-0" />
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User profile */}
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group">
            <div className="relative h-8 w-8 rounded-full bg-gradient-to-br from-primary/40 to-accent/40 border border-primary/30 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-foreground">
                {user?.profile?.name?.charAt(0)?.toUpperCase() ?? "U"}
              </span>
              <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-400 border-2 border-sidebar" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {user?.profile?.name ?? "Operator"}
              </p>
              <p className="text-[10px] text-primary font-medium tracking-wider uppercase">
                Operator Portal
              </p>
            </div>
            <ChevronRight
              size={14}
              className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0"
            />
          </div>
        </div>
      </aside>
    </>
  );
}
