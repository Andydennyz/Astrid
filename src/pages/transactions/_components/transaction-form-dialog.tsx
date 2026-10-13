import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { toast } from "sonner";

type FormData = {
  subscriberId: string;
  invoiceId: string;
  amount: string;
  type: "payment" | "refund" | "credit" | "debit";
  method: "mpesa" | "cash" | "bank" | "card" | "paypal";
  reference: string;
  status: "completed" | "pending" | "failed";
  notes: string;
};

const DEFAULT: FormData = {
  subscriberId: "none",
  invoiceId: "none",
  amount: "",
  type: "payment",
  method: "mpesa",
  reference: "",
  status: "completed",
  notes: "",
};

type Props = {
  open: boolean;
  onClose: () => void;
  prefillSubscriberId?: Id<"subscribers"> | null;
};

export default function TransactionFormDialog({ open, onClose, prefillSubscriberId }: Props) {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [form, setForm] = useState<FormData>(DEFAULT);
  const [saving, setSaving] = useState(false);

  const subscribers = useQuery(
    api.transactions.getSubscribersList,
    workspaceId ? { workspaceId } : "skip",
  );
  const openInvoices = useQuery(
    api.transactions.getOpenInvoices,
    workspaceId
      ? {
          workspaceId,
          ...(form.subscriberId !== "none"
            ? { subscriberId: form.subscriberId as Id<"subscribers"> }
            : {}),
        }
      : "skip",
  );
  const createTx = useMutation(api.transactions.create);

  // Pre-fill subscriber if provided
  useEffect(() => {
    if (open && prefillSubscriberId) {
      setForm((f) => ({ ...f, subscriberId: prefillSubscriberId }));
    } else if (!open) {
      setForm(DEFAULT);
    }
  }, [open, prefillSubscriberId]);

  // Auto-fill amount from selected invoice
  useEffect(() => {
    if (form.invoiceId !== "none" && openInvoices) {
      const inv = openInvoices.find((i) => i._id === form.invoiceId);
      if (inv) setForm((f) => ({ ...f, amount: String(inv.amount) }));
    }
  }, [form.invoiceId, openInvoices]);

  const set = (key: keyof FormData, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    if (!workspaceId) return;
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) return toast.error("Enter a valid amount");

    setSaving(true);
    try {
      await createTx({
        workspaceId,
        subscriberId:
          form.subscriberId !== "none"
            ? (form.subscriberId as Id<"subscribers">)
            : undefined,
        invoiceId:
          form.invoiceId !== "none" ? (form.invoiceId as Id<"invoices">) : undefined,
        amount,
        type: form.type,
        method: form.method,
        reference: form.reference.trim() || undefined,
        status: form.status,
        notes: form.notes.trim() || undefined,
      });
      toast.success("Transaction recorded");
      onClose();
    } catch {
      toast.error("Failed to record transaction");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Record Transaction</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Subscriber */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Subscriber</Label>
            <Select
              value={form.subscriberId}
              onValueChange={(v) => {
                set("subscriberId", v);
                set("invoiceId", "none");
              }}
            >
              <SelectTrigger className="bg-background border-border text-foreground">
                <SelectValue placeholder="Select subscriber (optional)" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border max-h-56">
                <SelectItem value="none">None / Manual entry</SelectItem>
                {(subscribers ?? []).map((sub) => (
                  <SelectItem key={sub._id} value={sub._id}>
                    {sub.name} — {sub.phone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Invoice (only if subscriber selected) */}
          {form.subscriberId !== "none" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Link to Invoice</Label>
              <Select value={form.invoiceId} onValueChange={(v) => set("invoiceId", v)}>
                <SelectTrigger className="bg-background border-border text-foreground">
                  <SelectValue placeholder="Select invoice (optional)" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border max-h-48">
                  <SelectItem value="none">No invoice</SelectItem>
                  {(openInvoices ?? []).map((inv) => (
                    <SelectItem key={inv._id} value={inv._id}>
                      {inv.invoiceNumber} — Ksh {inv.amount.toLocaleString()} ({inv.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Type */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v as FormData["type"])}>
                <SelectTrigger className="bg-background border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="refund">Refund</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                  <SelectItem value="debit">Debit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Method */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Payment Method</Label>
              <Select
                value={form.method}
                onValueChange={(v) => set("method", v as FormData["method"])}
              >
                <SelectTrigger className="bg-background border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Amount */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Amount (Ksh) *</Label>
              <Input
                type="number"
                placeholder="2500"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                className="bg-background border-border text-foreground"
              />
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => set("status", v as FormData["status"])}
              >
                <SelectTrigger className="bg-background border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Reference */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Reference / Transaction ID</Label>
            <Input
              placeholder="e.g. QGK7B2X1M9"
              value={form.reference}
              onChange={(e) => set("reference", e.target.value)}
              className="bg-background border-border text-foreground font-mono"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea
              placeholder="Any additional notes..."
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="bg-background border-border text-foreground resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
          >
            {saving ? "Saving..." : "Record Transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
