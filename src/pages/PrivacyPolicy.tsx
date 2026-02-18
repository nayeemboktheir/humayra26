import Footer from "@/components/Footer";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-xl font-bold text-foreground">{title}</h2>
    <div className="text-muted-foreground leading-relaxed space-y-2">{children}</div>
  </section>
);

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1">
        <div className="bg-primary text-primary-foreground py-10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <Button variant="ghost" className="text-primary-foreground hover:text-primary-foreground/80 mb-4 -ml-2" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <h1 className="text-3xl sm:text-4xl font-bold">Privacy Policy</h1>
            <p className="mt-2 text-primary-foreground/80">Last updated: January 2025</p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">

          <p className="text-muted-foreground leading-relaxed">
            TradeOn.global ("we", "us", or "our") is committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our platform.
          </p>

          <Section title="1. Information We Collect">
            <p>We collect information you provide directly to us, including:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Name, email address, phone number, and delivery address</li>
              <li>Order history, product preferences, and wishlist items</li>
              <li>Payment information (we do not store card details; payments are processed by third-party gateways)</li>
              <li>Communications you send to our support team</li>
            </ul>
            <p>We also automatically collect certain information when you use our platform, including your IP address, browser type, device information, and usage data.</p>
          </Section>

          <Section title="2. How We Use Your Information">
            <p>We use the information we collect to:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Process and fulfill your orders</li>
              <li>Communicate with you about your orders, shipments, and account</li>
              <li>Send you promotional materials (you can opt out at any time)</li>
              <li>Improve our platform and customer experience</li>
              <li>Comply with legal obligations</li>
              <li>Prevent fraud and ensure platform security</li>
            </ul>
          </Section>

          <Section title="3. Sharing of Information">
            <p>We do not sell, trade, or rent your personal information to third parties. We may share your information with:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong className="text-foreground">Logistics partners</strong> — to deliver your orders</li>
              <li><strong className="text-foreground">Payment processors</strong> — to process transactions securely</li>
              <li><strong className="text-foreground">Legal authorities</strong> — if required by law or court order</li>
            </ul>
          </Section>

          <Section title="4. Data Security">
            <p>We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. All data is transmitted over encrypted (HTTPS) connections.</p>
          </Section>

          <Section title="5. Cookies">
            <p>We use cookies and similar tracking technologies to enhance your browsing experience, analyze site traffic, and personalize content. You can control cookie settings through your browser preferences.</p>
          </Section>

          <Section title="6. Data Retention">
            <p>We retain your personal data for as long as your account is active or as needed to provide services. You may request deletion of your account and associated data at any time by contacting us.</p>
          </Section>

          <Section title="7. Your Rights">
            <p>You have the right to:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Opt out of marketing communications</li>
            </ul>
            <p>To exercise these rights, contact us at <a href="mailto:info@TradeOn.global" className="text-primary hover:underline">info@TradeOn.global</a>.</p>
          </Section>

          <Section title="8. Changes to This Policy">
            <p>We may update this Privacy Policy from time to time. We will notify you of significant changes via email or a prominent notice on our platform. Continued use of our services constitutes your acceptance of the updated policy.</p>
          </Section>

          <Section title="9. Contact Us">
            <p>If you have any questions about this Privacy Policy, please contact us:</p>
            <p>📧 <a href="mailto:info@TradeOn.global" className="text-primary hover:underline">info@TradeOn.global</a></p>
            <p>📞 <a href="tel:+8801898889950" className="text-primary hover:underline">01898-889950</a></p>
            <p>🏢 House 16, Road 07, Nikunja-02, Dhaka, Bangladesh — 1229</p>
          </Section>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
