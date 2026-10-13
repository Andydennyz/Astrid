import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
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
  title: string;
  description: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "critical";
  category: "connectivity" | "billing" | "hardware" | "other";
  assignedTo: string;
};

const DEFAULT: FormData = {
  subscriberId: "none",
  title: "",
  description: "",
  status: "open",
  priority: "medium",
  category: "connectivity",
  assignedTo: "",
};

type TicketForEdit = {
  subscriberId?: Id<"subscribers">;
  title: string;
  description: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "critical";
  category: "connectivity" | "billing" | "hardware" | "other";
  assignedTo?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  editId?: Id<"tickets"> | null;
  editData?: TicketForEdit | null;
};

export default function TicketFormDialog({ open, onClose, editId, editData }: Props) {
  const [form, setForm] = useState<FormData>(DEFAULT);
  const [saving, setSaving] = useState(false);

  const subscribers = useQuery(api.tickets.getSubscribersList, {});
  const createTicket = useMutation(api.tickets.create);
  const updateTicket = useMutation(api.tickets.update);

  useEffect(() => {
    if (editId && editData) {
      setForm({
        subscriberId: editData.subscriberId ?? "none",
        title: editData.title,
        description: editData.description,
        status: editData.status,
        priority: editData.priority,
        category: editData.category,
        assignedTo: editData.assignedTo ?? "",
      });
    } else if (!editId) {
      setForm(DEFAULT);
    }
  }, [editId, editData, open]);

  const set = (key: keyof FormData, val: string) =>
    setForm((p) => ({ ...p, [key]: val }));

  const handleSubmit = async () => {
    if (!form.title.trim()) return toast.error("Title is required");
    if (!form.description.trim()) return toast.error("Description is required");

    setSaving(true);
    try {
      const payload = {
        subscriberId:
          form.subscriberId !== "none"
            ? (form.subscriberId as Id<"subscribers">)
            : undefined,
        title: form.title.trim(),
        description: form.description.trim(),
        status: form.status,
        priority: form.priority,
        category: form.category,
        assignedTo: form.assignedTo.trim() || undefined,
      };

      if (editId) {
        await updateTicket({ id: editId, ...payload });
        toast.success("Ticket updated");
      } else {
        await createTicket(payload);
        toast.success("Ticket created");
      }
      onClose();
    } catch {
      toast.error("Failed to save ticket");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {editId ? "Edit Ticket" : "Open New Ticket"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Subscriber */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Subscriber (optional)</Label>
            <Select value={form.subscriberId} onValueChange={(v) => set("subscriberId", v)}>
              <SelectTrigger className="bg-background border-border text-foreground">
                <SelectValue placeholder="Select subscriber" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border max-h-52">
                <SelectItem value="none">None / Walk-in</SelectItem>
                {(subscribers ?? []).map((sub) => (
                  <SelectItem key={sub._id} value={sub._id}>
                    {sub.name} — {sub.phone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Title *</Label>
            <Input
              placeholder="e.g. No internet connection since 8am"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              className="bg-background border-border text-foreground"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description *</Label>
            <Textarea
              placeholder="Describe the issue in detail..."
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              className="bg-background border-border text-foreground resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Priority */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                <SelectTrigger className="bg-background border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger className="bg-background border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="connectivity">Connectivity</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="hardware">Hardware</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="bg-background border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Assigned To */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Assigned To</Label>
              <Input
                placeholder="Agent name"
                value={form.assignedTo}
                onChange={(e) => set("assignedTo", e.target.value)}
                className="bg-background border-border text-foreground"
              />
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
            {saving ? "Saving..." : editId ? "Save Changes" : "Open Ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
