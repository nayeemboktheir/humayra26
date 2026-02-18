import Footer from "@/components/Footer";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, RotateCcw, XCircle, CheckCircle, Clock } from "lucide-react";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-xl font-bold text-foreground">{title}</h2>
    <div className="text-muted-foreground leading-relaxed space-y-2">{children}</div>
  </section>
);

const ReturnRefundPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1">
        <div className="bg-primary text-primary-foreground py-10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <Button variant="ghost" className="text-primary-foreground hover:text-primary-foreground/80 mb-4 -ml-2" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <h1 className="text-3xl sm:text-4xl font-bold">Return, Refund & Cancellation Policy</h1>
            <p className="mt-2 text-primary-foreground/80">Last updated: January 2025</p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">

          <p className="text-muted-foreground leading-relaxed">
            At TradeOn.global, customer satisfaction is our top priority. Please read our return, refund, and cancellation policies carefully before placing an order.
          </p>

          {/* Quick Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-muted border rounded-xl p-5 text-center space-y-2">
              <CheckCircle className="h-8 w-8 text-primary mx-auto" />
              <p className="font-semibold text-foreground text-sm">Eligible Returns</p>
              <p className="text-xs text-muted-foreground">Wrong item, damaged, or defective products</p>
            </div>
            <div className="bg-muted border rounded-xl p-5 text-center space-y-2">
              <Clock className="h-8 w-8 text-primary mx-auto" />
              <p className="font-semibold text-foreground text-sm">Return Window</p>
              <p className="text-xs text-muted-foreground">Within 7 days of delivery</p>
            </div>
            <div className="bg-muted border rounded-xl p-5 text-center space-y-2">
              <XCircle className="h-8 w-8 text-destructive mx-auto" />
              <p className="font-semibold text-foreground text-sm">Non-Returnable</p>
              <p className="text-xs text-muted-foreground">Change of mind, custom orders, used items</p>
            </div>
          </div>

          <Section title="1. Cancellation Policy">
            <p><strong className="text-foreground">Before Placement:</strong> You may cancel your order at any time before payment is confirmed — no charges apply.</p>
            <p><strong className="text-foreground">After Payment (Within 24 Hours):</strong> Cancellations within 24 hours of payment confirmation are eligible for a full refund, provided the order has not yet been placed with the supplier.</p>
            <p><strong className="text-foreground">After Supplier Order Placed:</strong> Once we have placed the order with the Chinese supplier, cancellation is generally not possible. If approved, a cancellation fee of up to 20% of the order value may apply to cover supplier and processing costs.</p>
            <p><strong className="text-foreground">After Shipment:</strong> Orders cannot be cancelled once the goods have been shipped from China.</p>
          </Section>

          <Section title="2. Return Policy">
            <p>We accept returns under the following conditions:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>The wrong product was delivered (different from what was ordered)</li>
              <li>The product arrived significantly damaged or defective</li>
              <li>The product quantity received is less than ordered</li>
            </ul>
            <p className="mt-2">Returns must be requested within <strong className="text-foreground">7 days</strong> of delivery. To initiate a return, contact our support team with photos/videos of the issue and your order number.</p>
            <p><strong className="text-foreground">Non-Returnable Situations:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Change of mind or personal preference</li>
              <li>Minor quality differences that are within normal manufacturing tolerances</li>
              <li>Products that have been used, assembled, or altered</li>
              <li>Custom or personalized orders</li>
              <li>Perishable goods</li>
            </ul>
          </Section>

          <Section title="3. Refund Policy">
            <p>Approved refunds will be processed within <strong className="text-foreground">7–14 business days</strong> through the original payment method or as wallet credit.</p>
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <p className="font-semibold text-foreground text-sm">Refund Types:</p>
              <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                <li><strong className="text-foreground">Full Refund:</strong> Product not dispatched and order fully cancelled</li>
                <li><strong className="text-foreground">Partial Refund:</strong> Some items missing from a multi-item order</li>
                <li><strong className="text-foreground">Replacement:</strong> For damaged/wrong items where return is not feasible</li>
              </ul>
            </div>
            <p>Note: Shipping charges are generally non-refundable unless the return is due to our error.</p>
          </Section>

          <Section title="4. How to Request a Return or Refund">
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li>Log into your account and go to <strong className="text-foreground">My Orders</strong></li>
              <li>Select the order and click <strong className="text-foreground">"Request Refund"</strong></li>
              <li>Provide photos/videos and a brief description of the issue</li>
              <li>Our team will review within <strong className="text-foreground">48 hours</strong> and respond with next steps</li>
            </ol>
            <p>Alternatively, contact us directly at <a href="mailto:info@TradeOn.global" className="text-primary hover:underline">info@TradeOn.global</a> or call <a href="tel:+8801898889950" className="text-primary hover:underline">01898-889950</a>.</p>
          </Section>

          <Section title="5. Dispute Resolution">
            <p>If you are not satisfied with the resolution, you may escalate your case to our management team. We are committed to resolving all disputes fairly and transparently within <strong className="text-foreground">30 days</strong>.</p>
          </Section>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ReturnRefundPolicy;
