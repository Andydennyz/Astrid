import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import AuthCallback from "./pages/auth/Callback.tsx";
import AcceptInvitePage from "./pages/accept-invite/page.tsx";
import AppLayout from "./components/layout/app-layout.tsx";

// Pages
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import DashboardPage from "./pages/dashboard/page.tsx";
import SubscribersPage from "./pages/subscribers/page.tsx";
import NetworkPage from "./pages/network/page.tsx";
import PackagesPage from "./pages/packages/page.tsx";
import FinancialsPage from "./pages/financials/page.tsx";
import TransactionsPage from "./pages/transactions/page.tsx";
import BillingPage from "./pages/billing/page.tsx";
import TicketsPage from "./pages/tickets/page.tsx";
import SmsReportsPage from "./pages/sms-reports/page.tsx";
import SettingsPage from "./pages/settings/page.tsx";
import OnboardingPage from "./pages/onboarding/page.tsx";
import WhatsNewPage from "./pages/whats-new/page.tsx";
import FeatureRequestsPage from "./pages/feature-requests/page.tsx";
import ReportsPage from "./pages/reports/page.tsx";
import RoutersPage from "./pages/routers/page.tsx";
import SessionsPage from "./pages/sessions/page.tsx";
import RadiusLogsPage from "./pages/radius-logs/page.tsx";
import PlatformTenantsPage from "./pages/platform-tenants/page.tsx";
import SubscriberProfileLayout from "./pages/subscribers/profile/layout.tsx";
import SubscriberProfileErrorBoundary from "./pages/subscribers/profile/error-boundary.tsx";
import {
  SubscriberActivitiesPage,
  SubscriberDevicesPage,
  SubscriberInvoicesPage,
  SubscriberOverviewPage,
  SubscriberPaymentsPage,
  SubscriberRouterAccountsPage,
  SubscriberSessionsPage,
  SubscriberSmsPage,
  SubscriberTicketsPage,
  SubscriberUsageAnalyticsPage,
} from "./pages/subscribers/profile/sections.tsx";

export default function App() {
  return (
    <DefaultProviders>
      <BrowserRouter>
        <Routes>
          {/* Auth callback — outside layout */}
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />

          {/* Landing page — outside layout */}
          <Route path="/" element={<Index />} />

          {/* App layout — all dashboard routes */}
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/subscribers" element={<SubscribersPage />} />
            <Route element={<SubscriberProfileErrorBoundary />}>
              <Route
                path="/subscribers/:subscriberId"
                element={<SubscriberProfileLayout />}
              >
                <Route index element={<Navigate to="overview" replace />} />
                <Route path="overview" element={<SubscriberOverviewPage />} />
                <Route
                  path="router-accounts"
                  element={<SubscriberRouterAccountsPage />}
                />
                <Route path="sessions" element={<SubscriberSessionsPage />} />
                <Route path="payments" element={<SubscriberPaymentsPage />} />
                <Route path="invoices" element={<SubscriberInvoicesPage />} />
                <Route path="sms" element={<SubscriberSmsPage />} />
                <Route
                  path="usage-analytics"
                  element={<SubscriberUsageAnalyticsPage />}
                />
                <Route path="devices" element={<SubscriberDevicesPage />} />
                <Route path="tickets" element={<SubscriberTicketsPage />} />
                <Route
                  path="activities"
                  element={<SubscriberActivitiesPage />}
                />
              </Route>
            </Route>
            <Route path="/network" element={<NetworkPage />} />
            <Route path="/packages" element={<PackagesPage />} />
            <Route path="/financials" element={<FinancialsPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/tickets" element={<TicketsPage />} />
            <Route path="/sms-reports" element={<SmsReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/whats-new" element={<WhatsNewPage />} />
            <Route path="/feature-requests" element={<FeatureRequestsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/routers" element={<RoutersPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/radius-logs" element={<RadiusLogsPage />} />
            <Route path="/platform/tenants" element={<PlatformTenantsPage />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </DefaultProviders>
  );
}
