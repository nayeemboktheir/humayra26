import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Save, Loader2, CheckCircle, BarChart3, FileText, Eye, EyeOff, Megaphone } from "lucide-react";

type SettingsMap = Record<string, string>;

const marketingKeys = [
  "meta_pixel_id", "meta_pixel_enabled", "meta_capi_token", "meta_capi_enabled",
  "meta_test_event_code", "tiktok_pixel_id", "tiktok_pixel_enabled",
  "google_analytics_id", "google_analytics_enabled",
];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground mb-1.5">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

export default function AdminMarketing() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCapiToken, setShowCapiToken] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_settings").select("key, value");
      const map: SettingsMap = {};
      if (data) data.forEach((r) => (map[r.key] = r.value));
      setSettings(map);
      setLoading(false);
    })();
  }, []);

  const update = (key: string, value: string) => setSettings((prev) => ({ ...prev, [key]: value }));
  const toggle = (key: string) => update(key, settings[key] === "true" ? "false" : "true");

  const handleSave = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      for (const key of marketingKeys) {
        if (settings[key] === undefined) continue;
        const { error } = await supabase
          .from("app_settings")
          .upsert({ key, value: settings[key], updated_at: now, updated_by: user?.id } as any, { onConflict: "key" });
        if (error) throw error;
      }
      toast({ title: "Marketing settings saved!" });
    } catch (e: any) {
      toast({ title: "Error saving", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  const inp = (key: string, placeholder?: string) => (
    <Input value={settings[key] || ""} onChange={(e) => update(key, e.target.value)} placeholder={placeholder} className="h-9 text-sm" />
  );

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Megaphone className="h-5 w-5" /> Marketing & Tracking</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage tracking pixels and analytics integrations</p>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm">
          <Save className="h-4 w-4 mr-1.5" /> {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* Meta Pixel */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm"><BarChart3 className="h-4 w-4 text-blue-600" /> Meta Pixel (Facebook Pixel)</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Track website visitors and their actions for Meta/Facebook Ads</p>
            </div>
            <Switch checked={settings.meta_pixel_enabled === "true"} onCheckedChange={() => toggle("meta_pixel_enabled")} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-y-3">
            <Field label="Meta Pixel ID" hint="Find your Pixel ID in Meta Events Manager → Data Sources → Your Pixel">
              {inp("meta_pixel_id", "1105096634875101")}
            </Field>
          </div>
          {settings.meta_pixel_enabled === "true" && settings.meta_pixel_id && (
            <div className="flex items-center gap-2 mt-3 p-2.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle className="h-3.5 w-3.5 shrink-0" />
              <span>Pixel will track: PageView, ViewContent, AddToCart, InitiateCheckout, Purchase</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conversion API */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-blue-600" /> Conversion API (CAPI)</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Server-side tracking for better data accuracy and privacy compliance</p>
            </div>
            <Switch checked={settings.meta_capi_enabled === "true"} onCheckedChange={() => toggle("meta_capi_enabled")} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-y-3">
            <Field label="Access Token" hint="Generate a token in Events Manager → Settings → Conversions API">
              <div className="relative">
                <Input
                  type={showCapiToken ? "text" : "password"}
                  value={settings.meta_capi_token || ""}
                  onChange={(e) => update("meta_capi_token", e.target.value)}
                  placeholder="EAAxxxxxxxxx..."
                  className="h-9 text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCapiToken(!showCapiToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCapiToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <Field label="Test Event Code (Optional)" hint="Use this to test events in Events Manager before going live">
              {inp("meta_test_event_code", "TEST10922")}
            </Field>
          </div>
          {settings.meta_capi_enabled === "true" && settings.meta_capi_token && (
            <div className="mt-3 p-2.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-700 dark:text-emerald-400 space-y-1">
              <div className="flex items-center gap-2 font-medium"><CheckCircle className="h-3.5 w-3.5 shrink-0" /> Server-Side Tracking Active</div>
              <ul className="list-disc list-inside ml-5 space-y-0.5">
                <li>InitiateCheckout - When users start checkout</li>
                <li>Purchase - Order completion with full customer data</li>
                <li>Includes: Phone, Name, IP, User Agent, Meta ClickID (fbc), Browser ID (fbp)</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* TikTok Pixel */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm"><BarChart3 className="h-4 w-4 text-foreground" /> TikTok Pixel</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Track website visitors for TikTok Ads campaigns</p>
            </div>
            <Switch checked={settings.tiktok_pixel_enabled === "true"} onCheckedChange={() => toggle("tiktok_pixel_enabled")} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-y-3">
            <Field label="TikTok Pixel ID" hint="Find your Pixel ID in TikTok Ads Manager → Assets → Events">
              {inp("tiktok_pixel_id", "CxxxxxxxxxxxxxxxxP")}
            </Field>
          </div>
          {settings.tiktok_pixel_enabled === "true" && settings.tiktok_pixel_id && (
            <div className="flex items-center gap-2 mt-3 p-2.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle className="h-3.5 w-3.5 shrink-0" />
              <span>TikTok Pixel will track: PageView, ViewContent, AddToCart, PlaceAnOrder</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Google Analytics */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm"><BarChart3 className="h-4 w-4 text-primary" /> Google Analytics</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Track website traffic and user behavior with Google Analytics 4</p>
            </div>
            <Switch checked={settings.google_analytics_enabled === "true"} onCheckedChange={() => toggle("google_analytics_enabled")} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-y-3">
            <Field label="Measurement ID" hint="Find your ID in Google Analytics → Admin → Data Streams → Your Stream">
              {inp("google_analytics_id", "G-XXXXXXXXXX")}
            </Field>
          </div>
          {settings.google_analytics_enabled === "true" && settings.google_analytics_id && (
            <div className="flex items-center gap-2 mt-3 p-2.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle className="h-3.5 w-3.5 shrink-0" />
              <span>GA4 is active and tracking page views automatically</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full" size="sm">
        <Save className="h-4 w-4 mr-1.5" /> {saving ? "Saving..." : "Save Marketing Settings"}
      </Button>
    </div>
  );
}
