import { useState } from "react";
import { useMutation } from "convex/react";
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
import { CreditCard, Smartphone, Banknote, Building2, Wallet } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  invoiceId: Id<"invoices"> | null;
  invoiceAmount?: number;
  invoiceNumber?: string;
};

type Method = "mpesa" | "cash" | "bank" | "card" | "paypal";

const methodConfig: Record<Method, { label: string; icon: React.ReactNode; color: string }> = {
  mpesa: { label: "M-Pesa", icon: <Smartphone size={14} />, color: "text-emerald-400" },
  cash: { label: "Cash", icon: <Banknote size={14} />, color: "text-amber-400" },
  bank: { label: "Bank Transfer", icon: <Building2 size={14} />, color: "text-blue-400" },
  card: { label: "Card", icon: <CreditCard size={14} />, color: "text-violet-400" },
  paypal: { label: "PayPal", icon: <Wallet size={14} />, color: "text-cyan-400" },
};

export default function RecordPaymentDialog({
  open,
  onClose,
  invoiceId,
  invoiceAmount,
  invoiceNumber,
}: Props) {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [method, setMethod] = useState<Method>("mpesa");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const recordPayment = useMutation(api.financials.recordPayment);

  const handleSubmit = async () => {
    if (!invoiceId || !workspaceId) return;
    setSaving(true);
    try {
      await recordPayment({
        workspaceId,
        invoiceId,
        method,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(`Payment recorded via ${methodConfig[method].label}`);
      setReference("");
      setNotes("");
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to record payment";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Record Payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Invoice info banner */}
          {invoiceNumber && (
            <div className="rounded-lg border border-green-400/20 bg-green-400/5 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Invoice</p>
                <p className="text-sm font-mono text-primary font-semibold">{invoiceNumber}</p>
              </div>
              {invoiceAmount !== undefined && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="text-lg font-bold text-green-400">
                    Ksh {invoiceAmount.toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Payment method grid */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Payment Method</Label>
            <div className="grid grid-cols-5 gap-2">
              {(Object.entries(methodConfig) as [Method, typeof methodConfig[Method]][]).map(
                ([key, cfg]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMethod(key)}
                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                      method === key
                        ? "border-primary/60 bg-primary/10"
                        : "border-border bg-background/40 hover:border-border/80"
                    }`}
                  >
                    <span className={method === key ? cfg.color : "text-muted-foreground"}>
                      {cfg.icon}
                    </span>
                    <span
                      className={`text-[10px] font-medium leading-tight ${
                        method === key ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {cfg.label}
                    </span>
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Reference */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Reference / Transaction ID{" "}
              <span className="text-muted-foreground/60">(optional)</span>
            </Label>
            <Input
              placeholder={method === "mpesa" ? "e.g. QHA6X3NZWK" : "Transaction reference"}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="bg-background border-border text-foreground"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Notes <span className="text-muted-foreground/60">(optional)</span>
            </Label>
            <Textarea
              placeholder="Any additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="bg-background border-border text-foreground resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={saving || !invoiceId}
            className="bg-green-500 hover:bg-green-500/90 text-white font-semibold"
          >
            {saving ? "Recording..." : "Confirm Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
