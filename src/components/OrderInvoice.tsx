import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { useAppSettings } from "@/hooks/useAppSettings";

interface OrderData {
  order_number: string;
  product_name: string;
  product_image?: string | null;
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

interface OrderInvoiceProps {
  order?: OrderData | null;
  orders?: OrderData[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function parseOrderLines(order: OrderData) {
  if (order.notes) {
    const lines = order.notes.split("\n").filter(Boolean).map((line) => {
      const match = line.match(/^(.+?):\s*(\d+)\s*pcs\s*×\s*৳([\d,]+)/);
      if (!match) return null;
      const [, name, qty, price] = match;
      const unitPrice = Number(price.replace(/,/g, ""));
      return { name: name.trim(), qty: Number(qty), unitPrice, total: Number(qty) * unitPrice };
    }).filter(Boolean);
    if (lines.length > 0) return lines as { name: string; qty: number; unitPrice: number; total: number }[];
  }
  return [{
    name: order.product_name + (order.variant_name ? ` (${order.variant_name})` : ""),
    qty: order.quantity,
    unitPrice: Number(order.unit_price),
    total: Number(order.total_price),
  }];
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

function buildPrintHTML(orders: OrderData[], settings: Record<string, string>) {
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

  // Build table rows
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

  // Summary rows
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

  return `<!DOCTYPE html>
<html>
<head>
  <title>Invoice - ${invoiceNumber}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; padding:40px; color:#1a1a2e; background:#fff; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    @media print { body { padding:20px; } @page { margin:15mm; } }
  </style>
</head>
<body>
  <div style="max-width:780px;margin:0 auto;">
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;margin-bottom:24px;border-bottom:3px solid ${ACCENT};">
      <div>
        <div style="font-size:26px;font-weight:800;letter-spacing:-0.5px;">
          ${companyName.includes(".") ? `${companyName.split(".")[0]}.<span style="color:${ACCENT};">${companyName.split(".").slice(1).join(".")}</span>` : `<span>${companyName}</span>`}
        </div>
        <div style="font-size:11px;color:#6b7280;line-height:1.7;margin-top:6px;">
          ${companyAddress ? `<div>${companyAddress}</div>` : ""}
          <div>${[companyPhone, companyEmail].filter(Boolean).join(" | ")}</div>
          <div>${companyWebsite}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:28px;font-weight:800;color:${ACCENT};letter-spacing:3px;">INVOICE</div>
        <div style="font-size:12px;color:#6b7280;margin-top:6px;line-height:1.8;">
          <div style="font-weight:700;color:#1a1a2e;font-size:14px;">#${invoiceNumber}</div>
          <div>Date: ${invoiceDate}</div>
          ${invoiceName ? `<div style="font-weight:600;color:#1a1a2e;margin-top:2px;">${invoiceName}</div>` : ""}
        </div>
      </div>
    </div>

    <!-- Bill To -->
    ${profile ? `
    <div style="margin-bottom:24px;padding:16px 20px;background:#f8fafc;border-radius:8px;border-left:4px solid ${ACCENT};">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${ACCENT};margin-bottom:6px;">Bill To</div>
      <div style="font-size:15px;font-weight:700;margin-bottom:2px;">${profile.full_name || "—"}</div>
      ${profile.phone ? `<div style="font-size:12px;color:#6b7280;">${profile.phone}</div>` : ""}
      ${profile.address ? `<div style="font-size:12px;color:#6b7280;">${profile.address}</div>` : ""}
    </div>` : ""}

    <!-- Table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:28px;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
      <thead>
        <tr>
          <th style="background:${ACCENT};color:#fff;text-align:left;padding:12px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">Product</th>
          <th style="background:${ACCENT};color:#fff;text-align:center;padding:12px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;width:80px;">QTY</th>
          <th style="background:${ACCENT};color:#fff;text-align:right;padding:12px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;width:120px;">Unit Price</th>
          <th style="background:${ACCENT};color:#fff;text-align:right;padding:12px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;width:120px;">Total</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>

    <!-- Summary -->
    <div style="display:flex;justify-content:flex-end;margin-bottom:32px;">
      <div style="width:320px;background:#f8fafc;border-radius:8px;padding:16px 20px;">
        ${summaryRows}
        <div style="border-top:3px solid ${ACCENT};margin-top:10px;padding-top:12px;display:flex;justify-content:space-between;font-size:18px;font-weight:800;">
          <span>Grand Total</span>
          <span style="color:${ACCENT};">৳${totals.grandTotal.toLocaleString()}</span>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding-top:20px;border-top:1px solid #e5e7eb;">
      <div style="font-size:14px;font-weight:600;color:${ACCENT};margin-bottom:4px;">${footerText}</div>
      <div style="font-size:11px;color:#9ca3af;">${companyWebsite} | ${companyEmail}</div>
    </div>
  </div>
</body>
</html>`;
}

export default function OrderInvoice({ order, orders: ordersProp, open, onOpenChange }: OrderInvoiceProps) {
  const invoiceRef = useRef<HTMLDivElement>(null);
  const { settings } = useAppSettings();

  const orders = ordersProp && ordersProp.length > 0 ? ordersProp : order ? [order] : [];
  if (orders.length === 0) return null;

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

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(buildPrintHTML(orders, settings));
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center justify-between">
            <span className="text-lg font-bold">{isCombined ? "Combined Invoice" : "Invoice"}</span>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" />
              Print / Download
            </Button>
          </DialogTitle>
        </DialogHeader>

        {/* Preview */}
        <div ref={invoiceRef} className="px-6 pb-6 pt-4">
          {/* Header */}
          <div className="flex justify-between items-start pb-4 mb-5 border-b-[3px] border-primary">
            <div>
              <p className="text-2xl font-extrabold tracking-tight">
                {companyName.includes(".")
                  ? <>{companyName.split(".")[0]}.<span className="text-primary">{companyName.split(".").slice(1).join(".")}</span></>
                  : <span>{companyName}</span>
                }
              </p>
              <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5 leading-relaxed">
                {companyAddress && <p>{companyAddress}</p>}
                <p>{[companyPhone, companyEmail].filter(Boolean).join(" | ")}</p>
                <p>{companyWebsite}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold tracking-[3px] text-primary">INVOICE</p>
              <div className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
                <p className="font-bold text-sm text-foreground">#{invoiceNumber}</p>
                <p>Date: {invoiceDate}</p>
                {orders[0].invoice_name && (
                  <p className="font-semibold text-foreground mt-0.5">{orders[0].invoice_name}</p>
                )}
              </div>
            </div>
          </div>

          {/* Bill To */}
          {profile && (
            <div className="mb-5 p-4 bg-muted/40 rounded-lg border-l-4 border-primary">
              <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-primary mb-1.5">Bill To</p>
              <p className="text-sm font-bold">{profile.full_name || "—"}</p>
              {profile.phone && <p className="text-xs text-muted-foreground">{profile.phone}</p>}
              {profile.address && <p className="text-xs text-muted-foreground">{profile.address}</p>}
            </div>
          )}

          {/* Items Table */}
          <div className="border rounded-lg overflow-hidden mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="text-left py-3 px-3.5 font-bold text-[11px] uppercase tracking-wider">Product</th>
                  <th className="text-center py-3 px-3.5 font-bold text-[11px] uppercase tracking-wider w-20">QTY</th>
                  <th className="text-right py-3 px-3.5 font-bold text-[11px] uppercase tracking-wider w-28">Unit Price</th>
                  <th className="text-right py-3 px-3.5 font-bold text-[11px] uppercase tracking-wider w-28">Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, oi) => {
                  const lines = parseOrderLines(o);
                  const domesticCourier = Number(o.domestic_courier_charge || 0);
                  const orderTotal = Number(o.total_price) + domesticCourier;
                  return (
                    <>{isCombined && (
                      <tr key={`h-${oi}`}>
                        <td colSpan={4} className="py-2 px-3.5 font-bold text-xs text-primary bg-primary/5 border-b-2 border-primary/10">
                          Order #{o.order_number}{o.invoice_name ? ` — ${o.invoice_name}` : ""}
                        </td>
                      </tr>
                    )}
                    {lines.map((line, li) => (
                      <tr key={`${oi}-${li}`} className={li % 2 === 1 ? "bg-muted/30" : ""}>
                        <td className="py-2.5 px-3.5 text-xs font-medium">{line.name}</td>
                        <td className="py-2.5 px-3.5 text-xs text-center">{line.qty}</td>
                        <td className="py-2.5 px-3.5 text-xs text-right">৳{line.unitPrice.toLocaleString()}</td>
                        <td className="py-2.5 px-3.5 text-xs text-right font-semibold">৳{line.total.toLocaleString()}</td>
                      </tr>
                    ))}
                    {domesticCourier > 0 && (
                      <tr key={`d-${oi}`} className="bg-muted/20">
                        <td colSpan={3} className="py-2 px-3.5 text-xs text-muted-foreground">Domestic Courier (China)</td>
                        <td className="py-2 px-3.5 text-xs text-right font-semibold">৳{domesticCourier.toLocaleString()}</td>
                      </tr>
                    )}
                    {isCombined && (
                      <tr key={`s-${oi}`} className="border-t-2 border-border/60">
                        <td colSpan={3} className="py-2 px-3.5 text-right text-xs font-semibold text-muted-foreground">Subtotal</td>
                        <td className="py-2 px-3.5 text-right text-xs font-bold">৳{orderTotal.toLocaleString()}</td>
                      </tr>
                    )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="flex justify-end mb-6">
            <div className="w-72 bg-muted/40 rounded-lg p-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Product Total</span>
                <span className="font-semibold">৳{totals.productTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Domestic Courier (China)</span>
                <span className="font-semibold">৳{totals.domesticTotal.toLocaleString()}</span>
              </div>
              {totals.shippingTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">International Shipping</span>
                  <span className="font-semibold">৳{totals.shippingTotal.toLocaleString()}</span>
                </div>
              )}
              {totals.commissionTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Commission</span>
                  <span className="font-semibold">৳{totals.commissionTotal.toLocaleString()}</span>
                </div>
              )}
              <div className="pt-3 mt-2 border-t-[3px] border-primary">
                <div className="flex justify-between font-extrabold text-lg">
                  <span>Grand Total</span>
                  <span className="text-primary">৳{totals.grandTotal.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center pt-4 border-t border-border">
            <p className="text-sm font-semibold text-primary mb-1">{footerText}</p>
            <p className="text-[10px] text-muted-foreground">{companyWebsite} | {companyEmail}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
