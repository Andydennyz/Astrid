import { useState, type FormEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Copy, LoaderCircle, Plus, X } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  buildRouterEnrollmentRollbackScript,
  buildRouterEnrollmentScript,
} from "./router-enrollment-script.ts";
import {
  buildFreeRadiusClientConfig,
  buildRouterRadiusScript,
  type RouterRadiusServices,
} from "./router-radius-script.ts";
import { buildHotspotServiceScript } from "./router-hotspot-script.ts";
import { buildPppoeServiceScript } from "./router-service-script.ts";

type RouterEnrollmentProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export default function RouterEnrollment({
  open: controlledOpen,
  onOpenChange,
}: RouterEnrollmentProps) {
  const { selectedWorkspaceId: workspaceId, memberships } = useWorkspace();
  const membership = memberships.find((item) => item.workspaceId === workspaceId);
  const canManage =
    membership?.role === "owner" ||
    membership?.role === "admin" ||
    membership?.role === "network";
  const enrollments = useQuery(
    api.routerEnrollments.list,
    workspaceId && canManage ? { workspaceId } : "skip",
  );
  const createEnrollment = useAction(api.routerEnrollments.create);
  const redeemEnrollment = useAction(api.routerEnrollments.redeem);
  const revokeEnrollment = useMutation(api.routerEnrollments.revoke);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [model, setModel] = useState("");
  const [enrollmentId, setEnrollmentId] = useState<Id<"router_enrollments"> | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [routerPublicKey, setRouterPublicKey] = useState("");
  const [pendingRadiusSecret, setPendingRadiusSecret] = useState<string | null>(null);
  const [issuedCredentials, setIssuedCredentials] = useState<{
    nasIdentifier: string;
    radiusSecret: string;
  } | null>(null);
  const [radiusServerAddress, setRadiusServerAddress] = useState("");
  const [routerTunnelAddress, setRouterTunnelAddress] = useState("");
  const [radiusServices, setRadiusServices] = useState<RouterRadiusServices>({
    ppp: true,
    hotspot: true,
  });
  const [routerRadiusScript, setRouterRadiusScript] = useState<string | null>(null);
  const [freeRadiusClientConfig, setFreeRadiusClientConfig] = useState<string | null>(null);
  const [pppoeInterface, setPppoeInterface] = useState("");
  const [pppoeLocalAddress, setPppoeLocalAddress] = useState("");
  const [pppoePoolStart, setPppoePoolStart] = useState("");
  const [pppoePoolEnd, setPppoePoolEnd] = useState("");
  const [pppoeServiceName, setPppoeServiceName] = useState("astrid-pppoe");
  const [pppoeServiceScript, setPppoeServiceScript] = useState<string | null>(null);
  const [hotspotInterface, setHotspotInterface] = useState("");
  const [hotspotAddress, setHotspotAddress] = useState("");
  const [hotspotPoolStart, setHotspotPoolStart] = useState("");
  const [hotspotPoolEnd, setHotspotPoolEnd] = useState("");
  const [hotspotDnsName, setHotspotDnsName] = useState("");
  const [hotspotCertificateName, setHotspotCertificateName] = useState("");
  const [hotspotServiceScript, setHotspotServiceScript] = useState<string | null>(null);
  const [redeemed, setRedeemed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!canManage || !workspaceId) return null;

  const setDialogOpen = (nextOpen: boolean) => {
    setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
    if (!nextOpen) {
      if (token && enrollmentId && !redeemed) {
        void revokeEnrollment({ workspaceId, enrollmentId }).catch(() => {
          toast.error("Could not revoke the unused token; it will expire automatically.");
        });
      }
      setToken(null);
      setExpiresAt(null);
      setEnrollmentId(null);
      setRouterPublicKey("");
      setPendingRadiusSecret(null);
      setIssuedCredentials(null);
      setRadiusServerAddress("");
      setRouterTunnelAddress("");
      setRadiusServices({ ppp: true, hotspot: true });
      setRouterRadiusScript(null);
      setFreeRadiusClientConfig(null);
      setPppoeInterface("");
      setPppoeLocalAddress("");
      setPppoePoolStart("");
      setPppoePoolEnd("");
      setPppoeServiceName("astrid-pppoe");
      setPppoeServiceScript(null);
      setHotspotInterface("");
      setHotspotAddress("");
      setHotspotPoolStart("");
      setHotspotPoolEnd("");
      setHotspotDnsName("");
      setHotspotCertificateName("");
      setHotspotServiceScript(null);
      setRedeemed(false);
    }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId) return;
    setSubmitting(true);
    try {
      const result = await createEnrollment({
        workspaceId,
        name,
        location: location.trim() || undefined,
        model: model.trim() || undefined,
        routerOsVersion: "v7",
      });
      setName("");
      setLocation("");
      setModel("");
      setEnrollmentId(result.enrollmentId);
      setToken(result.token);
      setExpiresAt(result.expiresAt);
      toast.success("Router enrollment token created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create router enrollment.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}. Select and copy it manually.`);
    }
  };

  const redeem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || !enrollmentId || !token) return;
    setSubmitting(true);
    try {
      const radiusSecret =
        pendingRadiusSecret ??
        Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
      setPendingRadiusSecret(radiusSecret);
      const credentials = await redeemEnrollment({
        workspaceId,
        enrollmentId,
        token,
        routerPublicKey: routerPublicKey.trim(),
        radiusSecret,
      });
      setIssuedCredentials({
        nasIdentifier: credentials.nasIdentifier,
        radiusSecret,
      });
      setPendingRadiusSecret(null);
      setToken(null);
      setRouterPublicKey("");
      setRedeemed(true);
      toast.success("Router public key bound to this enrollment.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not complete enrollment.");
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async (enrollmentId: Id<"router_enrollments">) => {
    try {
      await revokeEnrollment({ workspaceId, enrollmentId });
      toast.success("Enrollment revoked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke enrollment.");
    }
  };

  const generateRadiusConfiguration = () => {
    if (!issuedCredentials) return;
    try {
      setRouterRadiusScript(
        buildRouterRadiusScript({
          radiusServerAddress: radiusServerAddress.trim(),
          routerTunnelAddress: routerTunnelAddress.trim(),
          radiusSecret: issuedCredentials.radiusSecret,
          nasIdentifier: issuedCredentials.nasIdentifier,
          services: radiusServices,
        }),
      );
      setFreeRadiusClientConfig(
        buildFreeRadiusClientConfig({
          routerTunnelAddress: routerTunnelAddress.trim(),
          radiusSecret: issuedCredentials.radiusSecret,
          nasIdentifier: issuedCredentials.nasIdentifier,
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate RADIUS configuration.");
    }
  };

  const generatePppoeConfiguration = () => {
    try {
      setPppoeServiceScript(
        buildPppoeServiceScript({
          interfaceName: pppoeInterface.trim(),
          localAddress: pppoeLocalAddress.trim(),
          poolStart: pppoePoolStart.trim(),
          poolEnd: pppoePoolEnd.trim(),
          serviceName: pppoeServiceName.trim(),
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate PPPoE configuration.");
    }
  };

  const generateHotspotConfiguration = () => {
    try {
      setHotspotServiceScript(
        buildHotspotServiceScript({
          interfaceName: hotspotInterface.trim(),
          hotspotAddress: hotspotAddress.trim(),
          poolStart: hotspotPoolStart.trim(),
          poolEnd: hotspotPoolEnd.trim(),
          dnsName: hotspotDnsName.trim(),
          certificateName: hotspotCertificateName.trim(),
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate HotSpot configuration.");
    }
  };

  return (
    <>
      <section className="space-y-4 rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Secure router enrollment</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Create a short-lived enrollment token before a router is configured. Tokens expire
              after 30 minutes and are only shown once.
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 size-4" />
            Start enrollment
          </Button>
        </div>

        <Alert>
          <AlertTitle>Safe staged enrollment</AlertTitle>
          <AlertDescription>
            This flow binds a RouterOS-generated public key to a short-lived enrollment. It does not
            configure a WireGuard peer, tunnel address, RADIUS, or remote API access; those require
            the later gateway and server setup. Never share the enrollment token or put it in the
            router terminal.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <h3 className="text-sm font-medium">Recent enrollments</h3>
          {enrollments === undefined ? (
            <p className="text-sm text-muted-foreground">Loading enrollments…</p>
          ) : enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No router enrollments yet.</p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {enrollments.map((enrollment) => (
                <div
                  key={enrollment._id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{enrollment.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[enrollment.model, enrollment.location, `RouterOS ${enrollment.routerOsVersion}`]
                        .filter(Boolean)
                        .join(" · ")}
                      {" · "}
                      {enrollment.status === "pending"
                        ? `Expires ${new Date(enrollment.expiresAt).toLocaleString()}`
                        : enrollment.status === "redeemed"
                          ? "public key bound"
                          : enrollment.status}
                    </p>
                  </div>
                  {enrollment.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Revoke enrollment for ${enrollment.name}`}
                      onClick={() => void revoke(enrollment._id)}
                    >
                      <X className="mr-1 size-4" />
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <Dialog open={open} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {redeemed
                ? "Router key enrolled"
                : token
                  ? "Prepare router and bind its key"
                  : "Start router enrollment"}
            </DialogTitle>
            <DialogDescription>
              {redeemed
                ? "The router public key is saved. The private key remains on the RouterOS device."
                : token
                  ? "Copy the setup script, run it in RouterOS, then bind the displayed public key below."
                  : "Register the router details to reserve its name in this workspace."}
            </DialogDescription>
          </DialogHeader>

          {redeemed ? (
            <div className="space-y-4">
              <Alert>
                <AlertTitle>Enrollment recorded</AlertTitle>
                <AlertDescription>
                  The router record and NAS identity are ready. Convex stores only the RADIUS
                  secret hash. Configure the WireGuard tunnel first; the snippets below configure
                  RADIUS and offer service scripts, but do not create a WireGuard peer or change
                  interface addresses and firewall rules.
                </AlertDescription>
              </Alert>
              {issuedCredentials && (
                <div className="space-y-3 rounded-md border border-border p-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">NAS-Identifier</p>
                    <p className="break-all font-mono text-sm">{issuedCredentials.nasIdentifier}</p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                      onClick={() => void copyText(issuedCredentials.nasIdentifier, "NAS-Identifier")}
                    >
                      <Copy className="mr-2 size-4" />
                      Copy NAS-Identifier
                    </Button>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">RADIUS shared secret</p>
                    <p className="break-all font-mono text-sm">{issuedCredentials.radiusSecret}</p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                      onClick={() => void copyText(issuedCredentials.radiusSecret, "RADIUS shared secret")}
                    >
                      <Copy className="mr-2 size-4" />
                      Copy RADIUS secret
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Convex stores only a SHA-256 hash. If the request reports an error, retry before
                    closing this dialog; the same secret will be used to safely complete redemption.
                  </p>
                </div>
              )}
              {issuedCredentials && (
                <div className="space-y-3 rounded-md border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Prepare matching RADIUS configuration</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Use the addresses assigned to this WireGuard link. The RouterOS script also
                      sets its system identity to the registered NAS-Identifier. Applying it
                      enables RADIUS on every existing HotSpot profile you select below.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="radius-server-address" className="text-sm font-medium">
                      RADIUS server IPv4 address
                    </label>
                    <Input
                      id="radius-server-address"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="For example, 10.77.0.1"
                      value={radiusServerAddress}
                      onChange={(event) => {
                        setRadiusServerAddress(event.target.value.trim());
                        setRouterRadiusScript(null);
                        setFreeRadiusClientConfig(null);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="router-tunnel-address" className="text-sm font-medium">
                      Router WireGuard IPv4 address
                    </label>
                    <Input
                      id="router-tunnel-address"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="For example, 10.77.0.2"
                      value={routerTunnelAddress}
                      onChange={(event) => {
                        setRouterTunnelAddress(event.target.value.trim());
                        setRouterRadiusScript(null);
                        setFreeRadiusClientConfig(null);
                      }}
                    />
                  </div>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">RADIUS services</legend>
                    {([
                      ["ppp", "PPP / PPPoE"],
                      ["hotspot", "HotSpot"],
                    ] as const).map(([service, label]) => (
                      <label key={service} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={radiusServices[service]}
                          onCheckedChange={(checked) => {
                            setRadiusServices((current) => ({
                              ...current,
                              [service]: checked === true,
                            }));
                            setRouterRadiusScript(null);
                            setFreeRadiusClientConfig(null);
                          }}
                        />
                        {label}
                      </label>
                    ))}
                  </fieldset>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={!radiusServerAddress.trim() || !routerTunnelAddress.trim()}
                    onClick={generateRadiusConfiguration}
                  >
                    Generate RADIUS configuration
                  </Button>
                  {routerRadiusScript && freeRadiusClientConfig && (
                    <div className="space-y-3 border-t border-border pt-3">
                      <div className="space-y-2">
                        <label htmlFor="router-radius-script" className="text-sm font-medium">
                          RouterOS script
                        </label>
                        <Textarea
                          id="router-radius-script"
                          className="min-h-48 font-mono text-xs"
                          readOnly
                          value={routerRadiusScript}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full"
                          onClick={() => void copyText(routerRadiusScript, "RouterOS RADIUS script")}
                        >
                          <Copy className="mr-2 size-4" />
                          Copy RouterOS script
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="freeradius-client-config" className="text-sm font-medium">
                          FreeRADIUS client block
                        </label>
                        <Textarea
                          id="freeradius-client-config"
                          className="min-h-32 font-mono text-xs"
                          readOnly
                          value={freeRadiusClientConfig}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full"
                          onClick={() =>
                            void copyText(freeRadiusClientConfig, "FreeRADIUS client block")
                          }
                        >
                          <Copy className="mr-2 size-4" />
                          Copy FreeRADIUS client block
                        </Button>
                      </div>
                      <Alert>
                        <AlertTitle>Keep these snippets private</AlertTitle>
                        <AlertDescription>
                          Both configurations contain the RADIUS shared secret. Add the client
                          block to FreeRADIUS, require Message-Authenticator, reload FreeRADIUS,
                          then apply the RouterOS script over a trusted local session.
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}
                  {radiusServices.ppp && (
                    <div className="space-y-3 border-t border-border pt-3">
                      <div>
                        <p className="text-sm font-medium">Prepare PPPoE access concentrator</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Enter the customer-facing interface and an address plan reserved for PPP
                          sessions. The script uses PAP so FreeRADIUS can verify subscriber
                          credentials; RADIUS supplies each subscriber’s package rate.
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label htmlFor="pppoe-interface" className="text-sm font-medium">
                            PPPoE interface
                          </label>
                          <Input
                            id="pppoe-interface"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="For example, ether2"
                            value={pppoeInterface}
                            onChange={(event) => {
                              setPppoeInterface(event.target.value.trim());
                              setPppoeServiceScript(null);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="pppoe-service-name" className="text-sm font-medium">
                            PPPoE service name
                          </label>
                          <Input
                            id="pppoe-service-name"
                            autoComplete="off"
                            spellCheck={false}
                            value={pppoeServiceName}
                            onChange={(event) => {
                              setPppoeServiceName(event.target.value.trim());
                              setPppoeServiceScript(null);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="pppoe-local-address" className="text-sm font-medium">
                            PPP server local IPv4 address
                          </label>
                          <Input
                            id="pppoe-local-address"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="For example, 172.16.0.1"
                            value={pppoeLocalAddress}
                            onChange={(event) => {
                              setPppoeLocalAddress(event.target.value.trim());
                              setPppoeServiceScript(null);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="pppoe-pool-start" className="text-sm font-medium">
                            Client pool start IPv4
                          </label>
                          <Input
                            id="pppoe-pool-start"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="For example, 172.16.0.2"
                            value={pppoePoolStart}
                            onChange={(event) => {
                              setPppoePoolStart(event.target.value.trim());
                              setPppoeServiceScript(null);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="pppoe-pool-end" className="text-sm font-medium">
                            Client pool end IPv4
                          </label>
                          <Input
                            id="pppoe-pool-end"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="For example, 172.16.0.254"
                            value={pppoePoolEnd}
                            onChange={(event) => {
                              setPppoePoolEnd(event.target.value.trim());
                              setPppoeServiceScript(null);
                            }}
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        disabled={
                          !pppoeInterface.trim() ||
                          !pppoeLocalAddress.trim() ||
                          !pppoePoolStart.trim() ||
                          !pppoePoolEnd.trim()
                        }
                        onClick={generatePppoeConfiguration}
                      >
                        Generate PPPoE service script
                      </Button>
                      {pppoeServiceScript && (
                        <div className="space-y-2">
                          <label htmlFor="pppoe-service-script" className="text-sm font-medium">
                            RouterOS PPPoE service script
                          </label>
                          <Textarea
                            id="pppoe-service-script"
                            className="min-h-64 font-mono text-xs"
                            readOnly
                            value={pppoeServiceScript}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            className="w-full"
                            onClick={() => void copyText(pppoeServiceScript, "PPPoE service script")}
                          >
                            <Copy className="mr-2 size-4" />
                            Copy PPPoE service script
                          </Button>
                        </div>
                      )}
                      <Alert>
                        <AlertTitle>Review before applying</AlertTitle>
                        <AlertDescription>
                          This creates or updates only the marked Astrid PPPoE pool, profile, and
                          server entry. It does not assign an IP address to the interface, add
                          firewall/NAT rules, or change existing DHCP/bridge configuration. Apply
                          from a trusted local RouterOS session after checking for address overlap.
                          HotSpot network and portal setup is configured separately below; the
                          RADIUS script also enables RADIUS on existing HotSpot profiles.
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}
                  {radiusServices.hotspot && (
                    <div className="space-y-3 border-t border-border pt-3">
                      <div>
                        <p className="text-sm font-medium">Prepare HotSpot access service</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Use a dedicated customer-facing bridge or VLAN. The gateway address
                          must already be assigned to that interface, and the matching trusted
                          TLS certificate must already exist on the router.
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label htmlFor="hotspot-interface" className="text-sm font-medium">
                            HotSpot interface
                          </label>
                          <Input
                            id="hotspot-interface"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="For example, bridge-hotspot"
                            value={hotspotInterface}
                            onChange={(event) => {
                              setHotspotInterface(event.target.value.trim());
                              setHotspotServiceScript(null);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="hotspot-address" className="text-sm font-medium">
                            HotSpot gateway IPv4 address
                          </label>
                          <Input
                            id="hotspot-address"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="For example, 192.168.50.1"
                            value={hotspotAddress}
                            onChange={(event) => {
                              setHotspotAddress(event.target.value.trim());
                              setHotspotServiceScript(null);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="hotspot-pool-start" className="text-sm font-medium">
                            Client pool start IPv4
                          </label>
                          <Input
                            id="hotspot-pool-start"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="For example, 192.168.50.10"
                            value={hotspotPoolStart}
                            onChange={(event) => {
                              setHotspotPoolStart(event.target.value.trim());
                              setHotspotServiceScript(null);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="hotspot-pool-end" className="text-sm font-medium">
                            Client pool end IPv4
                          </label>
                          <Input
                            id="hotspot-pool-end"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="For example, 192.168.50.250"
                            value={hotspotPoolEnd}
                            onChange={(event) => {
                              setHotspotPoolEnd(event.target.value.trim());
                              setHotspotServiceScript(null);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="hotspot-dns-name" className="text-sm font-medium">
                            HotSpot portal DNS name
                          </label>
                          <Input
                            id="hotspot-dns-name"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="For example, login.example.com"
                            value={hotspotDnsName}
                            onChange={(event) => {
                              setHotspotDnsName(event.target.value.trim());
                              setHotspotServiceScript(null);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="hotspot-certificate-name" className="text-sm font-medium">
                            RouterOS TLS certificate name
                          </label>
                          <Input
                            id="hotspot-certificate-name"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="For example, hotspot-login"
                            value={hotspotCertificateName}
                            onChange={(event) => {
                              setHotspotCertificateName(event.target.value.trim());
                              setHotspotServiceScript(null);
                            }}
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        disabled={
                          !hotspotInterface.trim() ||
                          !hotspotAddress.trim() ||
                          !hotspotPoolStart.trim() ||
                          !hotspotPoolEnd.trim() ||
                          !hotspotDnsName.trim() ||
                          !hotspotCertificateName.trim()
                        }
                        onClick={generateHotspotConfiguration}
                      >
                        Generate HotSpot service script
                      </Button>
                      {hotspotServiceScript && (
                        <div className="space-y-2">
                          <label htmlFor="hotspot-service-script" className="text-sm font-medium">
                            RouterOS HotSpot service script
                          </label>
                          <Textarea
                            id="hotspot-service-script"
                            className="min-h-64 font-mono text-xs"
                            readOnly
                            value={hotspotServiceScript}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            className="w-full"
                            onClick={() => void copyText(hotspotServiceScript, "HotSpot service script")}
                          >
                            <Copy className="mr-2 size-4" />
                            Copy HotSpot service script
                          </Button>
                        </div>
                      )}
                      <Alert>
                        <AlertTitle>Review before applying</AlertTitle>
                        <AlertDescription>
                          This creates or updates only the marked Astrid HotSpot pool, profile,
                          and server. It does not assign the gateway address, configure DHCP or
                          firewall/NAT, or set up WireGuard. The HTTPS certificate must match the
                          portal DNS name and be trusted by clients. Confirm the isolated network
                          and RADIUS settings before connecting subscribers.
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}
                </div>
              )}
              <Button className="w-full" onClick={() => setDialogOpen(false)}>
                Done
              </Button>
            </div>
          ) : token ? (
            <div className="space-y-4">
              <Alert>
                <AlertTitle>Generate the key on the RouterOS device</AlertTitle>
                <AlertDescription>
                  Run this idempotent RouterOS v7 script in Terminal. RouterOS keeps the private
                  key on the device and prints only its public key. The token stays in this browser
                  and is never included in the script.
                </AlertDescription>
              </Alert>
              <Textarea
                aria-label="RouterOS v7 key setup script"
                className="min-h-56 font-mono text-xs"
                readOnly
                value={buildRouterEnrollmentScript()}
              />
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => void copyText(buildRouterEnrollmentScript(), "RouterOS script")}
              >
                <Copy className="mr-2 size-4" />
                Copy RouterOS script
              </Button>
              <form onSubmit={(event) => void redeem(event)} className="space-y-3">
                <div className="space-y-2">
                  <label htmlFor="router-public-key" className="text-sm font-medium">
                    RouterOS public key
                  </label>
                  <Input
                    id="router-public-key"
                    required
                    autoComplete="off"
                    spellCheck={false}
                    pattern="[A-Za-z0-9+/]{43}="
                    title="Paste the 44-character WireGuard public key printed by RouterOS"
                    value={routerPublicKey}
                    onChange={(event) => setRouterPublicKey(event.target.value.trim())}
                    placeholder="Paste the public key printed by the script"
                    disabled={submitting}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Enrollment token expires{" "}
                  {expiresAt ? new Date(expiresAt).toLocaleString() : "in 30 minutes"}.
                  Redeeming binds this key once; the private key is never sent here. If the request
                  times out, retry without closing this dialog so the same secret can complete it.
                </p>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <LoaderCircle className="mr-2 size-4 animate-spin" />}
                  Bind router public key
                </Button>
              </form>
              <details className="rounded-md border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">Rollback script</summary>
                <p className="my-2 text-xs text-muted-foreground">
                  Run only if you want to remove the temporary enrollment interface.
                </p>
                <Textarea
                  aria-label="RouterOS rollback script"
                  className="min-h-24 font-mono text-xs"
                  readOnly
                  value={buildRouterEnrollmentRollbackScript()}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() =>
                    void copyText(buildRouterEnrollmentRollbackScript(), "Rollback script")
                  }
                >
                  <Copy className="mr-2 size-4" />
                  Copy rollback
                </Button>
              </details>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setDialogOpen(false)}
              >
                Close and revoke unused token
              </Button>
            </div>
          ) : (
            <form onSubmit={(event) => void create(event)} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="enrollment-router-name" className="text-sm font-medium">
                  Router name
                </label>
                <Input
                  id="enrollment-router-name"
                  autoFocus
                  required
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Branch Office Router"
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="enrollment-router-location" className="text-sm font-medium">
                  Location <span className="text-muted-foreground">(optional)</span>
                </label>
                <Input
                  id="enrollment-router-location"
                  maxLength={200}
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="e.g. Westlands"
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="enrollment-router-model" className="text-sm font-medium">
                  Router model <span className="text-muted-foreground">(optional)</span>
                </label>
                <Input
                  id="enrollment-router-model"
                  maxLength={100}
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="e.g. RB5009"
                  disabled={submitting}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                RouterOS v7 is selected for this enrollment. RouterOS v6 WireGuard support is not
                included in this milestone.
              </p>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <LoaderCircle className="mr-2 size-4 animate-spin" />}
                Create enrollment token
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
