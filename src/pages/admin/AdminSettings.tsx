import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Settings, DollarSign, RefreshCw, Loader2, Save, CheckCircle, Globe, Image, MessageSquare, Phone, Mail, MapPin, Search, Type, Send, FileText } from "lucide-react";

type SettingsMap = Record<string, string>;

const settingsKeys = [
  "cny_to_bdt_rate",
  "site_name",
  "search_placeholder",
  "hero_title",
  "hero_subtitle",
  "shipping_card_title",
  "shipping_card_subtitle",
  "facebook_url",
  "youtube_url",
  "whatsapp_number",
  "favicon_url",
  "contact_email",
  "contact_phone",
  "head_office_address",
  "hero_badge_1",
  "hero_badge_2",
  "hero_badge_3",
  "email_sender_name",
  "email_sender_address",
  "invoice_company_name",
  "invoice_company_address",
  "invoice_company_phone",
  "invoice_company_email",
  "invoice_company_website",
  "invoice_footer_text",
];

export default function AdminSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingRate, setFetchingRate] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      const { data } = await supabase.from("app_settings").select("key, value");
      const map: SettingsMap = {};
      if (data) data.forEach((r) => (map[r.key] = r.value));
      setSettings(map);
      setLoading(false);
    };
    fetchAll();
  }, []);

  const update = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      for (const key of settingsKeys) {
        if (settings[key] === undefined) continue;
        const { error } = await supabase
          .from("app_settings")
          .upsert(
            { key, value: settings[key], updated_at: now, updated_by: user?.id } as any,
            { onConflict: "key" }
          );
        if (error) throw error;
      }
      toast({ title: "All settings saved!", description: "Changes will appear on the site after refresh." });
    } catch (e: any) {
      toast({ title: "Error saving", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const fetchLiveRate = async () => {
    setFetchingRate(true);
    try {
      const resp = await fetch("https://open.er-api.com/v6/latest/CNY");
      const data = await resp.json();
      if (data?.rates?.BDT) {
        const liveRate = data.rates.BDT.toFixed(2);
        update("cny_to_bdt_rate", liveRate);
        toast({ title: "Live rate fetched", description: `1 CNY = ${liveRate} BDT. Click Save All to apply.` });
      } else throw new Error("Could not fetch rate");
    } catch (e: any) {
      toast({ title: "Error fetching rate", description: e.message, variant: "destructive" });
    }
    setFetchingRate(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Settings className="h-6 w-6" /> App Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage homepage content and platform-wide configurations</p>
        </div>
        <Button onClick={handleSaveAll} disabled={saving} size="lg">
          <Save className="h-4 w-4 mr-2" /> {saving ? "Saving..." : "Save All Changes"}
        </Button>
      </div>

      {/* Currency Exchange Rate */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-5 w-5 text-emerald-500" /> Currency Exchange Rate
          </CardTitle>
          <CardDescription>CNY to BDT conversion rate used for price calculations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-xs">1 CNY = ? BDT</Label>
              <Input type="number" step="0.01" value={settings.cny_to_bdt_rate || ""} onChange={(e) => update("cny_to_bdt_rate", e.target.value)} className="text-lg font-bold" />
            </div>
            <Button variant="outline" onClick={fetchLiveRate} disabled={fetchingRate} className="shrink-0">
              <RefreshCw className={`h-4 w-4 mr-2 ${fetchingRate ? "animate-spin" : ""}`} />
              {fetchingRate ? "Fetching..." : "Fetch Live Rate"}
            </Button>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm">
            <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>Example: ¥100 = ৳{(100 * parseFloat(settings.cny_to_bdt_rate || "0")).toFixed(2)} BDT</span>
          </div>
        </CardContent>
      </Card>

      {/* Site Branding */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Type className="h-5 w-5 text-blue-500" /> Site Branding
          </CardTitle>
          <CardDescription>Site name, favicon, and search bar settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Site Name (Header Logo Text)</Label>
            <Input value={settings.site_name || ""} onChange={(e) => update("site_name", e.target.value)} placeholder="TradeOn Global" />
          </div>
          <div>
            <Label>Search Bar Placeholder</Label>
            <Input value={settings.search_placeholder || ""} onChange={(e) => update("search_placeholder", e.target.value)} placeholder="Search by product name..." />
          </div>
          <div>
            <Label>Favicon URL</Label>
            <Input value={settings.favicon_url || ""} onChange={(e) => update("favicon_url", e.target.value)} placeholder="/favicon.ico or https://..." />
            <p className="text-xs text-muted-foreground mt-1">Use a URL or path like /favicon.ico. Upload your favicon to public folder first.</p>
          </div>
        </CardContent>
      </Card>

      {/* Hero Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Image className="h-5 w-5 text-purple-500" /> Hero Section
          </CardTitle>
          <CardDescription>Main banner on the homepage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Hero Title</Label>
            <Input value={settings.hero_title || ""} onChange={(e) => update("hero_title", e.target.value)} placeholder="Buy Chinese Products" />
          </div>
          <div>
            <Label>Hero Subtitle</Label>
            <Input value={settings.hero_subtitle || ""} onChange={(e) => update("hero_subtitle", e.target.value)} placeholder="Wholesale market from 1688.com..." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Badge 1</Label>
              <Input value={settings.hero_badge_1 || ""} onChange={(e) => update("hero_badge_1", e.target.value)} placeholder="🔥 Trending" />
            </div>
            <div>
              <Label>Badge 2</Label>
              <Input value={settings.hero_badge_2 || ""} onChange={(e) => update("hero_badge_2", e.target.value)} placeholder="✨ New Arrivals" />
            </div>
            <div>
              <Label>Badge 3</Label>
              <Input value={settings.hero_badge_3 || ""} onChange={(e) => update("hero_badge_3", e.target.value)} placeholder="⭐ Best Sellers" />
            </div>
          </div>
          <div>
            <Label>Shipping Card Title</Label>
            <Input value={settings.shipping_card_title || ""} onChange={(e) => update("shipping_card_title", e.target.value)} placeholder="Shipping Service" />
          </div>
          <div>
            <Label>Shipping Card Subtitle</Label>
            <Input value={settings.shipping_card_subtitle || ""} onChange={(e) => update("shipping_card_subtitle", e.target.value)} placeholder="Ship your products from China to Bangladesh" />
          </div>
        </CardContent>
      </Card>

      {/* Social & Contact */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-5 w-5 text-orange-500" /> Social Links & Contact
          </CardTitle>
          <CardDescription>Social media links, WhatsApp, and contact information shown in the footer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-1"><Globe className="h-3 w-3" /> Facebook URL</Label>
              <Input value={settings.facebook_url || ""} onChange={(e) => update("facebook_url", e.target.value)} placeholder="https://facebook.com/..." />
            </div>
            <div>
              <Label className="flex items-center gap-1"><Globe className="h-3 w-3" /> YouTube URL</Label>
              <Input value={settings.youtube_url || ""} onChange={(e) => update("youtube_url", e.target.value)} placeholder="https://youtube.com/..." />
            </div>
          </div>
          <div>
            <Label className="flex items-center gap-1"><Phone className="h-3 w-3" /> WhatsApp Number</Label>
            <Input value={settings.whatsapp_number || ""} onChange={(e) => update("whatsapp_number", e.target.value)} placeholder="01898889950" />
          </div>
          <div>
            <Label className="flex items-center gap-1"><Mail className="h-3 w-3" /> Contact Email</Label>
            <Input value={settings.contact_email || ""} onChange={(e) => update("contact_email", e.target.value)} placeholder="info@TradeOn.global" />
          </div>
          <div>
            <Label className="flex items-center gap-1"><Phone className="h-3 w-3" /> Contact Phone</Label>
            <Input value={settings.contact_phone || ""} onChange={(e) => update("contact_phone", e.target.value)} placeholder="01898-889950" />
          </div>
          <div>
            <Label className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Head Office Address</Label>
            <Input value={settings.head_office_address || ""} onChange={(e) => update("head_office_address", e.target.value)} placeholder="House 16, Road 07..." />
          </div>
        </CardContent>
      </Card>

      {/* Email Marketing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-5 w-5 text-rose-500" /> Email Marketing (Resend)
          </CardTitle>
          <CardDescription>Configure email sender details for transactional and marketing emails via Resend. The API key is stored securely as a backend secret.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Sender Name</Label>
            <Input value={settings.email_sender_name || ""} onChange={(e) => update("email_sender_name", e.target.value)} placeholder="TradeOn Global" />
            <p className="text-xs text-muted-foreground mt-1">Name that appears in the "From" field of emails.</p>
          </div>
          <div>
            <Label>Sender Email Address</Label>
            <Input value={settings.email_sender_address || ""} onChange={(e) => update("email_sender_address", e.target.value)} placeholder="noreply@tradeon.global" />
            <p className="text-xs text-muted-foreground mt-1">Must be a verified domain in your Resend account.</p>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm">
            <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>RESEND_API_KEY is securely stored as a backend secret.</span>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" /> Invoice Settings
          </CardTitle>
          <CardDescription>Customize invoice branding, company details, and footer text.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Company Name</Label>
            <Input value={settings.invoice_company_name || ""} onChange={(e) => update("invoice_company_name", e.target.value)} placeholder="TradeOn.Global" />
          </div>
          <div>
            <Label>Company Address</Label>
            <Input value={settings.invoice_company_address || ""} onChange={(e) => update("invoice_company_address", e.target.value)} placeholder="House 16, Road 07, Nikunja-02, Dhaka" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Company Phone</Label>
              <Input value={settings.invoice_company_phone || ""} onChange={(e) => update("invoice_company_phone", e.target.value)} placeholder="01898-889950" />
            </div>
            <div>
              <Label>Company Email</Label>
              <Input value={settings.invoice_company_email || ""} onChange={(e) => update("invoice_company_email", e.target.value)} placeholder="info@tradeon.global" />
            </div>
          </div>
          <div>
            <Label>Company Website</Label>
            <Input value={settings.invoice_company_website || ""} onChange={(e) => update("invoice_company_website", e.target.value)} placeholder="www.tradeon.global" />
          </div>
          <div>
            <Label>Invoice Footer Text</Label>
            <Input value={settings.invoice_footer_text || ""} onChange={(e) => update("invoice_footer_text", e.target.value)} placeholder="Thank you for shopping with us!" />
          </div>
        </CardContent>
      </Card>

      {/* Bottom save button */}
      <Button onClick={handleSaveAll} disabled={saving} className="w-full" size="lg">
        <Save className="h-4 w-4 mr-2" /> {saving ? "Saving..." : "Save All Changes"}
      </Button>
    </div>
  );
}
