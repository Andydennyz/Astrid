import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import type { RouterProvisioningConfig } from "./wireguard-config-dialog.tsx";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog.tsx";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Loader2, RefreshCw, Eye, EyeOff, Copy, Check } from "lucide-react";
import { generateWireGuardKeypair, generatePresharedKey } from "./wireguard-keygen.ts";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  routerOsVersion: z.union([z.literal("v6"), z.literal("v7")]),
  // WireGuard
  publicKey: z.string().min(40, "Invalid WireGuard public key"),
  privateKey: z.string().min(40, "Invalid WireGuard private key"),
  presharedKey: z.string().optional(),
  tunnelIp: z.string().min(7, "Enter tunnel IP, e.g. 10.200.0.2/32"),
  serverPublicKey: z.string().min(40, "Enter server WireGuard public key"),
  serverEndpoint: z.string().min(5, "Enter server endpoint, e.g. vpn.example.com:51820"),
  serverTunnelIp: z.string().min(7, "Enter server tunnel IP, e.g. 10.200.0.1/32"),
  allowedIPs: z.string().min(7, "Enter allowed IPs, e.g. 0.0.0.0/0"),
  dns: z.string().optional(),
  // Device info
  ipAddress: z.string().optional(),
  location: z.string().optional(),
  model: z.string().optional(),
  notes: z.string().optional(),
  // RADIUS
  radiusSecret: z.string().min(6, "RADIUS secret must be at least 6 characters"),
  nasIdentifier: z.string().min(2, "NAS Identifier required"),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (routerId: Id<"routers">, config: RouterProvisioningConfig) => void;
};

export default function AddRouterDialog({ open, onOpenChange, onCreated }: Props) {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const createRouter = useMutation(api.routers.create);
  const [generatingKeys, setGeneratingKeys] = useState(false);
  const [generatingPsk, setGeneratingPsk] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [showRadiusSecret, setShowRadiusSecret] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      routerOsVersion: "v7",
      publicKey: "",
      privateKey: "",
      presharedKey: "",
      tunnelIp: "",
      serverPublicKey: "",
      serverEndpoint: "",
      serverTunnelIp: "10.200.0.1/32",
      allowedIPs: "0.0.0.0/0",
      dns: "1.1.1.1",
      ipAddress: "",
      location: "",
      model: "",
      notes: "",
      radiusSecret: "",
      nasIdentifier: "",
    },
  });

  // Auto-generate keypair when dialog opens
  useEffect(() => {
    if (open) {
      void (async () => {
        setGeneratingKeys(true);
        try {
          const { privateKey, publicKey } = await generateWireGuardKeypair();
          form.setValue("privateKey", privateKey);
          form.setValue("publicKey", publicKey);
        } catch {
          // silent — user can regenerate manually
        } finally {
          setGeneratingKeys(false);
        }
      })();
    }
  }, [open, form]);

  const handleGenerateKeys = async () => {
    setGeneratingKeys(true);
    try {
      const { privateKey, publicKey } = await generateWireGuardKeypair();
      form.setValue("privateKey", privateKey);
      form.setValue("publicKey", publicKey);
      toast.success("WireGuard keypair generated");
    } catch {
      toast.error("Failed to generate keypair");
    } finally {
      setGeneratingKeys(false);
    }
  };

  const handleGeneratePsk = async () => {
    setGeneratingPsk(true);
    try {
      const psk = await generatePresharedKey();
      form.setValue("presharedKey", psk);
      toast.success("Preshared key generated");
    } catch {
      toast.error("Failed to generate preshared key");
    } finally {
      setGeneratingPsk(false);
    }
  };

  const copyToClipboard = async (value: string, field: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const onSubmit = async (values: FormValues) => {
    if (!workspaceId) return;
    try {
      const routerId = await createRouter({ workspaceId, ...values });
      onCreated?.(routerId, values);
      toast.success("Router added successfully");
      form.reset();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add router";
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add MikroTik Router</DialogTitle>
          <DialogDescription>
            Configure WireGuard tunnel and RADIUS credentials. A keypair is auto-generated — fill in the server details then copy the provisioning script.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs defaultValue="device">
              <TabsList className="w-full">
                <TabsTrigger value="device" className="flex-1">Device</TabsTrigger>
                <TabsTrigger value="wireguard" className="flex-1">WireGuard</TabsTrigger>
                <TabsTrigger value="radius" className="flex-1">RADIUS</TabsTrigger>
              </TabsList>

              {/* ── Device Tab ── */}
              <TabsContent value="device" className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Router Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Site A - Main Router" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="routerOsVersion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>RouterOS Version *</FormLabel>
                      <FormDescription className="text-xs">
                        Determines the provisioning script syntax. RouterOS v7 has native WireGuard support; v6 requires the WireGuard package.
                      </FormDescription>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select RouterOS version" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="v7">RouterOS v7 (recommended — native WireGuard)</SelectItem>
                          <SelectItem value="v6">RouterOS v6 (requires WireGuard package)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="model"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>MikroTik Model</FormLabel>
                        <FormControl>
                          <Input placeholder="RB750Gr3" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="ipAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>LAN IP Address</FormLabel>
                        <FormControl>
                          <Input placeholder="192.168.88.1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl>
                        <Input placeholder="Nairobi - CBD Tower" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea rows={3} placeholder="Any additional notes..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              {/* ── WireGuard Tab ── */}
              <TabsContent value="wireguard" className="space-y-4 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Router Keypair</p>
                    <p className="text-xs text-muted-foreground">
                      {generatingKeys ? "Generating keypair…" : "Curve25519 keypair auto-generated — regenerate if needed"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleGenerateKeys}
                    disabled={generatingKeys}
                  >
                    {generatingKeys ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                    Regenerate
                  </Button>
                </div>

                <FormField
                  control={form.control}
                  name="publicKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Router Public Key *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input placeholder="Base64 public key…" {...field} className="pr-10 font-mono text-xs" />
                          <button
                            type="button"
                            onClick={() => copyToClipboard(field.value, "publicKey")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {copiedField === "publicKey" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="privateKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Router Private Key *</FormLabel>
                      <FormDescription className="text-xs">Stored securely. Goes into the router&apos;s WireGuard interface config.</FormDescription>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPrivateKey ? "text" : "password"}
                            placeholder="Base64 private key…"
                            {...field}
                            className="pr-20 font-mono text-xs"
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                            <button type="button" onClick={() => setShowPrivateKey((v) => !v)} className="text-muted-foreground hover:text-foreground">
                              {showPrivateKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Preshared Key (Optional)</p>
                    <p className="text-xs text-muted-foreground">Adds an extra layer of symmetric encryption</p>
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={handleGeneratePsk} disabled={generatingPsk}>
                    {generatingPsk ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                    Generate PSK
                  </Button>
                </div>

                <FormField
                  control={form.control}
                  name="presharedKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input placeholder="(optional) Base64 preshared key…" {...field} className="font-mono text-xs" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tunnel Addressing</p>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="tunnelIp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Router Tunnel IP *</FormLabel>
                        <FormControl>
                          <Input placeholder="10.200.0.2/32" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="serverTunnelIp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Server Tunnel IP *</FormLabel>
                        <FormControl>
                          <Input placeholder="10.200.0.1/32" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="serverPublicKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Server WireGuard Public Key *</FormLabel>
                      <FormDescription className="text-xs">The public key of your billing/RADIUS server&apos;s WireGuard interface.</FormDescription>
                      <FormControl>
                        <Input placeholder="Base64 server public key…" {...field} className="font-mono text-xs" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="serverEndpoint"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Server Endpoint *</FormLabel>
                      <FormControl>
                        <Input placeholder="vpn.example.com:51820" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="allowedIPs"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Allowed IPs *</FormLabel>
                        <FormControl>
                          <Input placeholder="0.0.0.0/0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dns"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>DNS</FormLabel>
                        <FormControl>
                          <Input placeholder="1.1.1.1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              {/* ── RADIUS Tab ── */}
              <TabsContent value="radius" className="space-y-4 pt-4">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">FreeRADIUS Configuration</p>
                  <p>These credentials are used to authenticate this router when it queries the RADIUS server. Add a matching <code className="bg-muted px-1 rounded">client</code> block in FreeRADIUS <code className="bg-muted px-1 rounded">clients.conf</code>.</p>
                </div>

                <FormField
                  control={form.control}
                  name="nasIdentifier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>NAS Identifier *</FormLabel>
                      <FormDescription className="text-xs">Must match the <code>Nas-Identifier</code> attribute sent by MikroTik. Usually the router&apos;s identity name.</FormDescription>
                      <FormControl>
                        <Input placeholder="site-a-router" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="radiusSecret"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>RADIUS Shared Secret *</FormLabel>
                      <FormDescription className="text-xs">Shared secret between MikroTik and FreeRADIUS. Must match MikroTik RADIUS server config and FreeRADIUS <code>clients.conf</code>.</FormDescription>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showRadiusSecret ? "text" : "password"}
                            placeholder="Strong random secret…"
                            {...field}
                            className="pr-10 font-mono"
                          />
                          <button type="button" onClick={() => setShowRadiusSecret((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showRadiusSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-xs font-mono">
                  <p className="text-muted-foreground text-[10px] font-sans uppercase tracking-wider">FreeRADIUS clients.conf snippet</p>
                  <pre className="text-foreground whitespace-pre-wrap">{`client ${form.watch("nasIdentifier") || "<nasIdentifier>"} {
  ipaddr = <router-LAN-ip>
  secret = ${form.watch("radiusSecret") ? "**hidden**" : "<radiusSecret>"}
  nas_type = other
}`}</pre>
                </div>

                <div className="mt-2">
                  <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                    RADIUS endpoints are auto-configured when you add this router
                  </Badge>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Add Router
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
