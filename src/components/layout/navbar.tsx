import { Menu, ExternalLink, Sun, Moon, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Authenticated, Unauthenticated } from "convex/react";
import { useAuth } from "@/hooks/use-auth.ts";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils.ts";
import { useState } from "react";
import NotificationsBell from "./notifications-bell.tsx";
import { WorkspacePicker } from "./workspace-control.tsx";

type NavbarProps = {
  onMenuToggle: () => void;
  title?: string;
};

export default function Navbar({ onMenuToggle, title = "Dashboard" }: NavbarProps) {
  const { removeUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      window.location.reload();
    }, 300);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 backdrop-blur-md px-4 lg:px-6">
      {/* Menu toggle (mobile) */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
      >
        <Menu size={20} />
      </button>

      {/* Page title */}
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold tracking-tight text-foreground hidden lg:block">
          {title}
        </h1>
        <div className="hidden lg:block h-4 w-px bg-border mx-1" />
        <span className="text-xs text-muted-foreground hidden lg:block">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </span>
      </div>

      <Authenticated>
        <WorkspacePicker />
      </Authenticated>

      <div className="flex-1" />

      {/* Search bar */}
      <div className="hidden md:flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5 w-56 group focus-within:border-primary/50 transition-colors">
        <Search size={14} className="text-muted-foreground" />
        <input
          placeholder="Search..."
          className="text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground w-full"
        />
      </div>

      {/* Client portal link */}
      <Button
        variant="ghost"
        size="sm"
        className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        asChild
      >
        <a href="#" target="_blank" rel="noopener noreferrer">
          <ExternalLink size={13} />
          Client Portal
        </a>
      </Button>

      {/* SMS Balance */}
      <div className="hidden md:flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5">
        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
        <span className="text-xs text-muted-foreground">SMS Bal:</span>
        <span className="text-xs font-semibold text-foreground">Ksh 0</span>
      </div>

      {/* Notifications */}
      <Authenticated>
        <NotificationsBell />
      </Authenticated>

      {/* Theme toggle */}
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
      >
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {/* Refresh */}
      <button
        onClick={handleRefresh}
        className="rounded-lg p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
      >
        <RefreshCw
          size={17}
          className={cn("transition-transform duration-500", isRefreshing && "animate-spin")}
        />
      </button>

      {/* Auth */}
      <Unauthenticated>
        <SignInButton />
      </Unauthenticated>
      <Authenticated>
        <button
          onClick={() => removeUser()}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-md hover:bg-destructive/10"
        >
          Sign out
        </button>
      </Authenticated>
    </header>
  );
}
