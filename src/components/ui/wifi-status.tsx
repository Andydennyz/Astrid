import { cn } from "@/lib/utils.ts";

type WifiStatusValue = "online" | "offline" | "unknown";

const statusLabels: Record<WifiStatusValue, string> = {
  online: "Online",
  offline: "Offline",
  unknown: "Unknown",
};

export function WifiSignalIcon({
  status,
  className,
}: {
  status: WifiStatusValue;
  className?: string;
}) {
  return (
    <svg
      aria-label={statusLabels[status]}
      role="img"
      viewBox="0 0 24 24"
      fill="none"
      className={cn(
        "size-4 shrink-0",
        status === "online" && "text-green-400",
        status === "offline" && "text-muted-foreground",
        status === "unknown" && "text-muted-foreground/70",
        className,
      )}
    >
      <path
        d="M1.5 8.8a16 16 0 0 1 21 0"
        className={
          status === "online" ? "wifi-wave wifi-wave-outer" : undefined
        }
        opacity={status === "online" ? undefined : 0.45}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M5 12.3a10.7 10.7 0 0 1 14 0"
        className={
          status === "online" ? "wifi-wave wifi-wave-middle" : undefined
        }
        opacity={status === "online" ? undefined : 0.65}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8.5 15.8a5.3 5.3 0 0 1 7 0"
        className={
          status === "online" ? "wifi-wave wifi-wave-inner" : undefined
        }
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="19.2" r="1.2" fill="currentColor" />
      {status === "offline" && (
        <path
          d="m4 20 16-16"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export function WifiStatus({
  status,
  className,
}: {
  status: WifiStatusValue;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        status === "online" &&
          "border-green-400/30 bg-green-400/10 text-green-400",
        status === "offline" &&
          "border-border bg-muted/40 text-muted-foreground",
        status === "unknown" &&
          "border-border bg-muted/40 text-muted-foreground",
        className,
      )}
    >
      <WifiSignalIcon status={status} className="size-3.5" />
      {statusLabels[status]}
    </span>
  );
}
