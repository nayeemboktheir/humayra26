import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type MetaEventInput = {
  eventName: "InitiateCheckout" | "Purchase";
  eventId: string;
  eventSourceUrl?: string;
  value?: number;
  currency?: string;
  contentIds?: string[];
  numItems?: number;
  orderId?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  fbp?: string;
  fbc?: string;
};

const SETTINGS_KEYS = [
  "meta_pixel_id",
  "meta_pixel_enabled",
  "meta_capi_token",
  "meta_capi_enabled",
  "meta_test_event_code",
];

function normalizeEmail(email?: string) {
  return email?.trim().toLowerCase() || "";
}

function normalizePhone(phone?: string) {
  const digits = phone?.replace(/[^0-9]/g, "") || "";
  if (!digits) return "";
  if (digits.startsWith("0")) return `880${digits.slice(1)}`;
  if (!digits.startsWith("880")) return `880${digits}`;
  return digits;
}

function normalizeName(name?: string) {
  return name?.trim().toLowerCase().replace(/\s+/g, "") || "";
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function firstHeader(req: Request, keys: string[]) {
  for (const key of keys) {
    const value = req.headers.get(key);
    if (value) return value.split(",")[0].trim();
  }
  return undefined;
}

export async function sendMetaCapiEvent(
  admin: SupabaseClient,
  req: Request,
  input: MetaEventInput,
) {
  try {
    const { data: settingsRows } = await admin
      .from("app_settings")
      .select("key, value")
      .in("key", SETTINGS_KEYS);

    const settings: Record<string, string> = {};
    (settingsRows || []).forEach((row: any) => (settings[row.key] = row.value));

    if (settings.meta_pixel_enabled !== "true" || settings.meta_capi_enabled !== "true") {
      return { sent: false, reason: "disabled" };
    }

    const pixelId = settings.meta_pixel_id;
    const token = settings.meta_capi_token;
    if (!pixelId || !token) return { sent: false, reason: "missing_config" };

    const userData: Record<string, string> = {};
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    const firstName = normalizeName(input.firstName);
    const lastName = normalizeName(input.lastName);

    if (email) userData.em = await sha256(email);
    if (phone) userData.ph = await sha256(phone);
    if (firstName) userData.fn = await sha256(firstName);
    if (lastName) userData.ln = await sha256(lastName);

    const ip = firstHeader(req, ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"]);
    const userAgent = req.headers.get("user-agent") || undefined;
    if (ip) userData.client_ip_address = ip;
    if (userAgent) userData.client_user_agent = userAgent;
    if (input.fbp) userData.fbp = input.fbp;
    if (input.fbc) userData.fbc = input.fbc;

    const customData: Record<string, unknown> = {
      currency: input.currency || "BDT",
      value: Number(input.value || 0),
      content_type: "product",
    };
    if (input.contentIds?.length) customData.content_ids = input.contentIds;
    if (input.numItems) customData.num_items = input.numItems;
    if (input.orderId) customData.order_id = input.orderId;

    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: input.eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: input.eventId,
          event_source_url: input.eventSourceUrl,
          action_source: "website",
          user_data: userData,
          custom_data: customData,
        },
      ],
    };

    if (settings.meta_test_event_code) {
      payload.test_event_code = settings.meta_test_event_code;
    }

    const response = await fetch(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    const responseText = await response.text();
    if (!response.ok) {
      console.error("Meta CAPI error:", response.status, responseText.slice(0, 500));
      return { sent: false, reason: "meta_error", status: response.status };
    }

    console.log("Meta CAPI sent:", input.eventName, input.eventId);
    return { sent: true };
  } catch (error) {
    console.error("Meta CAPI send failed:", error instanceof Error ? error.message : error);
    return { sent: false, reason: "exception" };
  }
}