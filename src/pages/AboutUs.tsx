import InfoPageLayout from "@/components/InfoPageLayout";
import { Globe, Users, ShieldCheck, Truck, CheckCircle, Package, Headphones } from "lucide-react";

const stats = [
  { icon: Globe, label: "Products Available", value: "10M+" },
  { icon: Users, label: "Happy Customers", value: "5,000+" },
  { icon: ShieldCheck, label: "Verified Suppliers", value: "500+" },
  { icon: Truck, label: "Deliveries Made", value: "20,000+" },
];

const services = [
  { icon: Globe, title: "Product Sourcing", desc: "We search and identify the best products from 1688.com and other Chinese wholesale marketplaces based on your requirements." },
  { icon: ShieldCheck, title: "Quality Inspection", desc: "Before shipping, our team inspects products for quality, quantity, and accuracy to ensure you receive exactly what you ordered." },
  { icon: Package, title: "Order Management", desc: "We handle all communication with Chinese suppliers on your behalf, eliminating the language barrier completely." },
  { icon: Truck, title: "Shipping & Logistics", desc: "We manage the entire shipping process — from China warehouses to your doorstep in Bangladesh, with full tracking." },
  { icon: Headphones, title: "After-Sales Support", desc: "Our dedicated support team is always ready to help with any issues, returns, or refund requests." },
];

const AboutUs = () => (
  <InfoPageLayout
    title="About Us"
    subtitle="Connecting Bangladeshi businesses with China's largest wholesale market."
    breadcrumb="About Us"
  >
    <div className="space-y-16">

      {/* Who We Are */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider">
            Our Story
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground leading-snug">
            Bangladesh's #1 China Wholesale Sourcing Platform
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            <strong className="text-foreground">TradeOn.global</strong> is a leading B2B sourcing platform connecting Bangladeshi businesses with verified wholesale suppliers from China, primarily through <strong className="text-foreground">1688.com</strong> — China's largest domestic wholesale marketplace.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            We simplify the import process so that entrepreneurs, retailers, and businesses of all sizes can access millions of Chinese products at factory prices — without the complexity of navigating foreign markets or language barriers.
          </p>
        </div>
        <div className="bg-card border rounded-2xl p-8">
          <p className="text-lg font-semibold text-foreground mb-3">Our Mission</p>
          <p className="text-muted-foreground leading-relaxed italic border-l-4 border-primary pl-4">
            "To empower Bangladeshi businesses by making global wholesale sourcing simple, transparent, and affordable — giving every entrepreneur access to the same competitive prices that large importers enjoy."
          </p>
        </div>
      </section>

      {/* Stats */}
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-card border rounded-2xl p-6 text-center group hover:border-primary/50 hover:shadow-md transition-all">
              <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-primary/20 transition-colors">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <p className="text-3xl font-extrabold text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What We Do */}
      <section>
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider mb-3">
            What We Do
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">End-to-End Import Services</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-card border rounded-2xl p-6 hover:border-primary/40 hover:shadow-md transition-all group">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="bg-card border rounded-2xl p-8 sm:p-10">
        <h2 className="text-2xl font-bold text-foreground mb-6">Why Choose TradeOn.global?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            "Direct access to 1688.com — China's largest wholesale market",
            "No language barrier — we handle all Chinese communications",
            "Quality control before shipping from China",
            "Transparent pricing with no hidden fees",
            "End-to-end shipment tracking in Bangladeshi Taka",
            "Dedicated customer support in Bengali & English",
          ].map((point) => (
            <div key={point} className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <span className="text-sm text-muted-foreground">{point}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Office */}
      <section>
        <h2 className="text-2xl font-bold text-foreground mb-6">Our Office</h2>
        <div className="bg-card border rounded-2xl p-8 flex flex-col sm:flex-row gap-8 items-start">
          <div className="flex-1">
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-2">HEAD OFFICE</p>
            <p className="text-foreground font-medium">House 16, Road 07, Nikunja-02</p>
            <p className="text-muted-foreground">Dhaka, Bangladesh — 1229</p>
          </div>
          <div className="flex-1 space-y-2 text-sm">
            <p><span className="text-muted-foreground">Email:</span> <a href="mailto:info@TradeOn.global" className="text-primary hover:underline font-medium">info@TradeOn.global</a></p>
            <p><span className="text-muted-foreground">Phone:</span> <a href="tel:+8801898889950" className="text-primary hover:underline font-medium">01898-889950</a></p>
            <p><span className="text-muted-foreground">Hours:</span> <span className="text-foreground">Sat–Thu, 9 AM – 6 PM</span></p>
          </div>
        </div>
      </section>

    </div>
  </InfoPageLayout>
);

export default AboutUs;
