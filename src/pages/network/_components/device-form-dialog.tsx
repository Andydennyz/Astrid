import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
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

type DeviceType = "router" | "switch" | "access_point" | "server" | "other";
type DeviceStatus = "online" | "offline" | "maintenance";

type EditData = {
  name: string;
  type: DeviceType;
  ipAddress: string;
  status: DeviceStatus;
  location?: string;
  notes?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  editId?: Id<"network_devices"> | null;
  editData?: EditData | null;
};

const EMPTY: EditData = {
  name: "",
  type: "router",
  ipAddress: "",
  status: "online",
  location: "",
  notes: "",
};

export default function DeviceFormDialog({ open, onClose, editId, editData }: Props) {
  const createDevice = useMutation(api.network.create);
  const updateDevice = useMutation(api.network.update);

  const [form, setForm] = useState<EditData>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(editData ?? EMPTY);
  }, [open, editData]);

  const set = <K extends keyof EditData>(key: K, value: EditData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.ipAddress.trim()) {
      toast.error("Name and IP address are required");
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await updateDevice({
          id: editId,
          name: form.name,
          type: form.type,
          ipAddress: form.ipAddress,
          status: form.status,
          location: form.location || undefined,
          notes: form.notes || undefined,
        });
        toast.success("Device updated");
      } else {
        await createDevice({
          name: form.name,
          type: form.type,
          ipAddress: form.ipAddress,
          status: form.status,
          location: form.location || undefined,
          notes: form.notes || undefined,
        });
        toast.success("Device added");
      }
      onClose();
    } catch {
      toast.error("Failed to save device");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle>{editId ? "Edit Device" : "Add Network Device"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">Device Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Core Router 01"
              className="bg-background border-border"
            />
          </div>

          {/* Type + Status row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Type *</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v as DeviceType)}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="router">Router</SelectItem>
                  <SelectItem value="switch">Switch</SelectItem>
                  <SelectItem value="access_point">Access Point</SelectItem>
                  <SelectItem value="server">Server</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Status *</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v as DeviceStatus)}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* IP Address */}
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">IP Address *</Label>
            <Input
              value={form.ipAddress}
              onChange={(e) => set("ipAddress", e.target.value)}
              placeholder="192.168.1.1"
              className="bg-background border-border font-mono"
            />
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">Location</Label>
            <Input
              value={form.location ?? ""}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Server Room, Site A"
              className="bg-background border-border"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">Notes</Label>
            <Textarea
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Any additional notes..."
              className="bg-background border-border resize-none h-20 text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? "Saving..." : editId ? "Save Changes" : "Add Device"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
