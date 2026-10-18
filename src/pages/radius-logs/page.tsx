import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import { Authenticated, Unauthenticated } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import { ShieldCheck, RefreshCw, ChevronDown } from "lucide-react";

function TypeBadge({
  type,
}: {
  type: "authorize" | "authenticate" | "accounting";
}) {
  const map = {
    authorize: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    authenticate: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    accounting: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  };
  return <Badge className={map[type]}>{type}</Badge>;
}

function ResponseBadge({ code }: { code: "accept" | "reject" | "error" }) {
  if (code === "accept")
    return (
      <Badge className="bg-green-500/15 text-green-400 border-green-500/30">
        Accept
      </Badge>
    );
  if (code === "reject")
    return (
      <Badge className="bg-red-500/15 text-red-400 border-red-500/30">
        Reject
      </Badge>
    );
  return (
    <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/30">
      Error
    </Badge>
  );
}

function JsonExpander({ label, value }: { label: string; value?: string }) {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = value;
  }
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
          {label} <ChevronDown className="w-3 h-3" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 rounded bg-muted/50 p-2 text-[10px] font-mono whitespace-pre-wrap overflow-auto max-h-40">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

function RadiusLogsInner() {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [typeFilter, setTypeFilter] = useState<
    "all" | "authorize" | "authenticate" | "accounting"
  >("all");
  const [codeFilter, setCodeFilter] = useState<
    "all" | "accept" | "reject" | "error"
  >("all");

  const { results, status, loadMore } = usePaginatedQuery(
    api.radius.listLogs,
    workspaceId
      ? {
          workspaceId,
          type: typeFilter === "all" ? undefined : typeFilter,
          responseCode: codeFilter === "all" ? undefined : codeFilter,
        }
      : "skip",
    { initialNumItems: 30 },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="authorize">Authorize</SelectItem>
            <SelectItem value="authenticate">Authenticate</SelectItem>
            <SelectItem value="accounting">Accounting</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={codeFilter}
          onValueChange={(v) => setCodeFilter(v as typeof codeFilter)}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Response" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Responses</SelectItem>
            <SelectItem value="accept">Accept</SelectItem>
            <SelectItem value="reject">Reject</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {status === "LoadingFirstPage" ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>NAS</TableHead>
                <TableHead>NAS IP</TableHead>
                <TableHead>Response</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Request</TableHead>
                <TableHead>Reply</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center text-muted-foreground py-12"
                  >
                    No RADIUS log entries yet. Logs appear here when FreeRADIUS
                    queries the REST endpoints.
                  </TableCell>
                </TableRow>
              ) : (
                results.map((log) => (
                  <TableRow key={log._id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <TypeBadge type={log.type} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.username}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.nasIdentifier ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.nasIpAddress ?? "—"}
                    </TableCell>
                    <TableCell>
                      <ResponseBadge code={log.responseCode} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
                      {log.rejectReason ?? "—"}
                    </TableCell>
                    <TableCell>
                      <JsonExpander label="View" value={log.requestAttrs} />
                    </TableCell>
                    <TableCell>
                      <JsonExpander label="View" value={log.responseAttrs} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {status === "CanLoadMore" && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => loadMore(30)}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Load More
          </Button>
        </div>
      )}
    </div>
  );
}

export default function RadiusLogsPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          RADIUS Auth Logs
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Real-time log of every authorize, authenticate, and accounting request
          from FreeRADIUS.
        </p>
      </div>

      {/* FreeRADIUS rlm_rest setup guidance */}
      <div className="order-last rounded-lg border border-primary/20 bg-muted/30 p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">
          FreeRADIUS 3.x REST bridge
        </p>
        <p className="text-xs text-muted-foreground">
          This is a configuration template, not a live connection. Replace both
          placeholders; keep the gateway token in a root-readable configuration
          file and set the matching
          <code className="mx-1">RADIUS_GATEWAY_TOKEN</code> on the Convex
          server. The endpoint requires HTTPS and uses the operating system CA
          store for certificate verification. Subscriber PPPoE and Hotspot
          credentials are stored encrypted with
          <code className="mx-1">PPPOE_CREDENTIAL_ENCRYPTION_KEY</code>. This
          credential-check flow expects PAP; CHAP/MS-CHAP are not supported.
          Hotspot requests must include
          <code className="mx-1">Service-Type=Login-User</code>; PPPoE uses
          <code className="mx-1">Service-Type=Framed-User</code>. If the
          attribute is omitted, the bridge resolves the service from a unique
          username within the router&apos;s workspace.
        </p>
        <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">{`# /etc/freeradius/3.0/mods-available/rest
rest {
  connect_uri = "https://<YOUR-DEPLOYMENT>.convex.site"
  connect_timeout = 2.0
  timeout = 2.5
  tls {
    check_cert = yes
    check_cert_cn = yes
  }
  authorize {
    uri = "\${..connect_uri}/api/radius/authorize"
    method = 'post'
    body = 'json'
    force_to = 'json'
  }
  accounting {
    uri = "\${..connect_uri}/api/radius/accounting"
    method = 'post'
    body = 'json'
    force_to = 'json'
  }
}

# Add to the appropriate virtual server (replace the token placeholder):
authorize {
  update control {
    REST-HTTP-Header := "Authorization: Bearer <RADIUS_GATEWAY_TOKEN>"
  }
  rest
  if (&control:Auth-Type == Accept) {
    accept
  }
  if (&control:Auth-Type == Reject) {
    reject
  }
}

accounting {
  update control {
    REST-HTTP-Header := "Authorization: Bearer <RADIUS_GATEWAY_TOKEN>"
  }
  rest
}
`}</pre>
        <p className="text-xs text-muted-foreground">
          The REST module serializes request attributes as JSON, including the
          RADIUS
          <code className="mx-1">Service-Type</code> used to select the
          service-specific subscriber credentials and package. The bridge
          returns
          <code className="mx-1">control:Auth-Type</code> and
          <code className="mx-1">reply:Mikrotik-Rate-Limit</code>; RouterOS rate
          values are
          <code className="mx-1">upload/download</code> from the router&apos;s
          perspective. The generated settings allow a 2.5-second REST call and a
          3-second RouterOS RADIUS wait, staying below RouterOS&apos;s warning
          threshold for PPP authentication. Validate the completed configuration
          with <code>freeradius -XC</code> before restart.
        </p>
      </div>

      <Unauthenticated>
        <div className="flex items-center justify-center py-12">
          <SignInButton />
        </div>
      </Unauthenticated>
      <Authenticated>
        <RadiusLogsInner />
      </Authenticated>
    </div>
  );
}
