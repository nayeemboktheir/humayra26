import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppSettings = Record<string, string>;

const defaultSettings: AppSettings = {
  site_name: "TradeOn Global",
  search_placeholder: "Search For Money",
  hero_title: "Buy Chinese Products",
  hero_subtitle: "Wholesale market from 1688.com with shipping to Bangladesh",
  shipping_card_title: "Shipping Service",
  shipping_card_subtitle: "Ship your products from China to Bangladesh",
  facebook_url: "https://facebook.com",
  youtube_url: "https://youtube.com",
  whatsapp_number: "01898889950",
  favicon_url: "/favicon.ico",
  contact_email: "info@TradeOn.global",
  contact_phone: "01898-889950",
  head_office_address: "House 16, Road 07, Nikunja-02, Dhaka, Bangladesh, 1229",
  hero_badge_1: "🔥 Trending",
  hero_badge_2: "✨ New Arrivals",
  hero_badge_3: "⭐ Best Sellers",
  cny_to_bdt_rate: "17.5",
  price_markup_percentage: "15",
  footer_copyright_text: "tradeon.global - Wholesale from China to Bangladesh",
  footer_developer_name: "Platiroll",
  footer_developer_url: "https://platiroll.com/",
  footer_prohibited_title: "যে পণ্যগুলো TradeOn-এ অর্ডার করা যাবে না",
  footer_prohibited_text: "সিগারেট, অ্যালকোহল, তামাক, ক্যানাবিস, জুয়া সামগ্রী, মাদকদ্রব্য, ড্রোন, ওষুধপত্র, মোবাইল, অস্ত্র, বিস্ফোরক, ঝুঁকিপূর্ণ রাসায়নিক পদার্থ, মানবদেহের অঙ্গ বা শরীরের তরল, প্রাপ্তবয়স্ক পণ্য, অশ্লীল পণ্য, প্রাণী নির্যাতনের সাথে সম্পর্কিত পণ্য, বিপন্ন প্রজাতি, ডিজিটাল মুদ্রা, বিনিয়োগ-সংক্রান্ত পণ্য, ঘৃণা ছড়ানো সামগ্রী, সহিংস পণ্য, আপত্তিকর পণ্য, খাদ্য আইটেম।",
  invoice_company_name: "TradeOn.Global",
  invoice_company_address: "House 16, Road 07, Nikunja-02, Dhaka, Bangladesh, 1229",
  invoice_company_phone: "01898-889950",
  invoice_company_email: "info@TradeOn.global",
  invoice_company_website: "www.tradeon.global",
  invoice_footer_text: "Thank you for shopping with TradeOn Global",
  // Marketing
  meta_pixel_id: "",
  meta_pixel_enabled: "false",
  meta_capi_token: "",
  meta_capi_enabled: "false",
  meta_test_event_code: "",
  tiktok_pixel_id: "",
  tiktok_pixel_enabled: "false",
  google_analytics_id: "",
  google_analytics_enabled: "false",
};

let cachedSettings: AppSettings | null = null;
let fetchPromise: Promise<AppSettings> | null = null;

async function loadSettings(): Promise<AppSettings> {
  const { data } = await supabase.from("app_settings").select("key, value");
  const settings = { ...defaultSettings };
  if (data) {
    for (const row of data) {
      settings[row.key] = row.value;
    }
  }
  cachedSettings = settings;
  return settings;
}

export function invalidateSettingsCache() {
  cachedSettings = null;
  fetchPromise = null;
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(cachedSettings || defaultSettings);
  const [loading, setLoading] = useState(!cachedSettings);

  useEffect(() => {
    if (cachedSettings) {
      setSettings(cachedSettings);
      setLoading(false);
      return;
    }
    if (!fetchPromise) fetchPromise = loadSettings();
    fetchPromise.then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  const refresh = async () => {
    invalidateSettingsCache();
    const s = await loadSettings();
    setSettings(s);
  };

  return { settings, loading, refresh };
}
