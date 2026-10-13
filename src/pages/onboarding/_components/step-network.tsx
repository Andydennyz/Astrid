import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Network, CheckCircle } from "lucide-react";

const schema = z.object({
  name: z.string().min(2, "Device name required"),
  type: z.enum(["router", "switch", "access_point", "server", "other"]),
  ipAddress: z.string().min(7, "Valid IP address required"),
  location: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  isDone: boolean;
  onComplete: () => void;
}

export default function StepNetwork({ isDone, onComplete }: Props) {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [saving, setSaving] = useState(false);
  const createDevice = useMutation(api.onboarding.createStarterDevice);

  const { register, handleSubmit, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: "router", ipAddress: "192.168.1.1" },
  });

  const onSubmit = async (data: FormData) => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      await createDevice({
        workspaceId,
        name: data.name,
        type: data.type,
        ipAddress: data.ipAddress,
        location: data.location || undefined,
      });
      toast.success("Network device registered!");
      onComplete();
    } catch {
      toast.error("Failed to add device. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={isDone ? "border-green-500/30" : ""}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${isDone ? "border-green-500/30 bg-green-500/10" : "border-primary/30 bg-primary/10"}`}>
            {isDone ? <CheckCircle size={20} className="text-green-400" /> : <Network size={20} className="text-primary" />}
          </div>
          <div>
            <CardTitle className="text-base">Network Device</CardTitle>
            <CardDescription>Register your primary router or core network device</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="dev-name">Device Name</Label>
              <Input id="dev-name" placeholder="e.g. Core Router - HQ" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Device Type</Label>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="router">Router</SelectItem>
                      <SelectItem value="switch">Switch</SelectItem>
                      <SelectItem value="access_point">Access Point</SelectItem>
                      <SelectItem value="server">Server</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ip">IP Address</Label>
              <Input id="ip" placeholder="192.168.1.1" {...register("ipAddress")} />
              {errors.ipAddress && <p className="text-xs text-destructive">{errors.ipAddress.message}</p>}
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="location">Location <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="location" placeholder="e.g. Server Room, Building A" {...register("location")} />
            </div>
          </div>

          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? "Registering..." : isDone ? "Add Another" : "Register Device & Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
