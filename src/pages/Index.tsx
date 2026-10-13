import { Link } from "react-router-dom";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { motion } from "motion/react";
import {
  Zap,
  Users,
  TrendingUp,
  Network,
  TicketCheck,
  MessageSquare,
  Shield,
  ArrowRight,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

const features = [
  {
    icon: Users,
    title: "Subscriber Management",
    description: "Manage PPPoE, Hotspot, and Static subscribers with full billing automation.",
    color: "text-cyan-400",
    bg: "bg-cyan-400/10 border-cyan-400/20",
  },
  {
    icon: TrendingUp,
    title: "Financial Reporting",
    description: "Real-time revenue dashboards, invoice generation, and payment tracking.",
    color: "text-green-400",
    bg: "bg-green-400/10 border-green-400/20",
  },
  {
    icon: Network,
    title: "Network Monitoring",
    description: "Monitor all devices, bandwidth usage, and uptime from one place.",
    color: "text-primary",
    bg: "bg-primary/10 border-primary/20",
  },
  {
    icon: MessageSquare,
    title: "SMS Automation",
    description: "Automated payment reminders, invoices, and bulk messaging campaigns.",
    color: "text-indigo-400",
    bg: "bg-indigo-400/10 border-indigo-400/20",
  },
  {
    icon: TicketCheck,
    title: "Support Tickets",
    description: "Full helpdesk system with SLA tracking and subscriber self-service.",
    color: "text-violet-400",
    bg: "bg-violet-400/10 border-violet-400/20",
  },
  {
    icon: Shield,
    title: "Role-Based Access",
    description: "Admin, staff and operator roles with granular permission controls.",
    color: "text-amber-400",
    bg: "bg-amber-400/10 border-amber-400/20",
  },
];

const stats = [
  { value: "99.9%", label: "Uptime SLA" },
  { value: "< 1s", label: "Real-time Updates" },
  { value: "M-Pesa", label: "Payment Support" },
  { value: "24/7", label: "System Monitoring" },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Background grid effect */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(oklch(0.78 0.16 195) 1px, transparent 1px), linear-gradient(90deg, oklch(0.78 0.16 195) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Navbar */}
      <nav className="relative z-10 flex h-16 items-center justify-between px-6 lg:px-12 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
            <Zap size={16} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold tracking-wide text-foreground">NetAdmin</p>
            <p className="text-[9px] font-semibold tracking-widest text-primary uppercase">
              Operator Portal
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <AuthLoading>
            <div className="h-8 w-20 rounded-lg bg-card animate-pulse" />
          </AuthLoading>
          <Unauthenticated>
            <SignInButton />
          </Unauthenticated>
          <Authenticated>
            <Button asChild size="sm" className="gap-2">
              <Link to="/dashboard">
                Go to Dashboard
                <ArrowRight size={14} />
              </Link>
            </Button>
          </Authenticated>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 px-6 lg:px-12 pt-24 pb-16 text-center max-w-4xl mx-auto">
        {/* Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-64 w-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary">
            <Activity size={12} className="animate-pulse" />
            ISP &amp; Network Operator Platform
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-balance leading-[1.1]">
            <span className="text-foreground">Manage your ISP</span>
            <br />
            <span className="bg-gradient-to-r from-primary via-cyan-300 to-accent bg-clip-text text-transparent">
              with total control
            </span>
          </h1>

          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto text-balance leading-relaxed">
            The all-in-one operator portal for ISPs — subscriber billing, network monitoring,
            M-Pesa payments, SMS automation, and support tickets in one powerful dashboard.
          </p>

          <div className="flex items-center justify-center gap-4 pt-2">
            <Unauthenticated>
              <SignInButton />
            </Unauthenticated>
            <Authenticated>
              <Button asChild size="lg" className="gap-2 px-6">
                <Link to="/dashboard">
                  Open Dashboard
                  <ArrowRight size={16} />
                </Link>
              </Button>
            </Authenticated>
            <Button variant="ghost" size="lg" className="text-muted-foreground hover:text-foreground gap-2">
              View Demo
              <ArrowRight size={14} />
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Stats bar */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="relative z-10 mx-6 lg:mx-12 max-w-4xl lg:mx-auto mb-16"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-border bg-card p-4 text-center hover:border-primary/30 transition-colors"
            >
              <p className="text-xl font-bold text-primary">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Features */}
      <section className="relative z-10 px-6 lg:px-12 pb-24 max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
            Everything you need to run your ISP
          </h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-lg mx-auto">
            Purpose-built for network operators — from solo ISPs to large enterprises.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 * i }}
              className="group rounded-xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-[0_0_20px_rgba(0,200,255,0.05)] transition-all duration-300"
            >
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border ${feature.bg} mb-3`}>
                <feature.icon size={18} className={feature.color} />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">{feature.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border px-6 lg:px-12 py-6 text-center">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} NetAdmin Operator Portal. Built for ISPs.
        </p>
      </footer>
    </div>
  );
}
