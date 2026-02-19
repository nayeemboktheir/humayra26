import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppSettings = Record<string, string>;

const defaultSettings: AppSettings = {
  site_name: "TradeOn Global",
  search_placeholder: "Search by product name...",
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
