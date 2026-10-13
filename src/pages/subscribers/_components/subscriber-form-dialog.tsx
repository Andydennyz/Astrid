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

type SubscriberFormData = {
  name: string;
  email: string;
  phone: string;
  status: "active" | "suspended" | "expired" | "pending";
  connectionType: "pppoe" | "hotspot" | "static";
  packageId: string;
  ipAddress: string;
  macAddress: string;
  monthlyFee: string;
  balance: string;
  address: string;
  notes: string;
};

const defaultForm: SubscriberFormData = {
  name: "",
  email: "",
  phone: "",
  status: "active",
  connectionType: "pppoe",
  packageId: "none",
  ipAddress: "",
  macAddress: "",
  monthlyFee: "",
  balance: "0",
  address: "",
  notes: "",
};

type Props = {
  open: boolean;
  onClose: () => void;
  editId?: Id<"subscribers"> | null;
};

export default function SubscriberFormDialog({ open, onClose, editId }: Props) {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [form, setForm] = useState<SubscriberFormData>(defaultForm);
  const [saving, setSaving] = useState(false);

  const packages = useQuery(
    api.subscribers.getPackages,
    workspaceId ? { workspaceId } : "skip",
  );
  const existing = useQuery(
    api.subscribers.getById,
    editId && workspaceId ? { id: editId, workspaceId } : "skip",
  );

  const createSub = useMutation(api.subscribers.create);
  const updateSub = useMutation(api.subscribers.update);

  // Pre-fill when editing
  useEffect(() => {
    if (editId && existing) {
      setForm({
        name: existing.name,
        email: existing.email ?? "",
        phone: existing.phone,
        status: existing.status,
        connectionType: existing.connectionType,
        packageId: existing.packageId ?? "none",
        ipAddress: existing.ipAddress ?? "",
        macAddress: existing.macAddress ?? "",
        monthlyFee: String(existing.monthlyFee),
        balance: String(existing.balance),
        address: existing.address ?? "",
        notes: existing.notes ?? "",
      });
    } else if (!editId) {
      setForm(defaultForm);
    }
  }, [editId, existing]);

  const set = (key: keyof SubscriberFormData, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    if (!workspaceId) return;
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.phone.trim()) return toast.error("Phone number is required");
    const monthlyFee = parseFloat(form.monthlyFee);
    const balance = parseFloat(form.balance);
    if (isNaN(monthlyFee)) return toast.error("Monthly fee must be a number");
    if (isNaN(balance)) return toast.error("Balance must be a number");

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim(),
        status: form.status,
        connectionType: form.connectionType,
        packageId:
          form.packageId !== "none"
            ? (form.packageId as Id<"packages">)
            : undefined,
        ipAddress: form.ipAddress.trim() || undefined,
        macAddress: form.macAddress.trim() || undefined,
        monthlyFee,
        balance,
        address: form.address.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };

      if (editId) {
        await updateSub({ workspaceId, id: editId, ...payload });
        toast.success("Subscriber updated successfully");
      } else {
        await createSub({ workspaceId, ...payload });
        toast.success("Subscriber created successfully");
      }
      onClose();
    } catch {
      toast.error("Failed to save subscriber. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {editId ? "Edit Subscriber" : "Add New Subscriber"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Full Name *</Label>
            <Input
              placeholder="John Doe"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="bg-background border-border text-foreground"
            />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Phone *</Label>
            <Input
              placeholder="0712345678"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              className="bg-background border-border text-foreground"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input
              placeholder="john@example.com"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className="bg-background border-border text-foreground"
            />
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger className="bg-background border-border text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Connection type */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Connection Type</Label>
            <Select
              value={form.connectionType}
              onValueChange={(v) => set("connectionType", v)}
            >
              <SelectTrigger className="bg-background border-border text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="pppoe">PPPoE</SelectItem>
                <SelectItem value="hotspot">Hotspot</SelectItem>
                <SelectItem value="static">Static</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Package */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Package</Label>
            <Select
              value={form.packageId}
              onValueChange={(v) => {
                set("packageId", v);
                // Auto-fill monthly fee from package
                if (v !== "none" && packages) {
                  const pkg = packages.find((p) => p._id === v);
                  if (pkg) set("monthlyFee", String(pkg.price));
                }
              }}
            >
              <SelectTrigger className="bg-background border-border text-foreground">
                <SelectValue placeholder="Select package" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="none">No Package</SelectItem>
                {(packages ?? []).map((pkg) => (
                  <SelectItem key={pkg._id} value={pkg._id}>
                    {pkg.name} — Ksh {pkg.price.toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* IP Address */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">IP Address</Label>
            <Input
              placeholder="192.168.1.100"
              value={form.ipAddress}
              onChange={(e) => set("ipAddress", e.target.value)}
              className="bg-background border-border text-foreground"
            />
          </div>

          {/* MAC Address */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">MAC Address</Label>
            <Input
              placeholder="AA:BB:CC:DD:EE:FF"
              value={form.macAddress}
              onChange={(e) => set("macAddress", e.target.value)}
              className="bg-background border-border text-foreground"
            />
          </div>

          {/* Monthly Fee */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Monthly Fee (Ksh)</Label>
            <Input
              type="number"
              placeholder="2500"
              value={form.monthlyFee}
              onChange={(e) => set("monthlyFee", e.target.value)}
              className="bg-background border-border text-foreground"
            />
          </div>

          {/* Balance */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Balance (Ksh)</Label>
            <Input
              type="number"
              placeholder="0"
              value={form.balance}
              onChange={(e) => set("balance", e.target.value)}
              className="bg-background border-border text-foreground"
            />
          </div>

          {/* Address */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Address / Location</Label>
            <Input
              placeholder="123 Main Street, Nairobi"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              className="bg-background border-border text-foreground"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea
              placeholder="Any additional notes about this subscriber..."
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              className="bg-background border-border text-foreground resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
            {saving ? "Saving..." : editId ? "Save Changes" : "Add Subscriber"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
