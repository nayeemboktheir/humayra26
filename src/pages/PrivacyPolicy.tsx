import InfoPageLayout from "@/components/InfoPageLayout";

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

const PrivacyPolicy = () => (
  <InfoPageLayout
    title="Privacy Policy"
    subtitle="How we collect, use, and protect your personal information."
    breadcrumb="Privacy Policy"
  >
    <div className="max-w-3xl">
      {/* Effective Date */}
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-muted-foreground text-xs font-medium mb-10">
        Last updated: January 2025
      </div>

      <p className="text-muted-foreground leading-relaxed mb-10 text-sm">
        TradeOn.global ("we", "us", or "our") is committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform.
      </p>

      <div className="space-y-0">
        <Section number="1" title="Information We Collect">
          <p>We collect information you provide directly to us, including:</p>
          <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
            <li>Name, email address, phone number, and delivery address</li>
            <li>Order history, product preferences, and wishlist items</li>
            <li>Payment information (we do not store card details)</li>
            <li>Communications you send to our support team</li>
          </ul>
          <p className="mt-2">We also automatically collect device information, IP addresses, browser type, and usage data when you use our platform.</p>
        </Section>

        <Section number="2" title="How We Use Your Information">
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Process and fulfill your orders</li>
            <li>Communicate with you about orders, shipments, and your account</li>
            <li>Send promotional materials (you can opt out at any time)</li>
            <li>Improve our platform and customer experience</li>
            <li>Comply with legal obligations</li>
            <li>Prevent fraud and ensure platform security</li>
          </ul>
        </Section>

        <Section number="3" title="Sharing of Information">
          <p>We do not sell, trade, or rent your personal information to third parties. We may share your information with:</p>
          <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
            <li><strong className="text-foreground">Logistics partners</strong> — to deliver your orders</li>
            <li><strong className="text-foreground">Payment processors</strong> — to process transactions securely</li>
            <li><strong className="text-foreground">Legal authorities</strong> — if required by law or court order</li>
          </ul>
        </Section>

        <Section number="4" title="Data Security">
          <p>We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. All data is transmitted over encrypted (HTTPS) connections.</p>
        </Section>

        <Section number="5" title="Cookies">
          <p>We use cookies and similar tracking technologies to enhance your browsing experience, analyze site traffic, and personalize content. You can control cookie settings through your browser preferences.</p>
        </Section>

        <Section number="6" title="Data Retention">
          <p>We retain your personal data for as long as your account is active or as needed to provide services. You may request deletion of your account and associated data at any time by contacting us.</p>
        </Section>

        <Section number="7" title="Your Rights">
          <p>You have the right to:</p>
          <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Opt out of marketing communications</li>
          </ul>
          <p className="mt-2">To exercise these rights, contact us at <a href="mailto:info@TradeOn.global" className="text-primary hover:underline">info@TradeOn.global</a>.</p>
        </Section>

        <Section number="8" title="Changes to This Policy">
          <p>We may update this Privacy Policy from time to time. We will notify you of significant changes via email or a prominent notice on our platform. Continued use of our services constitutes your acceptance of the updated policy.</p>
        </Section>

        <Section number="9" title="Contact Us">
          <p>If you have any questions about this Privacy Policy, please contact us:</p>
          <p className="mt-2">📧 <a href="mailto:info@TradeOn.global" className="text-primary hover:underline">info@TradeOn.global</a></p>
          <p>📞 <a href="tel:+8801898889950" className="text-primary hover:underline">01898-889950</a></p>
          <p>🏢 House 16, Road 07, Nikunja-02, Dhaka, Bangladesh — 1229</p>
        </Section>
      </div>
    </div>
  </InfoPageLayout>
);

export default PrivacyPolicy;
