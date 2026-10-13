import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
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
import { Textarea } from "@/components/ui/textarea.tsx";
import { toast } from "sonner";
import { Zap, Users, Calendar } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function BulkGenerateDialog({ open, onClose }: Props) {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const today = new Date();
  const defaultDue = new Date(today.getFullYear(), today.getMonth() + 1, 0); // last day of month
  const [dueDate, setDueDate] = useState(defaultDue.toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);

  const generate = useMutation(api.financials.generateMonthlyInvoices);

  const handleGenerate = async () => {
    if (!dueDate) return toast.error("Select a due date");
    if (!workspaceId) return;
    setGenerating(true);
    try {
      let cursor: string | null = null;
      let created = 0;
      let skipped = 0;
      let isDone = false;
      while (!isDone) {
        const result: {
          created: number;
          skipped: number;
          isDone: boolean;
          continueCursor: string;
        } = await generate({
          workspaceId,
          dueDate: new Date(dueDate).toISOString(),
          description: description.trim() || undefined,
          paginationOpts: { numItems: 100, cursor },
        });
        created += result.created;
        skipped += result.skipped;
        cursor = result.continueCursor;
        isDone = result.isDone;
      }
      toast.success(
        `Generated ${created} invoice${created !== 1 ? "s" : ""}` +
          (skipped > 0 ? ` (${skipped} skipped – already exist or no fee)` : ""),
      );
      onClose();
    } catch {
      toast.error("Failed to generate invoices");
    } finally {
      setGenerating(false);
    }
  };

  const monthLabel = dueDate
    ? new Date(dueDate).toLocaleString("default", { month: "long", year: "numeric" })
    : "";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Zap size={16} className="text-amber-400" />
            Bulk Generate Monthly Invoices
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Info banner */}
          <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 space-y-1">
            <div className="flex items-center gap-2 text-xs text-amber-400 font-medium">
              <Users size={12} />
              <span>One invoice per active subscriber</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Creates a pending invoice for every active subscriber using their monthly fee.
              Subscribers already invoiced for this period are skipped.
            </p>
          </div>

          {/* Due date */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Calendar size={11} /> Due Date *
            </Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-background border-border text-foreground"
            />
            {monthLabel && (
              <p className="text-[10px] text-muted-foreground">Billing period: {monthLabel}</p>
            )}
          </div>

          {/* Custom description */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Description <span className="text-muted-foreground/60">(optional)</span>
            </Label>
            <Textarea
              placeholder={`Monthly internet subscription – ${dueDate?.substring(0, 7) ?? ""}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="bg-background border-border text-foreground resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={generating}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={generating || !dueDate}
            className="bg-amber-500 hover:bg-amber-500/90 text-white font-semibold gap-1.5"
          >
            <Zap size={13} />
            {generating ? "Generating..." : "Generate Invoices"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
