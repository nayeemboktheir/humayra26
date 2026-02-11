import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Download, CheckCircle, Smartphone } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <img src="/pwa-192x192.png" alt="App icon" className="w-20 h-20 rounded-2xl mx-auto" />
          </div>
          <CardTitle className="text-2xl">Humayra Trade</CardTitle>
          <CardDescription>Install for a faster, app-like experience</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isInstalled ? (
            <div className="text-center space-y-3">
              <CheckCircle className="h-12 w-12 text-primary mx-auto" />
              <p className="font-medium">App is installed!</p>
              <Button onClick={() => navigate("/")} className="w-full">
                Open App
              </Button>
            </div>
          ) : deferredPrompt ? (
            <Button onClick={handleInstall} className="w-full" size="lg">
              <Download className="mr-2 h-5 w-5" />
              Install App
            </Button>
          ) : (
            <div className="space-y-4 text-center">
              <Smartphone className="h-12 w-12 text-muted-foreground mx-auto" />
              <div className="text-sm text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">How to install:</p>
                <p><strong>iPhone:</strong> Tap Share → "Add to Home Screen"</p>
                <p><strong>Android:</strong> Tap ⋮ menu → "Install app"</p>
                <p><strong>Desktop:</strong> Click the install icon in the address bar</p>
              </div>
            </div>
          )}
          <Button variant="ghost" onClick={() => navigate("/")} className="w-full">
            Continue in browser
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Install;
