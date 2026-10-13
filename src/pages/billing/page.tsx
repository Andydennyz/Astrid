import ComingSoonPage from "../_components/coming-soon-page.tsx";
import { CreditCard, FileText, DollarSign, History } from "lucide-react";

export default function BillingPage() {
  return (
    <ComingSoonPage
      title="My Billing"
      description="Manage your operator subscription — view invoices, payment history, and manage your NetAdmin plan."
      icon={CreditCard}
      accentColor="text-amber-400"
      features={[
        { icon: DollarSign, label: "Subscription Plans", description: "View and change your operator plan" },
        { icon: FileText, label: "My Invoices", description: "Download your billing invoices" },
        { icon: History, label: "Payment History", description: "Full history of your payments" },
        { icon: CreditCard, label: "Payment Methods", description: "Add or update payment methods" },
      ]}
    />
  );
}
