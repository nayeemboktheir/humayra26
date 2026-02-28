import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Settings, DollarSign, RefreshCw, Loader2, Save, CheckCircle, Globe, Image, Phone, Mail, MapPin, Type, Send, FileText, Footprints } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

type SettingsMap = Record<string, string>;

const settingsKeys = [
  "cny_to_bdt_rate", "site_name", "search_placeholder", "hero_title", "hero_subtitle",
  "shipping_card_title", "shipping_card_subtitle", "facebook_url", "youtube_url",
  "whatsapp_number", "favicon_url", "contact_email", "contact_phone", "head_office_address",
  "hero_badge_1", "hero_badge_2", "hero_badge_3", "email_sender_name", "email_sender_address",
  "invoice_company_name", "invoice_company_address", "invoice_company_phone",
  "invoice_company_email", "invoice_company_website", "invoice_footer_text",
  "footer_copyright_text", "footer_developer_name", "footer_developer_url",
  "footer_prohibited_title", "footer_prohibited_text",
];

const tabs = [
  { id: "branding", label: "Branding", icon: Type },
  { id: "hero", label: "Hero", icon: Image },
  { id: "footer", label: "Footer", icon: Footprints },
  { id: "currency", label: "Currency", icon: DollarSign },
  { id: "email", label: "Email", icon: Send },
  { id: "invoice", label: "Invoice", icon: FileText },
] as const;

type TabId = typeof tabs[number]["id"];

function Field({ label, icon, children, span = 1 }: { label: string; icon?: React.ReactNode; children: React.ReactNode; span?: 1 | 2 }) {
  return (
    <div className={span === 2 ? "col-span-1 sm:col-span-2" : ""}>
      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1.5">
        {icon} {label}
      </Label>
      {children}
    </div>
  );
}

export default function AdminSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingRate, setFetchingRate] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("branding");

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

  const update = (key: string, value: string) => setSettings((prev) => ({ ...prev, [key]: value }));

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      for (const key of settingsKeys) {
        if (settings[key] === undefined) continue;
        const { error } = await supabase
          .from("app_settings")
          .upsert({ key, value: settings[key], updated_at: now, updated_by: user?.id } as any, { onConflict: "key" });
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

  const inp = (key: string, placeholder?: string) => (
    <Input value={settings[key] || ""} onChange={(e) => update(key, e.target.value)} placeholder={placeholder} className="h-9 text-sm" />
  );

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Settings className="h-5 w-5" /> App Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage homepage content and platform-wide configurations</p>
        </div>
        <Button onClick={handleSaveAll} disabled={saving} size="sm">
          <Save className="h-4 w-4 mr-1.5" /> {saving ? "Saving..." : "Save All"}
        </Button>
      </div>

      {/* Tabs */}
      <div className="bg-muted/50 rounded-lg p-1 flex gap-1 flex-wrap">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "branding" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm"><Type className="h-4 w-4 text-primary" /> Site Branding</CardTitle>
            <p className="text-xs text-muted-foreground">Site name, favicon, and search bar settings.</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Site Name">{inp("site_name", "TradeOn Global")}</Field>
              <Field label="Search Placeholder">{inp("search_placeholder", "Search by product name...")}</Field>
              <Field label="Favicon URL" span={2}>{inp("favicon_url", "/favicon.ico or https://...")}</Field>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "hero" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm"><Image className="h-4 w-4 text-primary" /> Hero Section</CardTitle>
            <p className="text-xs text-muted-foreground">Main banner on the homepage.</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Hero Title">{inp("hero_title", "Buy Chinese Products")}</Field>
              <Field label="Hero Subtitle">{inp("hero_subtitle", "Wholesale market from 1688.com...")}</Field>
              <Field label="Badge 1">{inp("hero_badge_1", "🔥 Trending")}</Field>
              <Field label="Badge 2">{inp("hero_badge_2", "✨ New Arrivals")}</Field>
              <Field label="Badge 3">{inp("hero_badge_3", "⭐ Best Sellers")}</Field>
              <Field label="Shipping Card Title">{inp("shipping_card_title", "Shipping Service")}</Field>
              <Field label="Shipping Card Subtitle" span={2}>{inp("shipping_card_subtitle", "Ship your products from China to Bangladesh")}</Field>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "footer" && (
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm"><Globe className="h-4 w-4 text-primary" /> Social & Contact</CardTitle>
              <p className="text-xs text-muted-foreground">Social media links and contact information displayed in the footer.</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Facebook URL" icon={<Globe className="h-3 w-3" />}>{inp("facebook_url", "https://facebook.com/...")}</Field>
                <Field label="YouTube URL" icon={<Globe className="h-3 w-3" />}>{inp("youtube_url", "https://youtube.com/...")}</Field>
                <Field label="WhatsApp Number" icon={<Phone className="h-3 w-3" />}>{inp("whatsapp_number", "01898889950")}</Field>
                <Field label="Contact Email" icon={<Mail className="h-3 w-3" />}>{inp("contact_email", "info@TradeOn.global")}</Field>
                <Field label="Contact Phone" icon={<Phone className="h-3 w-3" />}>{inp("contact_phone", "01898-889950")}</Field>
                <Field label="Head Office Address" icon={<MapPin className="h-3 w-3" />}>{inp("head_office_address", "House 16, Road 07...")}</Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm"><Footprints className="h-4 w-4 text-primary" /> Copyright & Developer</CardTitle>
              <p className="text-xs text-muted-foreground">Copyright text and developer credit in footer.</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Copyright Text" span={2}>{inp("footer_copyright_text", "tradeon.global - Wholesale from China to Bangladesh")}</Field>
                <Field label="Developer Name">{inp("footer_developer_name", "Platiroll")}</Field>
                <Field label="Developer URL">{inp("footer_developer_url", "https://platiroll.com/")}</Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-primary" /> Prohibited Items Notice</CardTitle>
              <p className="text-xs text-muted-foreground">Warning notice displayed in footer.</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-y-3">
                <Field label="Notice Title">{inp("footer_prohibited_title", "যে পণ্যগুলো TradeOn-এ অর্ডার করা যাবে না")}</Field>
                <Field label="Notice Text">
                  <Textarea value={settings.footer_prohibited_text || ""} onChange={(e) => update("footer_prohibited_text", e.target.value)} placeholder="সিগারেট, অ্যালকোহল..." rows={3} className="text-sm" />
                </Field>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "currency" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm"><DollarSign className="h-4 w-4 text-primary" /> Currency Exchange Rate</CardTitle>
            <p className="text-xs text-muted-foreground">CNY to BDT conversion rate used for price calculations.</p>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">1 CNY = ? BDT</Label>
                <Input type="number" step="0.01" value={settings.cny_to_bdt_rate || ""} onChange={(e) => update("cny_to_bdt_rate", e.target.value)} className="h-9 text-sm font-semibold" />
              </div>
              <Button variant="outline" size="sm" onClick={fetchLiveRate} disabled={fetchingRate} className="shrink-0 h-9">
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${fetchingRate ? "animate-spin" : ""}`} />
                {fetchingRate ? "Fetching..." : "Live Rate"}
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-2 p-2 rounded bg-muted/50 text-xs">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>¥100 = ৳{(100 * parseFloat(settings.cny_to_bdt_rate || "0")).toFixed(2)} BDT</span>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "email" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm"><Send className="h-4 w-4 text-primary" /> Email Marketing</CardTitle>
            <p className="text-xs text-muted-foreground">Configure sender details for transactional and marketing emails.</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Sender Name">{inp("email_sender_name", "TradeOn Global")}</Field>
              <Field label="Sender Email">{inp("email_sender_address", "noreply@tradeon.global")}</Field>
            </div>
            <div className="flex items-center gap-2 mt-3 p-2 rounded bg-muted/50 text-xs">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>RESEND_API_KEY is securely stored as a backend secret.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "invoice" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-primary" /> Invoice Settings</CardTitle>
            <p className="text-xs text-muted-foreground">Customize invoice branding, company details, and footer text.</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Company Name">{inp("invoice_company_name", "TradeOn.Global")}</Field>
              <Field label="Company Website">{inp("invoice_company_website", "www.tradeon.global")}</Field>
              <Field label="Company Phone">{inp("invoice_company_phone", "01898-889950")}</Field>
              <Field label="Company Email">{inp("invoice_company_email", "info@tradeon.global")}</Field>
              <Field label="Company Address" span={2}>{inp("invoice_company_address", "House 16, Road 07, Nikunja-02, Dhaka")}</Field>
              <Field label="Footer Text" span={2}>{inp("invoice_footer_text", "Thank you for shopping with us!")}</Field>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bottom save */}
      <Button onClick={handleSaveAll} disabled={saving} className="w-full" size="sm">
        <Save className="h-4 w-4 mr-1.5" /> {saving ? "Saving..." : "Save All Changes"}
      </Button>
    </div>
  );
}
