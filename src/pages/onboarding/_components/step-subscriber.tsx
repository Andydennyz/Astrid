import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
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
import { Users, CheckCircle } from "lucide-react";

const schema = z.object({
  name: z.string().min(2, "Name required"),
  phone: z.string().min(9, "Valid phone number required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  connectionType: z.enum(["pppoe", "hotspot", "static"]),
  packageId: z.string().optional(),
  monthlyFee: z.coerce.number().min(0),
  ipAddress: z.string().optional(),
  pppoeUsername: z.string().optional(),
  pppoePassword: z.string().optional(),
  hotspotUsername: z.string().optional(),
  hotspotPassword: z.string().optional(),
  createInitialInvoice: z.boolean(),
  invoiceDueDate: z.string(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  isDone: boolean;
  onComplete: () => void;
}

export default function StepSubscriber({ isDone, onComplete }: Props) {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [saving, setSaving] = useState(false);
  const createSubscriber = useMutation(api.onboarding.createStarterSubscriber);
  const createPppoeSubscriber = useAction(api.subscribers.createPppoe);
  const createHotspotSubscriber = useAction(api.subscribers.createHotspot);
  const packages = useQuery(
    api.packages.listActive,
    workspaceId ? { workspaceId } : "skip",
  );

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      connectionType: "pppoe",
      monthlyFee: 0,
      createInitialInvoice: false,
      invoiceDueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    },
  });

  const selectedPkgId = watch("packageId");

  // Auto-fill monthly fee from selected package
  const handlePackageChange = (pkgId: string) => {
    setValue("packageId", pkgId);
    const pkg = packages?.find((p) => p._id === pkgId);
    if (pkg) setValue("monthlyFee", pkg.price);
  };

  const onSubmit = async (data: FormData) => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      const packageId = data.packageId as Parameters<typeof createSubscriber>[0]["packageId"];
      if (data.createInitialInvoice && data.monthlyFee <= 0) {
        toast.error("Set a positive monthly fee to create an initial invoice.");
        return;
      }
      if (data.createInitialInvoice && !data.invoiceDueDate) {
        toast.error("Choose a due date for the initial invoice.");
        return;
      }
      const initialInvoice = data.createInitialInvoice
        ? {
            dueDate: new Date(`${data.invoiceDueDate}T00:00:00.000Z`).toISOString(),
            description: "Initial internet subscription",
          }
        : undefined;
      if (data.connectionType === "pppoe") {
        if (!data.pppoeUsername?.trim() || !data.pppoePassword) {
          toast.error("PPPoE subscribers require a username and password.");
          return;
        }
        if (!packageId) {
          toast.error("Select a PPPoE package.");
          return;
        }
        await createPppoeSubscriber({
          workspaceId,
          name: data.name,
          phone: data.phone,
          email: data.email || undefined,
          status: "active",
          packageId,
          monthlyFee: data.monthlyFee,
          balance: 0,
          ipAddress: data.ipAddress || undefined,
          pppoeUsername: data.pppoeUsername,
          pppoePassword: data.pppoePassword,
          ...(initialInvoice ? { initialInvoice } : {}),
        });
      } else if (data.connectionType === "hotspot") {
        if (!data.hotspotUsername?.trim() || !data.hotspotPassword) {
          toast.error("Hotspot subscribers require a username and password.");
          return;
        }
        if (!packageId) {
          toast.error("Select a Hotspot package.");
          return;
        }
        await createHotspotSubscriber({
          workspaceId,
          name: data.name,
          phone: data.phone,
          email: data.email || undefined,
          status: "active",
          packageId,
          monthlyFee: data.monthlyFee,
          balance: 0,
          ipAddress: data.ipAddress || undefined,
          hotspotUsername: data.hotspotUsername,
          hotspotPassword: data.hotspotPassword,
          ...(initialInvoice ? { initialInvoice } : {}),
        });
      } else {
        await createSubscriber({
          workspaceId,
          name: data.name,
          phone: data.phone,
          email: data.email || undefined,
          connectionType: "static",
          packageId,
          monthlyFee: data.monthlyFee,
          ipAddress: data.ipAddress || undefined,
          ...(initialInvoice ? { initialInvoice } : {}),
        });
      }
      toast.success(
        data.createInitialInvoice
          ? "First subscriber and initial invoice added!"
          : "First subscriber added!",
      );
      onComplete();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add subscriber. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={isDone ? "border-green-500/30" : ""}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${isDone ? "border-green-500/30 bg-green-500/10" : "border-primary/30 bg-primary/10"}`}>
            {isDone ? <CheckCircle size={20} className="text-green-400" /> : <Users size={20} className="text-primary" />}
          </div>
          <div>
            <CardTitle className="text-base">First Subscriber</CardTitle>
            <CardDescription>Add your first customer to get started</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="sub-name">Full Name</Label>
              <Input id="sub-name" placeholder="Jane Doe" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" placeholder="0712345678" {...register("phone")} />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sub-email">Email <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="sub-email" type="email" placeholder="jane@example.com" {...register("email")} />
            </div>

            <div className="space-y-1.5">
              <Label>Connection Type</Label>
              <Controller
                name="connectionType"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(connectionType) => {
                      field.onChange(connectionType);
                      const selectedPackage = packages?.find((pkg) => pkg._id === selectedPkgId);
                      if (selectedPackage && selectedPackage.type !== connectionType) {
                        setValue("packageId", undefined);
                        setValue("monthlyFee", 0);
                      }
                    }}
                  >
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
              <Label>Assign Package <span className="text-muted-foreground">(optional)</span></Label>
              <Select
                value={selectedPkgId ?? "none"}
                onValueChange={(v) => v === "none" ? setValue("packageId", undefined) : handlePackageChange(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select package" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No package</SelectItem>
                  {packages?.filter((pkg) => pkg.type === watch("connectionType")).map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.name} — KES {p.price.toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {watch("connectionType") === "pppoe" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="pppoe-username">PPPoE Username</Label>
                  <Input id="pppoe-username" autoComplete="username" {...register("pppoeUsername")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pppoe-password">PPPoE Password</Label>
                  <Input id="pppoe-password" type="password" autoComplete="new-password" {...register("pppoePassword")} />
                </div>
              </>
            )}
            {watch("connectionType") === "hotspot" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="hotspot-username">Hotspot Username</Label>
                  <Input id="hotspot-username" autoComplete="username" {...register("hotspotUsername")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hotspot-password">Hotspot Password</Label>
                  <Input id="hotspot-password" type="password" autoComplete="new-password" {...register("hotspotPassword")} />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="fee">Monthly Fee (KES)</Label>
              <Input id="fee" type="number" placeholder="0" {...register("monthlyFee")} />
            </div>

            <div className="col-span-2 space-y-2 rounded-md border border-border p-3">
              <label htmlFor="create-initial-invoice" className="flex items-center gap-2 text-sm">
                <Input
                  id="create-initial-invoice"
                  type="checkbox"
                  className="h-4 w-4"
                  {...register("createInitialInvoice")}
                />
                Create an initial invoice for this subscriber
              </label>
              {watch("createInitialInvoice") && (
                <div className="space-y-1.5">
                  <Label htmlFor="initial-invoice-due-date">Invoice due date</Label>
                  <Input
                    id="initial-invoice-due-date"
                    type="date"
                    {...register("invoiceDueDate")}
                  />
                  <p className="text-xs text-muted-foreground">
                    The invoice amount will use the monthly fee shown above.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sub-ip">IP Address <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="sub-ip" placeholder="192.168.1.100" {...register("ipAddress")} />
            </div>
          </div>

          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? "Adding..." : isDone ? "Add Another" : "Add Subscriber & Finish"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
