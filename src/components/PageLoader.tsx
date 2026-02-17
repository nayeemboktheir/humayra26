import { Loader2 } from "lucide-react";

export default function PageLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
    </div>
  );
}
