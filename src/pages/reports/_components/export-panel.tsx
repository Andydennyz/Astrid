import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useWorkspace } from "@/components/providers/workspace.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Download, Users, FileText, ArrowLeftRight } from "lucide-react";
import Papa from "papaparse";

type ExportKey = "subscribers" | "invoices" | "transactions" | "overdue";

interface ExportCard {
  key: ExportKey;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  border: string;
  bg: string;
}

const EXPORTS: ExportCard[] = [
  {
    key: "subscribers",
    label: "Subscribers",
    description: "All subscriber records including status, package, monthly fee, and contact details",
    icon: Users,
    color: "text-cyan-400",
    border: "border-cyan-400/20",
    bg: "bg-cyan-400/5",
  },
  {
    key: "invoices",
    label: "Invoices",
    description: "Up to 2,000 most recent invoices with subscriber name, amount, status, and dates",
    icon: FileText,
    color: "text-green-400",
    border: "border-green-400/20",
    bg: "bg-green-400/5",
  },
  {
    key: "transactions",
    label: "Transactions",
    description: "Up to 2,000 most recent completed transactions with method, type, and reference",
    icon: ArrowLeftRight,
    color: "text-violet-400",
    border: "border-violet-400/20",
    bg: "bg-violet-400/5",
  },
  {
    key: "overdue",
    label: "Overdue Invoices",
    description: "All overdue invoices with subscriber name, phone, amount, due date, and days overdue",
    icon: FileText,
    color: "text-red-400",
    border: "border-red-400/20",
    bg: "bg-red-400/5",
  },
];

function downloadCsv(data: Record<string, unknown>[], filename: string) {
  const csv = Papa.unparse(data, { quotes: true, header: true });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function ExportCardItem({ card }: { card: ExportCard }) {
  const { selectedWorkspaceId: workspaceId } = useWorkspace();
  const [exporting, setExporting] = useState(false);
  const Icon = card.icon;

  const subscriberData = useQuery(
    api.reports.exportSubscribers,
    card.key === "subscribers" && workspaceId ? { workspaceId } : "skip",
  );
  const invoiceData = useQuery(
    api.reports.exportInvoices,
    card.key === "invoices" && workspaceId ? { workspaceId } : "skip",
  );
  const transactionData = useQuery(
    api.reports.exportTransactions,
    card.key === "transactions" && workspaceId ? { workspaceId } : "skip",
  );
  const overdueData = useQuery(
    api.reports.exportOverdueInvoices,
    card.key === "overdue" && workspaceId ? { workspaceId } : "skip",
  );

  const getData = () => {
    if (card.key === "subscribers") return subscriberData;
    if (card.key === "invoices") return invoiceData;
    if (card.key === "overdue") return overdueData;
    return transactionData;
  };

  const handleExport = () => {
    const raw = getData();
    if (!raw) return;
    setExporting(true);
    try {
      const date = new Date().toISOString().split("T")[0];
      downloadCsv(raw as Record<string, unknown>[], `netadmin-${card.key}-${date}.csv`);
    } finally {
      setExporting(false);
    }
  };

  const raw = getData();
  const rowCount = raw?.length ?? null;

  return (
    <div className={`rounded-xl border ${card.border} ${card.bg} p-5 flex flex-col gap-4`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${card.border} bg-background shrink-0`}>
          <Icon size={18} className={card.color} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{card.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{card.description}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {rowCount === null ? "Loading..." : `${rowCount.toLocaleString()} rows ready`}
        </span>
        <Button
          size="sm"
          onClick={handleExport}
          disabled={exporting || rowCount === null}
          className="gap-2 h-8"
        >
          {exporting ? <Spinner className="size-3.5" /> : <Download size={13} />}
          Download CSV
        </Button>
      </div>
    </div>
  );
}

export default function ExportPanel() {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Export Data to CSV</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Download your data as CSV files compatible with Excel, Google Sheets, and other tools.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {EXPORTS.map((card) => (
          <ExportCardItem key={card.key} card={card} />
        ))}
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Note:</strong> Exports include data up to the time of download. Subscriber and invoice exports are complete. Transaction exports are capped at the 2,000 most recent records. All monetary values are in KES.
      </div>
    </div>
  );
}
