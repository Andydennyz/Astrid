import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Package, CheckCircle, Zap } from "lucide-react";
import { Controller } from "react-hook-form";

const schema = z.object({
  name: z.string().min(2, "Package name required"),
  type: z.enum(["pppoe", "hotspot", "static"]),
  downloadSpeed: z.coerce.number().min(1, "Min 1 Mbps"),
  uploadSpeed: z.coerce.number().min(1, "Min 1 Mbps"),
  price: z.coerce.number().min(0, "Price must be positive"),
  description: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const PRESETS = [
  { label: "Basic Home", type: "pppoe" as const, dl: 10, ul: 5, price: 999 },
  { label: "Standard", type: "pppoe" as const, dl: 20, ul: 10, price: 1499 },
  { label: "Business", type: "pppoe" as const, dl: 50, ul: 25, price: 2999 },
  { label: "Hotspot 2HR", type: "hotspot" as const, dl: 5, ul: 2, price: 50 },
];

interface Props {
  isDone: boolean;
  onComplete: () => void;
}

export default function StepPackage({ isDone, onComplete }: Props) {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [saving, setSaving] = useState(false);
  const createPackage = useMutation(api.onboarding.createStarterPackage);

  const { register, handleSubmit, control, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: "pppoe", downloadSpeed: 10, uploadSpeed: 5, price: 999 },
  });

  const dl = watch("downloadSpeed");
  const ul = watch("uploadSpeed");

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setValue("name", preset.label);
    setValue("type", preset.type);
    setValue("downloadSpeed", preset.dl);
    setValue("uploadSpeed", preset.ul);
    setValue("price", preset.price);
  };

  const onSubmit = async (data: FormData) => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      await createPackage({
        workspaceId,
        name: data.name,
        type: data.type,
        downloadSpeed: data.downloadSpeed,
        uploadSpeed: data.uploadSpeed,
        price: data.price,
        speed: `${data.downloadSpeed}/${data.uploadSpeed} Mbps`,
        description: data.description || undefined,
      });
      toast.success("Package created!");
      onComplete();
    } catch {
      toast.error("Failed to create package. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={isDone ? "border-green-500/30" : ""}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${isDone ? "border-green-500/30 bg-green-500/10" : "border-primary/30 bg-primary/10"}`}>
            {isDone ? <CheckCircle size={20} className="text-green-400" /> : <Package size={20} className="text-primary" />}
          </div>
          <div>
            <CardTitle className="text-base">Service Package</CardTitle>
            <CardDescription>Create your first internet plan to assign to subscribers</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Quick presets */}
        <div>
          <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Quick presets</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer"
              >
                <Zap size={10} className="text-primary" />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="pkg-name">Package Name</Label>
              <Input id="pkg-name" placeholder="e.g. Home 10Mbps" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Connection Type</Label>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pppoe">PPPoE</SelectItem>
                      <SelectItem value="hotspot">Hotspot</SelectItem>
                      <SelectItem value="static">Static IP</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="price">Monthly Price (KES)</Label>
              <Input id="price" type="number" placeholder="999" {...register("price")} />
              {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dl">Download Speed (Mbps)</Label>
              <Input id="dl" type="number" placeholder="10" {...register("downloadSpeed")} />
              {errors.downloadSpeed && <p className="text-xs text-destructive">{errors.downloadSpeed.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ul">Upload Speed (Mbps)</Label>
              <Input id="ul" type="number" placeholder="5" {...register("uploadSpeed")} />
              {errors.uploadSpeed && <p className="text-xs text-destructive">{errors.uploadSpeed.message}</p>}
            </div>

            <div className="col-span-2">
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
                Speed summary: <span className="font-semibold text-foreground">{dl || 0}/{ul || 0} Mbps</span> down/up
              </div>
            </div>
          </div>

          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? "Creating..." : isDone ? "Create Another" : "Create Package & Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
