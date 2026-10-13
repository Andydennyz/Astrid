import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { toast } from "sonner";
import { Bell, Mail, MessageSquare, Save, AlertTriangle, CreditCard, Users, Wifi } from "lucide-react";

type Rule = {
  id: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  description: string;
  sms: boolean;
  inApp: boolean;
};

const DEFAULT_RULES: Rule[] = [
  { id: "new_subscriber", icon: Users, label: "New Subscriber", description: "When a new subscriber registers", sms: false, inApp: true },
  { id: "payment_received", icon: CreditCard, label: "Payment Received", description: "When an M-Pesa or manual payment is logged", sms: false, inApp: true },
  { id: "invoice_overdue", icon: AlertTriangle, label: "Invoice Overdue", description: "When an invoice passes its due date", sms: true, inApp: true },
  { id: "subscriber_suspended", icon: Users, label: "Subscriber Suspended", description: "When a subscriber is suspended", sms: false, inApp: true },
  { id: "device_offline", icon: Wifi, label: "Network Device Offline", description: "When a monitored device goes offline", sms: false, inApp: true },
  { id: "ticket_created", icon: Bell, label: "New Support Ticket", description: "When a new ticket is opened", sms: false, inApp: true },
  { id: "bulk_sms_sent", icon: MessageSquare, label: "Bulk SMS Campaign", description: "After a bulk SMS is dispatched", sms: false, inApp: true },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors cursor-pointer ${
        checked ? "bg-primary border-primary/60" : "bg-muted border-border"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function NotificationsTab() {
  const [rules, setRules] = useState<Rule[]>(DEFAULT_RULES);
  const [saving, setSaving] = useState(false);

  const toggle = (id: string, field: "sms" | "inApp") => {
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, [field]: !r[field] } : r));
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    toast.success("Notification preferences saved");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
              <Bell size={17} className="text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-base">Notification Rules</CardTitle>
              <CardDescription className="text-xs">Choose when and how you receive alerts</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-0">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 pb-2 mb-1 border-b border-border/40">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Event</span>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 w-16 justify-center"><MessageSquare size={10} />SMS</span>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 w-16 justify-center"><Bell size={10} />In-App</span>
          </div>

          {rules.map((rule) => (
            <div
              key={rule.id}
              className="grid grid-cols-[1fr_auto_auto] gap-4 py-3 border-b border-border/30 last:border-0 items-center"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-7 w-7 rounded-md bg-background border border-border flex items-center justify-center shrink-0">
                  <rule.icon size={13} className="text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{rule.label}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{rule.description}</p>
                </div>
              </div>
              <div className="w-16 flex justify-center">
                <Toggle checked={rule.sms} onChange={(v) => toggle(rule.id, "sms")} />
              </div>
              <div className="w-16 flex justify-center">
                <Toggle checked={rule.inApp} onChange={(v) => toggle(rule.id, "inApp")} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Email digest placeholder */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-400/10 border border-indigo-400/20 flex items-center justify-center">
              <Mail size={17} className="text-indigo-400" />
            </div>
            <div>
              <CardTitle className="text-base">Email Digest</CardTitle>
              <CardDescription className="text-xs">Periodic summaries sent to your inbox</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Daily Summary</p>
              <p className="text-[11px] text-muted-foreground">Revenue, new subscribers and overdue invoices</p>
            </div>
            <Toggle checked={true} onChange={() => {}} />
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={handleSave}
        disabled={saving}
        size="sm"
        className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2"
      >
        <Save size={13} />
        {saving ? "Saving..." : "Save Preferences"}
      </Button>
    </div>
  );
}
