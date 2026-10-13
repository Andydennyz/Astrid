import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";

const TEMPLATES = [
  {
    label: "Invoice Due",
    text: "Dear subscriber, your internet invoice of Ksh {amount} is due on {date}. Please pay promptly to avoid suspension. Thank you.",
  },
  {
    label: "Payment Received",
    text: "Dear {name}, we have received your payment of Ksh {amount}. Your internet service is active. Thank you!",
  },
  {
    label: "Account Suspended",
    text: "Dear subscriber, your internet account has been suspended due to non-payment. Please contact us to restore service.",
  },
  {
    label: "Service Restored",
    text: "Dear {name}, your internet service has been restored. Enjoy browsing!",
  },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function SendSmsDialog({ open, onClose }: Props) {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [tab, setTab] = useState<"bulk" | "single">("bulk");
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkTarget, setBulkTarget] = useState<
    "all" | "active" | "suspended" | "expired" | "pending"
  >("active");
  const [bulkType, setBulkType] = useState<"custom" | "invoice" | "reminder" | "system">("custom");

  const [singleRecipient, setSingleRecipient] = useState("");
  const [singleMessage, setSingleMessage] = useState("");
  const [singleType, setSingleType] = useState<"custom" | "invoice" | "reminder" | "system">("custom");
  const [singleSubId, setSingleSubId] = useState("none");

  const [sending, setSending] = useState(false);

  const sendBulk = useMutation(api.sms.sendBulk);
  const sendSingle = useMutation(api.sms.sendSingle);
  const subscribers = useQuery(
    api.tickets.getSubscribersList,
    workspaceId ? { workspaceId } : "skip",
  );

  const handleBulkSend = async () => {
    if (!bulkMessage.trim()) return toast.error("Message cannot be empty");
    if (!workspaceId) return;
    setSending(true);
    try {
      const count = await sendBulk({
        workspaceId,
        message: bulkMessage.trim(),
        type: bulkType,
        targetGroup: bulkTarget,
      });
      toast.success(`Sent to ${count} subscriber(s)`);
      setBulkMessage("");
      onClose();
    } catch {
      toast.error("Failed to send SMS");
    } finally {
      setSending(false);
    }
  };

  const handleSingleSend = async () => {
    if (!singleRecipient.trim()) return toast.error("Recipient number is required");
    if (!singleMessage.trim()) return toast.error("Message cannot be empty");
    if (!workspaceId) return;
    setSending(true);
    try {
      await sendSingle({
        workspaceId,
        recipient: singleRecipient.trim(),
        message: singleMessage.trim(),
        type: singleType,
        subscriberId: singleSubId !== "none" ? (singleSubId as Id<"subscribers">) : undefined,
      });
      toast.success("SMS sent");
      setSingleRecipient("");
      setSingleMessage("");
      onClose();
    } catch {
      toast.error("Failed to send SMS");
    } finally {
      setSending(false);
    }
  };

  const charCount = tab === "bulk" ? bulkMessage.length : singleMessage.length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Send SMS</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "bulk" | "single")}>
          <TabsList className="grid grid-cols-2 bg-background/60 border border-border w-full mb-4">
            <TabsTrigger value="bulk" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              Bulk SMS
            </TabsTrigger>
            <TabsTrigger value="single" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              Single SMS
            </TabsTrigger>
          </TabsList>

          {/* BULK */}
          <TabsContent value="bulk" className="space-y-4 mt-0">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Target Group</Label>
                <Select
                  value={bulkTarget}
                  onValueChange={(value) =>
                    setBulkTarget(
                      value as "all" | "active" | "suspended" | "expired" | "pending",
                    )
                  }
                >
                  <SelectTrigger className="bg-background border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="all">All Subscribers</SelectItem>
                    <SelectItem value="active">Active Only</SelectItem>
                    <SelectItem value="suspended">Suspended Only</SelectItem>
                    <SelectItem value="expired">Expired Only</SelectItem>
                    <SelectItem value="pending">Pending Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">SMS Type</Label>
                <Select value={bulkType} onValueChange={(v) => setBulkType(v as typeof bulkType)}>
                  <SelectTrigger className="bg-background border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="custom">Custom</SelectItem>
                    <SelectItem value="invoice">Invoice</SelectItem>
                    <SelectItem value="reminder">Reminder</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Templates */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Quick Templates</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => setBulkMessage(t.text)}
                    className="text-left px-2.5 py-2 rounded-lg border border-border bg-background/40 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                  >
                    <p className="text-[10px] font-medium text-foreground">{t.label}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Message</Label>
                <span className={`text-[10px] ${charCount > 160 ? "text-red-400" : "text-muted-foreground"}`}>
                  {charCount}/160
                </span>
              </div>
              <Textarea
                placeholder="Type your SMS message..."
                value={bulkMessage}
                onChange={(e) => setBulkMessage(e.target.value)}
                rows={4}
                className="bg-background border-border text-foreground resize-none"
              />
            </div>
          </TabsContent>

          {/* SINGLE */}
          <TabsContent value="single" className="space-y-4 mt-0">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Recipient Number *</Label>
              <Input
                placeholder="0712345678"
                value={singleRecipient}
                onChange={(e) => setSingleRecipient(e.target.value)}
                className="bg-background border-border text-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Link to Subscriber</Label>
              <Select value={singleSubId} onValueChange={(v) => {
                setSingleSubId(v);
                if (v !== "none") {
                  const sub = (subscribers ?? []).find((s) => s._id === v);
                  if (sub) setSingleRecipient(sub.phone);
                }
              }}>
                <SelectTrigger className="bg-background border-border text-foreground">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border max-h-48">
                  <SelectItem value="none">None</SelectItem>
                  {(subscribers ?? []).map((sub) => (
                    <SelectItem key={sub._id} value={sub._id}>
                      {sub.name} — {sub.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">SMS Type</Label>
                <Select value={singleType} onValueChange={(v) => setSingleType(v as typeof singleType)}>
                  <SelectTrigger className="bg-background border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="custom">Custom</SelectItem>
                    <SelectItem value="invoice">Invoice</SelectItem>
                    <SelectItem value="reminder">Reminder</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Message *</Label>
                <span className={`text-[10px] ${charCount > 160 ? "text-red-400" : "text-muted-foreground"}`}>
                  {charCount}/160
                </span>
              </div>
              <Textarea
                placeholder="Type your SMS message..."
                value={singleMessage}
                onChange={(e) => setSingleMessage(e.target.value)}
                rows={4}
                className="bg-background border-border text-foreground resize-none"
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button
            onClick={tab === "bulk" ? handleBulkSend : handleSingleSend}
            disabled={sending}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
          >
            {sending ? "Sending..." : tab === "bulk" ? "Send Bulk SMS" : "Send SMS"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
