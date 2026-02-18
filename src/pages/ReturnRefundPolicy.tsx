import InfoPageLayout from "@/components/InfoPageLayout";
import { CheckCircle, XCircle, Clock, RotateCcw } from "lucide-react";

const Section = ({ number, title, children }: { number: string; title: string; children: React.ReactNode }) => (
  <section className="flex gap-5">
    <div className="shrink-0 w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold mt-0.5">
      {number}
    </div>
    <div className="flex-1 pb-8 border-b last:border-0">
      <h2 className="text-lg font-bold text-foreground mb-3">{title}</h2>
      <div className="text-muted-foreground text-sm leading-relaxed space-y-2">{children}</div>
    </div>
  </section>
);

const ReturnRefundPolicy = () => (
  <InfoPageLayout
    title="Return, Refund & Cancellation"
    subtitle="Our policies to ensure a fair and transparent experience."
    breadcrumb="Return & Refund Policy"
  >
    <div className="space-y-10">

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border rounded-2xl p-6 flex flex-col items-center text-center gap-3 hover:border-primary/40 transition-all">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-bold text-foreground">Eligible Returns</p>
            <p className="text-xs text-muted-foreground mt-1">Wrong item, damaged, or defective products</p>
          </div>
        </div>
        <div className="bg-card border rounded-2xl p-6 flex flex-col items-center text-center gap-3 hover:border-primary/40 transition-all">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Clock className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-bold text-foreground">Return Window</p>
            <p className="text-xs text-muted-foreground mt-1">Within 7 days of delivery</p>
          </div>
        </div>
        <div className="bg-card border rounded-2xl p-6 flex flex-col items-center text-center gap-3 hover:border-primary/40 transition-all">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <XCircle className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold text-foreground">Non-Returnable</p>
            <p className="text-xs text-muted-foreground mt-1">Change of mind, custom orders, used items</p>
          </div>
        </div>
      </div>

      {/* Intro */}
      <p className="text-muted-foreground text-sm leading-relaxed">
        At TradeOn.global, customer satisfaction is our top priority. Please read our return, refund, and cancellation policies carefully before placing an order.
      </p>

      {/* Sections */}
      <div className="max-w-3xl space-y-0">
        <Section number="1" title="Cancellation Policy">
          <p><strong className="text-foreground">Before Placement:</strong> You may cancel your order at any time before payment is confirmed — no charges apply.</p>
          <p><strong className="text-foreground">After Payment (Within 24 Hours):</strong> Cancellations within 24 hours of payment confirmation are eligible for a full refund, provided the order has not yet been placed with the supplier.</p>
          <p><strong className="text-foreground">After Supplier Order Placed:</strong> Once we have placed the order with the Chinese supplier, cancellation is generally not possible. If approved, a cancellation fee of up to 20% of the order value may apply.</p>
          <p><strong className="text-foreground">After Shipment:</strong> Orders cannot be cancelled once goods have been shipped from China.</p>
        </Section>

        <Section number="2" title="Return Policy">
          <p>We accept returns under the following conditions:</p>
          <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
            <li>The wrong product was delivered</li>
            <li>The product arrived significantly damaged or defective</li>
            <li>The quantity received is less than ordered</li>
          </ul>
          <p className="mt-2">Returns must be requested within <strong className="text-foreground">7 days</strong> of delivery. Contact our support team with photos/videos and your order number.</p>
          <p className="mt-2"><strong className="text-foreground">Non-Returnable Situations:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Change of mind or personal preference</li>
            <li>Minor quality differences within manufacturing tolerances</li>
            <li>Products that have been used, assembled, or altered</li>
            <li>Custom or personalized orders</li>
            <li>Perishable goods</li>
          </ul>
        </Section>

        <Section number="3" title="Refund Policy">
          <p>Approved refunds will be processed within <strong className="text-foreground">7–14 business days</strong> through the original payment method or as wallet credit.</p>
          <div className="bg-muted rounded-xl p-4 mt-3 space-y-2">
            <p className="font-semibold text-foreground text-xs uppercase tracking-wider">Refund Types</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong className="text-foreground">Full Refund:</strong> Product not dispatched and order fully cancelled</li>
              <li><strong className="text-foreground">Partial Refund:</strong> Some items missing from a multi-item order</li>
              <li><strong className="text-foreground">Replacement:</strong> For damaged/wrong items where return is not feasible</li>
            </ul>
          </div>
          <p className="mt-2">Note: Shipping charges are generally non-refundable unless the return is due to our error.</p>
        </Section>

        <Section number="4" title="How to Request a Return or Refund">
          <ol className="list-decimal list-inside space-y-2 ml-2">
            <li>Log into your account and go to <strong className="text-foreground">My Orders</strong></li>
            <li>Select the order and click <strong className="text-foreground">"Request Refund"</strong></li>
            <li>Provide photos/videos and a brief description of the issue</li>
            <li>Our team will review within <strong className="text-foreground">48 hours</strong> and respond with next steps</li>
          </ol>
          <p className="mt-3">Or contact us: <a href="mailto:info@TradeOn.global" className="text-primary hover:underline">info@TradeOn.global</a> · <a href="tel:+8801898889950" className="text-primary hover:underline">01898-889950</a></p>
        </Section>

        <Section number="5" title="Dispute Resolution">
          <p>If you are not satisfied with the resolution, you may escalate your case to our management team. We are committed to resolving all disputes fairly and transparently within <strong className="text-foreground">30 days</strong>.</p>
        </Section>
      </div>
    </div>
  </InfoPageLayout>
);

export default ReturnRefundPolicy;
