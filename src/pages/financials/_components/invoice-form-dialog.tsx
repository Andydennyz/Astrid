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
  amount: string;
  description: string;
  dueDate: string;
  status: "pending" | "paid" | "overdue" | "cancelled";
};

const defaultForm: FormData = {
  subscriberId: "none",
  amount: "",
  description: "Monthly internet subscription",
  dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
  status: "pending",
};

type Props = {
  open: boolean;
  onClose: () => void;
  editId?: Id<"invoices"> | null;
};

export default function InvoiceFormDialog({ open, onClose, editId }: Props) {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [form, setForm] = useState<FormData>(defaultForm);
  const [saving, setSaving] = useState(false);

  const subscribers = useQuery(
    api.financials.getSubscribersList,
    workspaceId ? { workspaceId } : "skip",
  );
  const existing = useQuery(
    api.financials.getInvoiceById,
    editId && workspaceId ? { id: editId, workspaceId } : "skip",
  );

  const createInvoice = useMutation(api.financials.createInvoice);
  const updateInvoice = useMutation(api.financials.updateInvoice);

  useEffect(() => {
    if (editId && existing) {
      setForm({
        subscriberId: existing.subscriberId,
        amount: String(existing.amount),
        description: existing.description,
        dueDate: existing.dueDate.split("T")[0],
        status: existing.status,
      });
    } else if (!editId) {
      setForm(defaultForm);
    }
  }, [editId, existing]);

  const set = (key: keyof FormData, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    if (!workspaceId) return;
    if (form.subscriberId === "none") return toast.error("Select a subscriber");
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) return toast.error("Enter a valid amount");
    if (!form.description.trim()) return toast.error("Description is required");
    if (!form.dueDate) return toast.error("Due date is required");

    setSaving(true);
    try {
      if (editId) {
        await updateInvoice({
          workspaceId,
          id: editId,
          amount,
          description: form.description,
          dueDate: new Date(form.dueDate).toISOString(),
          status: form.status,
        });
        toast.success("Invoice updated");
      } else {
        await createInvoice({
          workspaceId,
          subscriberId: form.subscriberId as Id<"subscribers">,
          amount,
          description: form.description,
          dueDate: new Date(form.dueDate).toISOString(),
          status: form.status,
        });
        toast.success("Invoice created");
      }
      onClose();
    } catch {
      toast.error("Failed to save invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {editId ? "Edit Invoice" : "Create Invoice"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Subscriber */}
          {!editId && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Subscriber *</Label>
              <Select value={form.subscriberId} onValueChange={(v) => set("subscriberId", v)}>
                <SelectTrigger className="bg-background border-border text-foreground">
                  <SelectValue placeholder="Select subscriber" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border max-h-56">
                  <SelectItem value="none">Select subscriber</SelectItem>
                  {(subscribers ?? []).map((sub) => (
                    <SelectItem key={sub._id} value={sub._id}>
                      {sub.name} — {sub.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description *</Label>
            <Textarea
              placeholder="Monthly internet subscription"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              className="bg-background border-border text-foreground resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Due date */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Due Date *</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
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
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            {saving ? "Saving..." : editId ? "Save Changes" : "Create Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
