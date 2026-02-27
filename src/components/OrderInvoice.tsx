import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Download, Printer } from "lucide-react";

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
  profile?: {
    full_name?: string | null;
    phone?: string | null;
    address?: string | null;
  } | null;
}

interface OrderInvoiceProps {
  order: OrderData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function OrderInvoice({ order, open, onOpenChange }: OrderInvoiceProps) {
  const invoiceRef = useRef<HTMLDivElement>(null);

  if (!order) return null;

  const domesticCourier = Number(order.domestic_courier_charge || 0);
  const productTotal = Number(order.total_price);
  const shipping = Number(order.shipping_charges || 0);
  const commission = Number(order.commission || 0);
  const grandTotal = productTotal + domesticCourier + shipping + commission;

  const handlePrint = () => {
    const content = invoiceRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Invoice - ${order.order_number}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; color: #1a1a1a; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
            .brand { font-size: 24px; font-weight: bold; }
            .brand span { color: #1874bd; }
            .meta { text-align: right; font-size: 13px; color: #6b7280; }
            .meta strong { color: #1a1a1a; display: block; font-size: 16px; margin-bottom: 4px; }
            .section-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 8px; margin-top: 20px; }
            .customer-info { font-size: 13px; line-height: 1.6; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f3f4f6; text-align: left; padding: 10px 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 2px solid #e5e7eb; }
            td { padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; vertical-align: top; }
            .text-right { text-align: right; }
            .summary { margin-top: 20px; }
            .summary-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
            .summary-row.total { font-size: 16px; font-weight: bold; border-top: 2px solid #1874bd; padding-top: 12px; margin-top: 8px; }
            .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 16px; }
            .variant { font-size: 11px; color: #6b7280; }
            .product-img { width: 48px; height: 48px; object-fit: cover; border-radius: 6px; margin-right: 10px; vertical-align: middle; }
            .product-cell { display: flex; align-items: center; gap: 10px; }
            .badge { display: inline-block; background: #dbeafe; color: #1e40af; font-size: 11px; padding: 2px 8px; border-radius: 9999px; font-weight: 600; }
            @media print { body { padding: 15px; } }
          </style>
        </head>
        <body>
          ${content.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Invoice</span>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div ref={invoiceRef}>
          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xl font-bold">TradeOn<span className="text-primary">.Global</span></p>
              <p className="text-xs text-muted-foreground mt-1">www.tradeon.global</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-base">INVOICE</p>
              <p className="text-xs text-muted-foreground">#{order.order_number}</p>
              <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</p>
            </div>
          </div>

          <Separator className="my-4" />

          {/* Customer Info */}
          {order.profile && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Bill To</p>
              <p className="text-sm font-medium">{order.profile.full_name || "—"}</p>
              {order.profile.phone && <p className="text-xs text-muted-foreground">{order.profile.phone}</p>}
              {order.profile.address && <p className="text-xs text-muted-foreground">{order.profile.address}</p>}
            </div>
          )}

          {/* Items Table */}
          <div className="mt-4 border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left py-2.5 px-3 font-semibold text-xs">Product</th>
                  <th className="text-center py-2.5 px-3 font-semibold text-xs">QTY</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-xs">Unit Price</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-xs">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.notes ? (
                  // Multiple variants from notes
                  order.notes.split("\n").filter(Boolean).map((line, idx) => {
                    const match = line.match(/^(.+?):\s*(\d+)\s*pcs\s*×\s*৳([\d,]+)/);
                    if (!match) return null;
                    const [, name, qty, price] = match;
                    const unitPrice = Number(price.replace(/,/g, ""));
                    const lineTotal = Number(qty) * unitPrice;
                    return (
                      <tr key={idx} className="border-t">
                        <td className="py-2.5 px-3">
                          <p className="font-medium text-xs leading-tight">{name.trim()}</p>
                        </td>
                        <td className="py-2.5 px-3 text-center text-xs">{qty}</td>
                        <td className="py-2.5 px-3 text-right text-xs">৳{unitPrice.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right text-xs font-medium">৳{lineTotal.toLocaleString()}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr className="border-t">
                    <td className="py-2.5 px-3">
                      <p className="font-medium text-xs leading-tight line-clamp-2">{order.product_name}</p>
                      {order.variant_name && <p className="text-[10px] text-muted-foreground mt-0.5">{order.variant_name}</p>}
                    </td>
                    <td className="py-2.5 px-3 text-center text-xs">{order.quantity}</td>
                    <td className="py-2.5 px-3 text-right text-xs">৳{Number(order.unit_price).toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-xs font-medium">৳{productTotal.toLocaleString()}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Product Total</span>
              <span>৳{productTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Domestic Courier (China)</span>
              <span>৳{domesticCourier.toLocaleString()}</span>
            </div>
            {shipping > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">International Shipping</span>
                <span>৳{shipping.toLocaleString()}</span>
              </div>
            )}
            {commission > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Commission</span>
                <span>৳{commission.toLocaleString()}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-bold text-base pt-1">
              <span>Grand Total</span>
              <span className="text-primary">৳{grandTotal.toLocaleString()}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 text-center text-[10px] text-muted-foreground border-t pt-3">
            <p>Thank you for shopping with TradeOn Global</p>
            <p>www.tradeon.global | info@tradeon.global</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
