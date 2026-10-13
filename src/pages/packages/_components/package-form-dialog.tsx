import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Switch } from "@/components/ui/switch.tsx";

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  speed: z.string().min(1, "Speed label is required"),
  price: z.coerce.number().min(0, "Price must be non-negative"),
  type: z.enum(["pppoe", "hotspot", "static"]),
  description: z.string().optional(),
  downloadSpeed: z.coerce.number().min(0, "Must be ≥ 0"),
  uploadSpeed: z.coerce.number().min(0, "Must be ≥ 0"),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onClose: () => void;
  editId?: Id<"packages"> | null;
};

export default function PackageFormDialog({ open, onClose, editId }: Props) {
  const createMutation = useMutation(api.packages.create);
  const updateMutation = useMutation(api.packages.update);
  const existing = useQuery(api.packages.getById, editId ? { id: editId } : "skip");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      speed: "",
      price: 0,
      type: "pppoe",
      description: "",
      downloadSpeed: 10,
      uploadSpeed: 5,
      isActive: true,
    },
  });

  useEffect(() => {
    if (editId && existing) {
      form.reset({
        name: existing.name,
        speed: existing.speed,
        price: existing.price,
        type: existing.type,
        description: existing.description ?? "",
        downloadSpeed: existing.downloadSpeed,
        uploadSpeed: existing.uploadSpeed,
        isActive: existing.isActive,
      });
    } else if (!editId) {
      form.reset({
        name: "",
        speed: "",
        price: 0,
        type: "pppoe",
        description: "",
        downloadSpeed: 10,
        uploadSpeed: 5,
        isActive: true,
      });
    }
  }, [editId, existing, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (editId) {
        await updateMutation({ id: editId, ...values });
        toast.success("Package updated successfully");
      } else {
        await createMutation(values);
        toast.success("Package created successfully");
      }
      onClose();
    } catch {
      toast.error("Failed to save package");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {editId ? "Edit Package" : "Create Package"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground text-sm">Package Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Starter 10 Mbps"
                        {...field}
                        className="bg-background border-border text-foreground"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Speed label */}
              <FormField
                control={form.control}
                name="speed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground text-sm">Speed Label</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. 10 Mbps"
                        {...field}
                        className="bg-background border-border text-foreground"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Price */}
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground text-sm">Monthly Price (KES)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="500"
                        {...field}
                        className="bg-background border-border text-foreground"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Type */}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground text-sm">Connection Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background border-border text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="pppoe">PPPoE</SelectItem>
                        <SelectItem value="hotspot">Hotspot</SelectItem>
                        <SelectItem value="static">Static IP</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Download speed */}
              <FormField
                control={form.control}
                name="downloadSpeed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground text-sm">Download (Mbps)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="10"
                        {...field}
                        className="bg-background border-border text-foreground"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Upload speed */}
              <FormField
                control={form.control}
                name="uploadSpeed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground text-sm">Upload (Mbps)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="5"
                        {...field}
                        className="bg-background border-border text-foreground"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground text-sm">Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of this package..."
                      rows={2}
                      {...field}
                      className="bg-background border-border text-foreground resize-none"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Active toggle */}
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <FormLabel className="text-foreground text-sm font-medium">Active</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Active packages are available for subscriber assignment
                    </p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={form.formState.isSubmitting}
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
              >
                {form.formState.isSubmitting
                  ? editId
                    ? "Saving..."
                    : "Creating..."
                  : editId
                    ? "Save Changes"
                    : "Create Package"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
