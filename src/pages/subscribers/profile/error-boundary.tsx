import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link, Outlet } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";

type State = {
  error: Error | null;
};

export default class SubscriberProfileErrorBoundary extends Component<
  Record<string, never>,
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "Subscriber profile failed to render",
      error,
      info.componentStack,
    );
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="p-4 lg:p-6">
          <Alert variant="destructive">
            <AlertTitle>Could not load this subscriber profile</AlertTitle>
            <AlertDescription className="mt-2 space-y-3">
              <p>{this.state.error.message}</p>
              <Button asChild size="sm" variant="outline">
                <Link to="/subscribers">Back to subscribers</Link>
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    return <Outlet />;
  }
}
