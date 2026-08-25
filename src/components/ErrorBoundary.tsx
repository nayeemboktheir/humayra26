import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Last-resort safety net: if any render crash slips through, show a friendly
 * reload screen instead of a blank white page.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("App crashed:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">কিছু একটা সমস্যা হয়েছে</h1>
          <p className="text-muted-foreground">পেজটি লোড করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।</p>
          <Button onClick={() => window.location.reload()}>পেজ রিলোড করুন</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
