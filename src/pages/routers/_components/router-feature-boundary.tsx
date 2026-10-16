import { Component, type ErrorInfo, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";

type Props = {
  feature: string;
  children: ReactNode;
};

type State = {
  failed: boolean;
};

export default class RouterFeatureBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Router ${this.props.feature} failed to render`, error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <Alert variant="destructive">
          <AlertTitle>{this.props.feature} is temporarily unavailable</AlertTitle>
          <AlertDescription className="mt-2 space-y-2">
            <p>
              The connected Convex backend may not have the functions required by this feature yet.
              The router inventory remains available; refresh after the backend update is published.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
              Refresh page
            </Button>
          </AlertDescription>
        </Alert>
      );
    }

    return this.props.children;
  }
}
