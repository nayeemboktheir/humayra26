import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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

export default function OrderInvoice({ order, orders: ordersProp, open, onOpenChange }: OrderInvoiceProps) {
  const invoiceRef = useRef<HTMLDivElement>(null);
  const { settings } = useAppSettings();

  const orders = ordersProp && ordersProp.length > 0 ? ordersProp : order ? [order] : [];
  if (orders.length === 0) return null;

  const isCombined = orders.length > 1;
  const profile = orders[0].profile;
  const totals = calcTotals(orders);
  const invoiceDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const invoiceNumber = isCombined
    ? `COMB-${Date.now().toString(36).toUpperCase()}`
    : orders[0].order_number;

  const companyName = settings.invoice_company_name || settings.site_name || "TradeOn Global";
  const companyAddress = settings.invoice_company_address || settings.head_office_address || "";
  const companyPhone = settings.invoice_company_phone || settings.contact_phone || "";
  const companyEmail = settings.invoice_company_email || settings.contact_email || "";
  const companyWebsite = settings.invoice_company_website || "www.tradeon.global";
  const footerText = settings.invoice_footer_text || "Thank you for shopping with us!";

  const handlePrint = () => {
    const content = invoiceRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Invoice - ${invoiceNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1a1a2e; background: #fff; }
            .invoice-container { max-width: 800px; margin: 0 auto; }
            .inv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 3px solid #1874bd; }
            .inv-brand { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
            .inv-brand .accent { color: #1874bd; }
            .inv-company-info { font-size: 11px; color: #6b7280; line-height: 1.6; margin-top: 6px; }
            .inv-meta { text-align: right; }
            .inv-meta .inv-label { font-size: 32px; font-weight: 800; color: #1874bd; letter-spacing: 2px; }
            .inv-meta-detail { font-size: 12px; color: #6b7280; margin-top: 4px; line-height: 1.8; }
            .inv-meta-detail strong { color: #1a1a2e; }
            .inv-parties { display: flex; justify-content: space-between; margin-bottom: 28px; gap: 40px; }
            .inv-party { flex: 1; }
            .inv-party-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #1874bd; margin-bottom: 8px; }
            .inv-party-name { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
            .inv-party-detail { font-size: 12px; color: #6b7280; line-height: 1.6; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            thead th { background: #1874bd; color: #fff; text-align: left; padding: 10px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
            thead th:last-child, thead th:nth-child(3), thead th:nth-child(2) { text-align: right; }
            tbody td { padding: 10px 14px; border-bottom: 1px solid #e5e7eb; font-size: 13px; vertical-align: top; }
            tbody td:last-child, tbody td:nth-child(3), tbody td:nth-child(2) { text-align: right; }
            tbody tr:nth-child(even) { background: #f8fafc; }
            .order-group-header td { background: #f0f7ff; font-weight: 700; font-size: 12px; color: #1874bd; border-bottom: 2px solid #1874bd20; }
            .inv-summary { display: flex; justify-content: flex-end; margin-bottom: 32px; }
            .inv-summary-box { width: 300px; }
            .inv-summary-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #4b5563; }
            .inv-summary-row.total { font-size: 18px; font-weight: 800; color: #1a1a2e; border-top: 3px solid #1874bd; padding-top: 12px; margin-top: 8px; }
            .inv-summary-row.total .amount { color: #1874bd; }
            .inv-footer { text-align: center; padding-top: 24px; border-top: 1px solid #e5e7eb; }
            .inv-footer p { font-size: 11px; color: #9ca3af; line-height: 1.8; }
            .inv-footer .thanks { font-size: 14px; font-weight: 600; color: #1874bd; margin-bottom: 6px; }
            .inv-badge { display: inline-block; background: #dcfce7; color: #166534; font-size: 10px; padding: 3px 10px; border-radius: 99px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="invoice-container">${content.innerHTML}</div>
        </body>
      </html>
    `);
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

        <div ref={invoiceRef} className="px-6 pb-6 pt-4">
          {/* Header */}
          <div className="flex justify-between items-start pb-4 mb-5" style={{ borderBottom: "3px solid hsl(207, 75%, 42%)" }}>
            <div>
              <p className="text-2xl font-extrabold tracking-tight">
                {companyName.includes(".") ? (
                  <>{companyName.split(".")[0]}.<span className="text-primary">{companyName.split(".").slice(1).join(".")}</span></>
                ) : (
                  <>{companyName.split(" ")[0]}<span className="text-primary">{companyName.split(" ").length > 1 ? "." + companyName.split(" ").slice(1).join(" ") : ""}</span></>
                )}
              </p>
              <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
                {companyAddress && <p>{companyAddress}</p>}
                <p>{[companyPhone, companyEmail].filter(Boolean).join(" | ")}</p>
                <p>{companyWebsite}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold tracking-widest text-primary">INVOICE</p>
              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                <p><span className="font-semibold text-foreground">#{invoiceNumber}</span></p>
                <p>Date: {invoiceDate}</p>
                {orders[0].invoice_name && (
                  <p className="font-medium text-foreground mt-1">{orders[0].invoice_name}</p>
                )}
              </div>
            </div>
          </div>

          {/* Customer */}
          {profile && (
            <div className="mb-5">
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
                  <th className="text-left py-2.5 px-3 font-bold text-[11px] uppercase tracking-wide">Product</th>
                  <th className="text-right py-2.5 px-3 font-bold text-[11px] uppercase tracking-wide">QTY</th>
                  <th className="text-right py-2.5 px-3 font-bold text-[11px] uppercase tracking-wide">Unit Price</th>
                  <th className="text-right py-2.5 px-3 font-bold text-[11px] uppercase tracking-wide">Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, oi) => {
                  const lines = parseOrderLines(o);
                  const domesticCourier = Number(o.domestic_courier_charge || 0);
                  const orderProductTotal = Number(o.total_price);
                  const orderTotalWithDomestic = orderProductTotal + domesticCourier;
                  return (
                    <>{isCombined && (
                      <tr key={`header-${oi}`} className="bg-primary/5">
                        <td colSpan={4} className="py-2 px-3 font-bold text-xs text-primary border-b border-primary/10">
                          Order #{o.order_number} {o.invoice_name ? `— ${o.invoice_name}` : ""}
                        </td>
                      </tr>
                    )}
                    {lines.map((line, li) => (
                      <tr key={`${oi}-${li}`} className={li % 2 === 0 ? "" : "bg-muted/30"}>
                        <td className="py-2.5 px-3">
                          <p className="font-medium text-xs leading-tight">{line.name}</p>
                        </td>
                        <td className="py-2.5 px-3 text-right text-xs">{line.qty}</td>
                        <td className="py-2.5 px-3 text-right text-xs">৳{line.unitPrice.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right text-xs font-semibold">৳{line.total.toLocaleString()}</td>
                      </tr>
                    ))}
                    {domesticCourier > 0 && (
                      <tr key={`dom-${oi}`} className="bg-muted/20">
                        <td className="py-2 px-3 text-xs text-muted-foreground" colSpan={3}>
                          Domestic Courier (China)
                        </td>
                        <td className="py-2 px-3 text-right text-xs font-medium">৳{domesticCourier.toLocaleString()}</td>
                      </tr>
                    )}
                    {isCombined && (
                      <tr key={`subtotal-${oi}`} className="border-t border-border/60">
                        <td colSpan={3} className="py-2 px-3 text-right text-xs font-semibold text-muted-foreground">
                          Subtotal (incl. domestic courier)
                        </td>
                        <td className="py-2 px-3 text-right text-xs font-bold">৳{orderTotalWithDomestic.toLocaleString()}</td>
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
            <div className="w-72 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Product Total</span>
                <span>৳{totals.productTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Domestic Courier (China)</span>
                <span>৳{totals.domesticTotal.toLocaleString()}</span>
              </div>
              {totals.shippingTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">International Shipping</span>
                  <span>৳{totals.shippingTotal.toLocaleString()}</span>
                </div>
              )}
              {totals.commissionTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Commission</span>
                  <span>৳{totals.commissionTotal.toLocaleString()}</span>
                </div>
              )}
              <div className="pt-3 mt-2" style={{ borderTop: "3px solid hsl(207, 75%, 42%)" }}>
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
