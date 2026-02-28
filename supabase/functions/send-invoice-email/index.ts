import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface OrderData {
  order_number: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  shipping_charges?: number | null;
  commission?: number | null;
  domestic_courier_charge?: number | null;
  variant_name?: string | null;
  notes?: string | null;
  created_at: string;
  status: string;
  invoice_name?: string | null;
  profile?: {
    full_name?: string | null;
    phone?: string | null;
    address?: string | null;
  } | null;
}

function parseOrderLines(order: OrderData) {
  if (order.notes) {
    const lines = order.notes
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(.+?):\s*(\d+)\s*pcs\s*×\s*৳([\d,]+)/);
        if (!match) return null;
        const [, name, qty, price] = match;
        const unitPrice = Number(price.replace(/,/g, ""));
        return { name: name.trim(), qty: Number(qty), unitPrice, total: Number(qty) * unitPrice };
      })
      .filter(Boolean);
    if (lines.length > 0) return lines as { name: string; qty: number; unitPrice: number; total: number }[];
  }
  return [
    {
      name: order.product_name + (order.variant_name ? ` (${order.variant_name})` : ""),
      qty: order.quantity,
      unitPrice: Number(order.unit_price),
      total: Number(order.total_price),
    },
  ];
}

function calcTotals(orders: OrderData[]) {
  let productTotal = 0, domesticTotal = 0, shippingTotal = 0, commissionTotal = 0;
  for (const o of orders) {
    productTotal += Number(o.total_price);
    domesticTotal += Number(o.domestic_courier_charge || 0);
    shippingTotal += Number(o.shipping_charges || 0);
    commissionTotal += Number(o.commission || 0);
  }
  return { productTotal, domesticTotal, shippingTotal, commissionTotal, grandTotal: productTotal + domesticTotal + shippingTotal + commissionTotal };
}

const ACCENT = "#1874bd";

function buildInvoiceHTML(orders: OrderData[], settings: Record<string, string>) {
  const isCombined = orders.length > 1;
  const profile = orders[0].profile;
  const totals = calcTotals(orders);
  const invoiceDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const invoiceNumber = isCombined ? `COMB-${Date.now().toString(36).toUpperCase()}` : orders[0].order_number;

  const companyName = settings.invoice_company_name || settings.site_name || "TradeOn.Global";
  const companyAddress = settings.invoice_company_address || settings.head_office_address || "";
  const companyPhone = settings.invoice_company_phone || settings.contact_phone || "";
  const companyEmail = settings.invoice_company_email || settings.contact_email || "";
  const companyWebsite = settings.invoice_company_website || "www.tradeon.global";
  const footerText = settings.invoice_footer_text || "Thank you for shopping with us!";
  const invoiceName = orders[0].invoice_name;
  const customerName = profile?.full_name || invoiceName || "Valued Customer";

  let tableRows = "";
  for (const o of orders) {
    const lines = parseOrderLines(o);
    const domesticCourier = Number(o.domestic_courier_charge || 0);
    const orderTotal = Number(o.total_price) + domesticCourier;

    if (isCombined) {
      tableRows += `<tr><td colspan="4" style="background:#eef5fc;padding:8px 14px;font-weight:700;font-size:12px;color:${ACCENT};border-bottom:2px solid #d4e6f6;">Order #${o.order_number}${o.invoice_name ? ` — ${o.invoice_name}` : ""}</td></tr>`;
    }

    lines.forEach((line, i) => {
      const bg = i % 2 === 1 ? "background:#f9fafb;" : "";
      tableRows += `<tr style="${bg}">
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;">${line.name}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center;">${line.qty}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;">৳${line.unitPrice.toLocaleString()}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:600;">৳${line.total.toLocaleString()}</td>
      </tr>`;
    });

    if (domesticCourier > 0) {
      tableRows += `<tr style="background:#f9fafb;">
        <td colspan="3" style="padding:8px 14px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;">Domestic Courier (China)</td>
        <td style="padding:8px 14px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-weight:600;">৳${domesticCourier.toLocaleString()}</td>
      </tr>`;
    }

    if (isCombined) {
      tableRows += `<tr><td colspan="3" style="padding:8px 14px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;border-bottom:2px solid #e5e7eb;">Subtotal</td>
        <td style="padding:8px 14px;text-align:right;font-size:13px;font-weight:700;border-bottom:2px solid #e5e7eb;">৳${orderTotal.toLocaleString()}</td></tr>`;
    }
  }

  let summaryRows = `
    <div style="display:flex;justify-content:space-between;padding:7px 0;font-size:13px;color:#4b5563;">
      <span>Product Total</span><span style="font-weight:600;">৳${totals.productTotal.toLocaleString()}</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:7px 0;font-size:13px;color:#4b5563;">
      <span>Domestic Courier (China)</span><span style="font-weight:600;">৳${totals.domesticTotal.toLocaleString()}</span>
    </div>`;
  if (totals.shippingTotal > 0) {
    summaryRows += `<div style="display:flex;justify-content:space-between;padding:7px 0;font-size:13px;color:#4b5563;">
      <span>International Shipping</span><span style="font-weight:600;">৳${totals.shippingTotal.toLocaleString()}</span>
    </div>`;
  }
  if (totals.commissionTotal > 0) {
    summaryRows += `<div style="display:flex;justify-content:space-between;padding:7px 0;font-size:13px;color:#4b5563;">
      <span>Commission</span><span style="font-weight:600;">৳${totals.commissionTotal.toLocaleString()}</span>
    </div>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice - ${invoiceNumber}</title></head><body style="font-family:'Segoe UI',system-ui,-apple-system,sans-serif;padding:40px;color:#1a1a2e;background:#f4f6f9;margin:0;">
  <div style="max-width:780px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:${ACCENT};padding:28px 36px;color:#fff;">
      <div style="font-size:26px;font-weight:800;letter-spacing:-0.5px;">${companyName}</div>
      <div style="font-size:12px;opacity:0.85;margin-top:4px;">${companyWebsite} | ${companyEmail}</div>
    </div>
    <div style="padding:32px 36px;">
      <div style="margin-bottom:24px;">
        <div style="font-size:16px;color:#1a1a2e;">Assalamu Alaikum <strong>${customerName}</strong>,</div>
        <div style="font-size:14px;color:#4b5563;margin-top:8px;line-height:1.6;">
          Thank you for your ${isCombined ? "orders" : "order"} with <strong>${companyName}</strong>! We truly appreciate your trust in us. 
          Please find your invoice details below. If you have any questions, feel free to reach out to us anytime.
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;margin-bottom:20px;border-bottom:2px solid #e5e7eb;">
        <div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${ACCENT};margin-bottom:4px;">Invoice Details</div>
          <div style="font-size:14px;font-weight:700;color:#1a1a2e;">#${invoiceNumber}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:2px;">Date: ${invoiceDate}</div>
          ${invoiceName ? `<div style="font-size:12px;color:#6b7280;">${invoiceName}</div>` : ""}
        </div>
        <div style="text-align:right;font-size:12px;color:#6b7280;line-height:1.7;">
          ${companyAddress ? `<div>${companyAddress}</div>` : ""}
          <div>${[companyPhone, companyEmail].filter(Boolean).join(" | ")}</div>
        </div>
      </div>
      ${profile ? `<div style="margin-bottom:20px;padding:14px 18px;background:#f8fafc;border-radius:8px;border-left:4px solid ${ACCENT};">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${ACCENT};margin-bottom:6px;">Bill To</div>
        <div style="font-size:15px;font-weight:700;margin-bottom:2px;">${profile.full_name || "—"}</div>
        ${profile.phone ? `<div style="font-size:12px;color:#6b7280;">${profile.phone}</div>` : ""}
        ${profile.address ? `<div style="font-size:12px;color:#6b7280;">${profile.address}</div>` : ""}
      </div>` : ""}
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <thead><tr>
          <th style="background:${ACCENT};color:#fff;text-align:left;padding:12px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">Product</th>
          <th style="background:${ACCENT};color:#fff;text-align:center;padding:12px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;width:80px;">QTY</th>
          <th style="background:${ACCENT};color:#fff;text-align:right;padding:12px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;width:120px;">Unit Price</th>
          <th style="background:${ACCENT};color:#fff;text-align:right;padding:12px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;width:120px;">Total</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div style="display:flex;justify-content:flex-end;margin-bottom:28px;">
        <div style="width:320px;background:#f8fafc;border-radius:8px;padding:16px 20px;">
          ${summaryRows}
          <div style="border-top:3px solid ${ACCENT};margin-top:10px;padding-top:12px;display:flex;justify-content:space-between;font-size:18px;font-weight:800;">
            <span>Grand Total</span>
            <span style="color:${ACCENT};">৳${totals.grandTotal.toLocaleString()}</span>
          </div>
        </div>
      </div>
      <div style="background:#f0f7ff;border-radius:8px;padding:18px 22px;margin-bottom:24px;">
        <div style="font-size:13px;color:#1a1a2e;font-weight:600;margin-bottom:6px;">📦 What's Next?</div>
        <div style="font-size:12px;color:#4b5563;line-height:1.6;">
          We will process your order shortly. You will receive shipment tracking updates via notifications. 
          For any queries, contact us at <strong>${companyPhone}</strong> or <strong>${companyEmail}</strong>.
        </div>
      </div>
    </div>
    <div style="background:#f8fafc;text-align:center;padding:20px 36px;border-top:1px solid #e5e7eb;">
      <div style="font-size:14px;font-weight:600;color:${ACCENT};margin-bottom:4px;">${footerText}</div>
      <div style="font-size:11px;color:#9ca3af;">${companyWebsite} | ${companyEmail}</div>
      <div style="font-size:10px;color:#d1d5db;margin-top:8px;">This is an automated invoice from ${companyName}. Please do not reply to this email.</div>
    </div>
  </div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const authHeader = req.headers.get("authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    
    if (!authHeader) throw new Error("Missing authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) throw new Error("Admin access required");

    const { orders, recipientEmail, settings } = await req.json();
    if (!orders || !recipientEmail) throw new Error("Missing orders or recipientEmail");

    const html = buildInvoiceHTML(orders, settings || {});
    const isCombined = orders.length > 1;
    const invoiceNumber = isCombined ? `COMB-${Date.now().toString(36).toUpperCase()}` : orders[0].order_number;
    const companyName = settings?.invoice_company_name || settings?.site_name || "TradeOn.Global";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${companyName} <invoice@tradeon.global>`,
        to: [recipientEmail],
        subject: `Invoice #${invoiceNumber} — ${companyName}`,
        html,
      }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result?.message || "Failed to send email");

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
