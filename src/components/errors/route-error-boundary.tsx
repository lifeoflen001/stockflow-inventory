import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

export class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Page rendering failed", error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="flex min-h-[60vh] items-center justify-center p-6"><div className="max-w-md rounded-xl border bg-card p-8 text-center shadow-sm"><div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"><AlertTriangle className="size-6" /></div><h2 className="text-lg font-semibold">This page could not be displayed</h2><p className="mt-2 text-sm text-muted-foreground">The page encountered an unexpected data or rendering error. Reload it to try again.</p><Button className="mt-5" onClick={() => window.location.reload()}><RefreshCw className="size-4" />Reload page</Button></div></div>;
  }
}
