import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarClock,
  CreditCard,
  Ellipsis,
  FileText,
  MessageSquare,
  Router,
  Smartphone,
  Ticket,
  Wifi,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SubscriberProfile, SubscriberProfileOutlet } from "./layout.tsx";
import { WifiSignalIcon } from "@/components/ui/wifi-status.tsx";

function useProfile() {
  return useOutletContext<SubscriberProfileOutlet>().profile;
}

function formatMoney(amount: number) {
  return `Ksh ${amount.toLocaleString()}`;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function localDateTimeValue(date: Date) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

function defaultExpiryDateTime() {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30);
  expiry.setHours(0, 0, 0, 0);
  return localDateTimeValue(expiry);
}

function expiryCountdown(value: string, now: number) {
  const remaining = Date.parse(value) - now;
  if (!Number.isFinite(remaining)) return "Invalid expiry";
  if (remaining <= 0) return "Expired";
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s left`;
}

function formatBytes(bytes: number) {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

function totalTraffic(profile: SubscriberProfile) {
  return profile.sessions.reduce(
    (totals, session) => {
      totals.download +=
        (session.inputOctets ?? 0) +
        (session.inputGigawords ?? 0) * 4_294_967_296;
      totals.upload +=
        (session.outputOctets ?? 0) +
        (session.outputGigawords ?? 0) * 4_294_967_296;
      return totals;
    },
    { download: 0, upload: 0 },
  );
}

const chartAxisStyle = {
  fontSize: 11,
  fill: "oklch(0.65 0.02 264)",
};

function UsageByDayChart({ profile }: { profile: SubscriberProfile }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - 13 + index);
    return date;
  });
  const usageByDay = new Map(
    days.map((date) => [
      date.toISOString().slice(0, 10),
      { download: 0, upload: 0 },
    ]),
  );

  for (const session of profile.sessions) {
    const startedAt = new Date(session.startTime);
    if (Number.isNaN(startedAt.getTime())) continue;
    const usage = usageByDay.get(startedAt.toISOString().slice(0, 10));
    if (!usage) continue;
    usage.download +=
      (session.inputOctets ?? 0) +
      (session.inputGigawords ?? 0) * 4_294_967_296;
    usage.upload +=
      (session.outputOctets ?? 0) +
      (session.outputGigawords ?? 0) * 4_294_967_296;
  }

  const data = days.map((date) => {
    const usage = usageByDay.get(date.toISOString().slice(0, 10))!;
    return {
      day: date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      ...usage,
    };
  });

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid
            stroke="rgba(255,255,255,0.08)"
            vertical={false}
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="day"
            tick={chartAxisStyle}
            axisLine={false}
            tickLine={false}
            minTickGap={16}
          />
          <YAxis
            tick={chartAxisStyle}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) => formatBytes(value)}
            width={64}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              borderColor: "var(--border)",
              borderRadius: 8,
            }}
            formatter={(value, name) => [
              formatBytes(Number(value ?? 0)),
              name === "download" ? "Download" : "Upload",
            ]}
          />
          <Legend />
          <Bar
            dataKey="download"
            name="Download"
            fill="oklch(0.72 0.18 220)"
            radius={[3, 3, 0, 0]}
          />
          <Bar
            dataKey="upload"
            name="Upload"
            fill="oklch(0.68 0.18 285)"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SessionDurationChart({ profile }: { profile: SubscriberProfile }) {
  const data = profile.sessions
    .filter((session) => session.sessionTime !== undefined)
    .sort((left, right) => left.startTime.localeCompare(right.startTime))
    .slice(-10)
    .map((session, index) => ({
      session: `Session ${index + 1}`,
      minutes: Math.round((session.sessionTime ?? 0) / 60),
      started: formatDate(session.startTime),
    }));

  if (!data.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent session duration</CardTitle>
        <CardDescription>
          Router-reported duration for the latest sessions, in minutes
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                stroke="rgba(255,255,255,0.08)"
                vertical={false}
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="session"
                tick={chartAxisStyle}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={chartAxisStyle}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value: number) => `${value}m`}
                width={44}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                  borderRadius: 8,
                }}
                formatter={(value) => [
                  `${Number(value ?? 0)} minutes`,
                  "Duration",
                ]}
                labelFormatter={(label, payload) =>
                  payload?.[0]?.payload?.started
                    ? `${label} · ${payload[0].payload.started}`
                    : label
                }
              />
              <Bar
                dataKey="minutes"
                name="Duration"
                fill="oklch(0.72 0.18 220)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function MonthlyAmountChart({
  title,
  description,
  data,
  series,
}: {
  title: string;
  description: string;
  data: { month: string; [key: string]: number | string }[];
  series: { key: string; label: string; color: string }[];
}) {
  if (!data.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
            >
              <CartesianGrid
                stroke="rgba(255,255,255,0.08)"
                vertical={false}
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="month"
                tick={chartAxisStyle}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={chartAxisStyle}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value: number) =>
                  `${Math.round(value / 1000)}k`
                }
                width={48}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                  borderRadius: 8,
                }}
                formatter={(value, name) => [
                  formatMoney(Number(value ?? 0)),
                  String(name),
                ]}
              />
              <Legend />
              {series.map((item) => (
                <Bar
                  key={item.key}
                  dataKey={item.key}
                  name={item.label}
                  fill={item.color}
                  radius={[3, 3, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function monthKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "2-digit",
  });
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <div className="text-muted-foreground">{icon}</div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: (string | ReactNode)[][];
  empty: string;
}) {
  if (!rows.length) {
    return (
      <EmptyState
        icon={<FileText className="size-7" />}
        title="Nothing to show yet"
        description={empty}
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              {row.map((cell, cellIndex) => (
                <TableCell key={cellIndex} className="text-sm">
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function SubscriberOverviewPage() {
  const profile = useProfile();
  const { subscriber, package: servicePackage } = profile;
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<
    | "suspend"
    | "recover"
    | "extend"
    | "setExpiry"
    | "renew"
    | "topup"
    | "adjust"
    | "sms"
    | null
  >(null);
  const [now, setNow] = useState(() => Date.now());
  const [days, setDays] = useState("7");
  const [expiryInput, setExpiryInput] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<
    "mpesa" | "cash" | "bank" | "card" | "paypal"
  >("mpesa");
  const [adjustment, setAdjustment] = useState<"credit" | "debit">("credit");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const updateStatus = useMutation(api.subscribers.updateStatus);
  const updateSubscriber = useMutation(api.subscribers.update);
  const extendService = useMutation(api.subscribers.extendService);
  const createTransaction = useMutation(api.transactions.create);
  const sendSingleSms = useMutation(api.sms.sendSingle);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const traffic = totalTraffic(profile);
  const paid = profile.invoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + invoice.amount, 0);
  const activeSessions = profile.sessions.filter(
    (session) => session.status !== "stopped",
  ).length;
  const expiry = subscriber.serviceExpiresAt
    ? Date.parse(subscriber.serviceExpiresAt)
    : null;
  const daysRemaining =
    expiry === null || !Number.isFinite(expiry)
      ? null
      : Math.ceil((expiry - now) / (24 * 60 * 60 * 1000));
  const isServiceExpired =
    expiry !== null && Number.isFinite(expiry) && expiry <= now;
  const effectiveStatus = isServiceExpired ? "expired" : subscriber.status;
  const latestInvoice = profile.invoices[0];

  const closeDialog = () => setDialog(null);
  const openExpiryDialog = () => {
    setExpiryInput(
      subscriber.serviceExpiresAt
        ? localDateTimeValue(new Date(subscriber.serviceExpiresAt))
        : defaultExpiryDateTime(),
    );
    setDialog("setExpiry");
  };
  const performStatusChange = async (status: "active" | "suspended") => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      await updateStatus({
        workspaceId,
        ids: [subscriber._id],
        status,
      });
      toast.success(
        status === "active" ? "Subscriber access restored" : "Subscriber suspended",
      );
      closeDialog();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update subscriber access",
      );
    } finally {
      setSaving(false);
    }
  };

  const submitAction = async () => {
    if (!workspaceId) return;
    if (dialog === "suspend") return performStatusChange("suspended");
    if (dialog === "recover") return performStatusChange("active");
    if (dialog === "setExpiry") {
      const selectedExpiry = new Date(expiryInput);
      if (!expiryInput || !Number.isFinite(selectedExpiry.getTime())) {
        toast.error("Set a valid service expiry date and time");
        return;
      }
      setSaving(true);
      try {
        await updateSubscriber({
          workspaceId,
          id: subscriber._id,
          serviceExpiresAt: selectedExpiry.toISOString(),
        });
        toast.success("Service expiry updated");
        closeDialog();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not update service expiry",
        );
      } finally {
        setSaving(false);
      }
      return;
    }
    if (dialog === "extend" || dialog === "renew") {
      const extensionDays = Number(days);
      if (
        dialog === "extend" &&
        (!Number.isInteger(extensionDays) || extensionDays < 1 || extensionDays > 3650)
      ) {
        toast.error("Enter a whole number of days between 1 and 3650");
        return;
      }
      setSaving(true);
      try {
        await extendService({
          workspaceId,
          id: subscriber._id,
          mode: dialog,
          ...(dialog === "extend" ? { days: extensionDays } : {}),
        });
        toast.success(
          dialog === "renew"
            ? "Service renewed for 30 days"
            : `Service extended by ${extensionDays} days`,
        );
        closeDialog();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not update service expiry",
        );
      } finally {
        setSaving(false);
      }
      return;
    }
    if (dialog === "topup" || dialog === "adjust") {
      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        toast.error("Enter an amount greater than zero");
        return;
      }
      setSaving(true);
      try {
        await createTransaction({
          workspaceId,
          subscriberId: subscriber._id,
          amount: parsedAmount,
          type:
            dialog === "topup"
              ? "credit"
              : adjustment,
          method,
          status: "completed",
          notes:
            dialog === "topup"
              ? "Subscriber wallet top-up"
              : `Manual wallet ${adjustment}`,
        });
        toast.success(
          dialog === "topup"
            ? "Wallet top-up recorded"
            : `Wallet ${adjustment} recorded`,
        );
        setAmount("");
        closeDialog();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not record wallet transaction",
        );
      } finally {
        setSaving(false);
      }
      return;
    }
    if (dialog === "sms") {
      if (!message.trim()) {
        toast.error("Enter a message");
        return;
      }
      setSaving(true);
      try {
        await sendSingleSms({
          workspaceId,
          subscriberId: subscriber._id,
          recipient: subscriber.phone,
          message: message.trim(),
          type: "custom",
        });
        toast.success("SMS logged for this subscriber");
        setMessage("");
        closeDialog();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not log subscriber SMS",
        );
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Account overview</CardTitle>
            <CardDescription>
              Service status, subscriber details, and account actions. New
              authentications receive a RADIUS Session-Timeout for the remaining
              service term. An already-active session needs the RouterOS gateway
              to receive a disconnect request when service expires.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={`border ${
                effectiveStatus === "active"
                  ? "border-green-400/30 bg-green-400/10 text-green-400"
                  : effectiveStatus === "suspended"
                    ? "border-amber-400/30 bg-amber-400/10 text-amber-400"
                    : effectiveStatus === "expired"
                      ? "border-red-400/30 bg-red-400/10 text-red-400"
                      : "border-blue-400/30 bg-blue-400/10 text-blue-400"
              }`}
            >
              {effectiveStatus}
            </Badge>
            {effectiveStatus === "active" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialog("suspend")}
              >
                Suspend
              </Button>
            ) : isServiceExpired ? (
              <Button size="sm" onClick={() => setDialog("renew")}>
                {subscriber.status === "suspended"
                  ? "Renew service"
                  : "Renew to restore"}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setDialog("recover")}>
                Recover access
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog("extend")}
            >
              <CalendarClock className="mr-1.5 size-4" /> Extend time
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openExpiryDialog}
            >
              Set expiry
            </Button>
            <Button size="sm" onClick={() => setDialog("renew")}>
              Renew 30 days
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More account actions">
                  <Ellipsis className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-card">
                <DropdownMenuItem onClick={() => setDialog("topup")}>
                  Top up wallet
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDialog("adjust")}>
                  Adjust wallet
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDialog("sms")}>
                  Send SMS
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    navigate(`/subscribers/${subscriber._id}/invoices`)
                  }
                >
                  View invoices
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2 xl:grid-cols-4">
          {isServiceExpired && activeSessions > 0 && (
            <div
              role="alert"
              className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200 sm:col-span-2 xl:col-span-4"
            >
              Service has expired, but RADIUS accounting still reports a live
              session. Expiry blocks new logins; verify the RouterOS API-SSL
              gateway operation to terminate this existing session.
            </div>
          )}
          <Detail label="Phone" value={subscriber.phone} />
          <Detail label="Account ID" value={subscriber._id} />
          <Detail label="Plan" value={servicePackage?.name} />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Service expires</p>
            <p className="text-sm font-medium text-foreground">
              {subscriber.serviceExpiresAt
                ? formatDate(subscriber.serviceExpiresAt)
                : "Not set"}
            </p>
            {daysRemaining !== null && (
              <p
                className={`text-xs ${
                  daysRemaining < 0
                    ? "text-red-400"
                    : daysRemaining <= 7
                      ? "text-amber-400"
                      : "text-muted-foreground"
                }`}
              >
                {daysRemaining < 0
                  ? `Expired ${Math.abs(daysRemaining)} day(s) ago`
                  : expiryCountdown(subscriber.serviceExpiresAt!, now)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog("topup")}
            >
              <CreditCard className="mr-1.5 size-4" /> Top up
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog("adjust")}
            >
              Adjust wallet
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog("sms")}
            >
              <MessageSquare className="mr-1.5 size-4" /> Send SMS
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate(`/subscribers/${subscriber._id}/invoices`)
              }
            >
              <FileText className="mr-1.5 size-4" />
              {latestInvoice ? "View invoice history" : "View invoices"}
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Monthly fee"
          value={formatMoney(subscriber.monthlyFee)}
        />
        <SummaryCard
          label="Account balance"
          value={formatMoney(subscriber.balance)}
        />
        <SummaryCard label="Active sessions" value={String(activeSessions)} />
        <SummaryCard label="Paid invoices" value={formatMoney(paid)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Subscriber information</CardTitle>
            <CardDescription>Contact and service details</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Detail label="Phone" value={subscriber.phone} />
            <Detail label="Email" value={subscriber.email} />
            <Detail label="Address" value={subscriber.address} />
            <Detail label="Created" value={formatDate(subscriber.createdAt)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Service overview</CardTitle>
            <CardDescription>
              Assigned package and access details
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Detail
              label="Connection"
              value={subscriber.connectionType.toUpperCase()}
            />
            <Detail label="Package" value={servicePackage?.name} />
            <Detail label="Package speed" value={servicePackage?.speed} />
            <Detail label="Assigned IP" value={subscriber.ipAddress} />
            <Detail
              label="Download usage"
              value={formatBytes(traffic.download)}
            />
            <Detail label="Upload usage" value={formatBytes(traffic.upload)} />
          </CardContent>
        </Card>
      </div>
      {subscriber.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
            {subscriber.notes}
          </CardContent>
        </Card>
      )}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent className="max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {dialog === "suspend"
                ? "Suspend subscriber"
                : dialog === "recover"
                  ? "Recover access"
                  : dialog === "extend"
                    ? "Extend service time"
                      : dialog === "setExpiry"
                        ? "Set service expiry"
                      : dialog === "renew"
                      ? "Renew service"
                      : dialog === "topup"
                        ? "Top up wallet"
                        : dialog === "adjust"
                          ? "Adjust wallet"
                          : "Send SMS"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "renew"
                ? "Adds 30 days from the later of today or the current expiry. No payment is recorded."
                : dialog === "suspend"
                  ? "The subscriber will be marked suspended and future RADIUS authentication will be rejected."
                  : dialog === "recover"
                    ? "Restore the subscriber to active status. A valid service package and credentials are required."
                    : dialog === "topup" || dialog === "adjust"
                      ? `Current wallet balance: ${formatMoney(subscriber.balance)}. Completed transactions update the balance and transaction history.`
                      : dialog === "extend"
                        ? "Adds the selected number of days from the later of today or the current expiry."
                            : dialog === "setExpiry"
                              ? "Choose the exact date and time access should expire. The new-subscriber default is midnight, 30 days from today."
                            : `This message will be logged for ${subscriber.phone}.`}
            </DialogDescription>
          </DialogHeader>
          {dialog === "extend" && (
            <div className="space-y-2">
              <Label htmlFor="service-extension-days">Days to add</Label>
              <Input
                id="service-extension-days"
                type="number"
                min="1"
                max="3650"
                step="1"
                value={days}
                onChange={(event) => setDays(event.target.value)}
                className="bg-background"
              />
            </div>
          )}
          {dialog === "setExpiry" && (
            <div className="space-y-2">
              <Label htmlFor="profile-service-expiry">Expiry date and time</Label>
              <Input
                id="profile-service-expiry"
                type="datetime-local"
                step="60"
                value={expiryInput}
                onChange={(event) => setExpiryInput(event.target.value)}
                className="bg-background"
              />
              <p className="text-xs text-muted-foreground">
                Uses your local timezone. A session already active when you
                change this expiry keeps the timeout it received at login.
              </p>
            </div>
          )}
          {(dialog === "topup" || dialog === "adjust") && (
            <div className="space-y-4">
              {dialog === "adjust" && (
                <div className="space-y-2">
                  <Label>Adjustment</Label>
                  <Select
                    value={adjustment}
                    onValueChange={(value) =>
                      setAdjustment(value as "credit" | "debit")
                    }
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card">
                      <SelectItem value="credit">Add credit</SelectItem>
                      <SelectItem value="debit">Deduct debit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="wallet-amount">Amount (Ksh)</Label>
                <Input
                  id="wallet-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label>Method</Label>
                <Select
                  value={method}
                  onValueChange={(value) =>
                    setMethod(value as typeof method)
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card">
                    <SelectItem value="mpesa">M-Pesa</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank transfer</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="paypal">PayPal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {dialog === "sms" && (
            <div className="space-y-2">
              <Label htmlFor="subscriber-sms-message">Message</Label>
              <Textarea
                id="subscriber-sms-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={1000}
                rows={5}
                className="resize-none bg-background"
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={closeDialog}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={() => void submitAction()} disabled={saving}>
              {saving
                ? "Saving..."
                : dialog === "suspend"
                  ? "Suspend"
                  : dialog === "recover"
                    ? "Restore access"
                    : dialog === "extend"
                      ? "Extend service"
                      : dialog === "setExpiry"
                        ? "Save expiry"
                      : dialog === "renew"
                        ? "Renew 30 days"
                        : dialog === "topup"
                          ? "Record top-up"
                          : dialog === "adjust"
                            ? "Record adjustment"
                            : "Log SMS"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SubscriberRouterAccountsPage() {
  const { subscriber, package: servicePackage } = useProfile();
  const username =
    subscriber.connectionType === "pppoe"
      ? subscriber.pppoeUsername
      : subscriber.connectionType === "hotspot"
        ? subscriber.hotspotUsername
        : undefined;

  if (!username) {
    return (
      <EmptyState
        icon={<Router className="size-7" />}
        title="No router account configured"
        description="This subscriber does not currently have an app-managed PPPoE or Hotspot username."
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Router account</CardTitle>
        <CardDescription>
          Account credentials are protected and passwords are never displayed
          here.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="Username" value={username} />
        <Detail
          label="Service type"
          value={subscriber.connectionType.toUpperCase()}
        />
        <Detail
          label="Account status"
          value={subscriber.status.toUpperCase()}
        />
        <Detail label="Package" value={servicePackage?.name} />
        <Detail label="Assigned IP" value={subscriber.ipAddress} />
        <Detail label="Last online" value={formatDate(subscriber.lastSeen)} />
      </CardContent>
    </Card>
  );
}

export function SubscriberSessionsPage() {
  const profile = useProfile();
  return (
    <div className="space-y-4">
      <SessionDurationChart profile={profile} />
      <DataTable
        headers={[
          "Started",
          "Service",
          "IP address",
          "Duration",
          "Traffic",
          "Status",
        ]}
        rows={profile.sessions.map((session) => [
          formatDate(session.startTime),
          session.connectionType.toUpperCase(),
          session.framedIpAddress ?? "—",
          session.sessionTime === undefined ? "—" : `${session.sessionTime}s`,
          `${formatBytes((session.inputOctets ?? 0) + (session.inputGigawords ?? 0) * 4_294_967_296)} down · ${formatBytes((session.outputOctets ?? 0) + (session.outputGigawords ?? 0) * 4_294_967_296)} up`,
          <Badge
            key={session._id}
            variant={session.status === "stopped" ? "secondary" : "default"}
          >
            {session.status === "stopped" ? (
              <WifiSignalIcon status="offline" className="mr-1 size-3" />
            ) : (
              <WifiSignalIcon status="online" className="mr-1 size-3" />
            )}
            {session.status === "interim" ? "Active" : session.status}
          </Badge>,
        ])}
        empty="Router-reported sessions for this subscriber will appear here."
      />
    </div>
  );
}

export function SubscriberPaymentsPage() {
  const profile = useProfile();
  const payments = profile.transactions.filter(
    (transaction) =>
      transaction.type === "payment" || transaction.type === "refund",
  );
  const monthlyTotals = new Map<
    string,
    { month: string; payments: number; refunds: number }
  >();
  for (const payment of payments) {
    if (payment.status !== "completed") continue;
    const key = monthKey(payment.createdAt);
    if (!key) continue;
    const totals = monthlyTotals.get(key) ?? {
      month: monthLabel(key),
      payments: 0,
      refunds: 0,
    };
    if (payment.type === "payment") totals.payments += payment.amount;
    else totals.refunds += Math.abs(payment.amount);
    monthlyTotals.set(key, totals);
  }
  const chartData = [...monthlyTotals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, totals]) => totals);

  return (
    <div className="space-y-4">
      <MonthlyAmountChart
        title="Monthly payments and refunds"
        description="Completed amounts among the latest 100 transaction records, grouped by transaction date"
        data={chartData}
        series={[
          {
            key: "payments",
            label: "Payments",
            color: "oklch(0.72 0.18 220)",
          },
          {
            key: "refunds",
            label: "Refunds",
            color: "oklch(0.68 0.18 35)",
          },
        ]}
      />
      <DataTable
        headers={["Date", "Type", "Method", "Reference", "Amount", "Status"]}
        rows={payments.map((payment) => [
          formatDate(payment.createdAt),
          payment.type,
          payment.method.toUpperCase(),
          payment.reference ?? "—",
          formatMoney(payment.amount),
          <Badge
            key={payment._id}
            variant={payment.status === "completed" ? "default" : "secondary"}
          >
            {payment.status}
          </Badge>,
        ])}
        empty="Payments and refunds linked to this subscriber will appear here."
      />
    </div>
  );
}

export function SubscriberInvoicesPage() {
  const profile = useProfile();
  const monthlyTotals = new Map<
    string,
    { month: string; paid: number; outstanding: number }
  >();
  for (const invoice of profile.invoices) {
    if (invoice.status === "cancelled") continue;
    const key = monthKey(invoice.createdAt);
    if (!key) continue;
    const totals = monthlyTotals.get(key) ?? {
      month: monthLabel(key),
      paid: 0,
      outstanding: 0,
    };
    if (invoice.status === "paid") totals.paid += invoice.amount;
    else totals.outstanding += invoice.amount;
    monthlyTotals.set(key, totals);
  }
  const chartData = [...monthlyTotals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, totals]) => totals);

  return (
    <div className="space-y-4">
      <MonthlyAmountChart
        title="Monthly invoice amounts"
        description="Amounts among the latest 100 invoices, grouped by creation month and payment status; cancelled invoices are excluded"
        data={chartData}
        series={[
          {
            key: "paid",
            label: "Paid",
            color: "oklch(0.72 0.18 150)",
          },
          {
            key: "outstanding",
            label: "Outstanding",
            color: "oklch(0.76 0.16 80)",
          },
        ]}
      />
      <DataTable
        headers={[
          "Invoice",
          "Description",
          "Created",
          "Due date",
          "Amount",
          "Status",
        ]}
        rows={profile.invoices.map((invoice) => [
          invoice.invoiceNumber,
          invoice.description,
          formatDate(invoice.createdAt),
          formatDate(invoice.dueDate),
          formatMoney(invoice.amount),
          <Badge
            key={invoice._id}
            variant={invoice.status === "paid" ? "default" : "secondary"}
          >
            {invoice.status}
          </Badge>,
        ])}
        empty="Invoices generated for this subscriber will appear here."
      />
    </div>
  );
}

export function SubscriberSmsPage() {
  const profile = useProfile();
  return (
    <DataTable
      headers={["Sent", "Type", "Message", "Recipient", "Status"]}
      rows={profile.smsLogs.map((sms) => [
        formatDate(sms.sentAt),
        sms.type,
        <span key={sms._id} className="block max-w-lg truncate">
          {sms.message}
        </span>,
        sms.recipient,
        <Badge
          key={sms._id}
          variant={sms.status === "sent" ? "default" : "secondary"}
        >
          {sms.status}
        </Badge>,
      ])}
      empty="Messages sent to this subscriber will appear here."
    />
  );
}

export function SubscriberUsageAnalyticsPage() {
  const profile = useProfile();
  const traffic = totalTraffic(profile);
  const liveCount = profile.sessions.filter(
    (session) => session.status !== "stopped",
  ).length;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Download"
          value={formatBytes(traffic.download)}
          icon={<ArrowDownToLine className="size-4 text-cyan-400" />}
        />
        <SummaryCard
          label="Upload"
          value={formatBytes(traffic.upload)}
          icon={<ArrowUpFromLine className="size-4 text-primary" />}
        />
        <SummaryCard
          label="Live sessions"
          value={String(liveCount)}
          icon={<Activity className="size-4 text-green-400" />}
        />
      </div>
      {profile.sessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Daily reported usage</CardTitle>
            <CardDescription>
              Download and upload totals by session start date over the last 14
              days from up to 100 recent session records. This is RADIUS session
              accounting, not live bandwidth.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UsageByDayChart profile={profile} />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Usage data</CardTitle>
          <CardDescription>
            Traffic totals are based on RADIUS accounting records received for
            this subscriber.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {profile.sessions.length
            ? `Showing totals from ${profile.sessions.length} recorded sessions.`
            : "Usage will be available after the router reports accounting updates."}
        </CardContent>
      </Card>
    </div>
  );
}

export function SubscriberDevicesPage() {
  const profile = useProfile();
  const { subscriber, sessions } = profile;
  const observedMacs = [
    ...new Set(
      sessions.map((session) => session.callingStationId).filter(Boolean),
    ),
  ];
  if (
    !subscriber.ipAddress &&
    !subscriber.macAddress &&
    observedMacs.length === 0
  ) {
    return (
      <EmptyState
        icon={<Smartphone className="size-7" />}
        title="No device details recorded"
        description="An assigned IP or MAC address and router-reported device identifiers will appear here when available."
      />
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Assigned device</CardTitle>
          <CardDescription>
            Subscriber network address information
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Detail label="Assigned IP address" value={subscriber.ipAddress} />
          <Detail
            label="Registered MAC address"
            value={subscriber.macAddress}
          />
          <Detail label="Subscriber address" value={subscriber.address} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Observed client identifiers</CardTitle>
          <CardDescription>
            Calling-Station-Id values reported by the router
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {observedMacs.length ? (
            observedMacs.map((mac) => (
              <div key={mac} className="flex items-center gap-2 text-sm">
                <Smartphone className="size-4 text-muted-foreground" /> {mac}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No client identifiers reported.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function SubscriberTicketsPage() {
  const profile = useProfile();
  return (
    <DataTable
      headers={[
        "Created",
        "Subject",
        "Category",
        "Priority",
        "Status",
        "Assigned to",
      ]}
      rows={profile.tickets.map((ticket) => [
        formatDate(ticket.createdAt),
        ticket.title,
        ticket.category,
        <Badge
          key={`${ticket._id}-priority`}
          variant={
            ticket.priority === "critical" || ticket.priority === "high"
              ? "destructive"
              : "secondary"
          }
        >
          {ticket.priority}
        </Badge>,
        ticket.status.replace("_", " "),
        ticket.assignedTo ?? "—",
      ])}
      empty="Support tickets linked to this subscriber will appear here."
    />
  );
}

export function SubscriberActivitiesPage() {
  const profile = useProfile();
  const events = [
    ...profile.invoices.map((record) => ({
      key: `invoice-${record._id}`,
      at: record.createdAt,
      title: `Invoice ${record.invoiceNumber} ${record.status}`,
      detail: `${record.description} · ${formatMoney(record.amount)}`,
      icon: <FileText className="size-4" />,
    })),
    ...profile.transactions.map((record) => ({
      key: `transaction-${record._id}`,
      at: record.createdAt,
      title: `${record.type} ${record.status}`,
      detail: `${record.method.toUpperCase()} · ${formatMoney(record.amount)}${record.reference ? ` · ${record.reference}` : ""}`,
      icon: <CreditCard className="size-4" />,
    })),
    ...profile.tickets.map((record) => ({
      key: `ticket-${record._id}`,
      at: record.createdAt,
      title: `Support ticket: ${record.title}`,
      detail: `${record.category} · ${record.status.replace("_", " ")}`,
      icon: <Ticket className="size-4" />,
    })),
    ...profile.smsLogs.map((record) => ({
      key: `sms-${record._id}`,
      at: record.sentAt,
      title: `SMS ${record.status}`,
      detail: `${record.type} · ${record.message}`,
      icon: <MessageSquare className="size-4" />,
    })),
    ...profile.sessions.map((record) => ({
      key: `session-${record._id}`,
      at: record.stopTime ?? record.startTime,
      title: `Router session ${record.status === "stopped" ? "ended" : "updated"}`,
      detail: `${record.connectionType.toUpperCase()} · ${record.framedIpAddress ?? "No IP recorded"}`,
      icon: <Wifi className="size-4" />,
    })),
  ].sort((left, right) => right.at.localeCompare(left.at));

  if (!events.length) {
    return (
      <EmptyState
        icon={<Activity className="size-7" />}
        title="No activity recorded"
        description="Billing, support, messaging, and router activity will appear here as it occurs."
      />
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscriber activity</CardTitle>
        <CardDescription>
          Recent events across billing, support, SMS, and network sessions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {events.map((event) => (
          <div
            key={event.key}
            className="flex gap-3 border-l border-border py-3 pl-4"
          >
            <span className="mt-0.5 text-primary">{event.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {event.title}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {event.detail}
              </p>
            </div>
            <time className="shrink-0 text-right text-xs text-muted-foreground">
              {formatDate(event.at)}
            </time>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-medium text-foreground">
        {value || "—"}
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 py-5">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-xl font-bold text-foreground">
            {value}
          </p>
        </div>
        {icon && <div>{icon}</div>}
      </CardContent>
    </Card>
  );
}
