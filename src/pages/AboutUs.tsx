import Footer from "@/components/Footer";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Globe, Users, ShieldCheck, Truck } from "lucide-react";

const AboutUs = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1">
        {/* Header */}
        <div className="bg-primary text-primary-foreground py-10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <Button variant="ghost" className="text-primary-foreground hover:text-primary-foreground/80 mb-4 -ml-2" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <h1 className="text-3xl sm:text-4xl font-bold">About Us</h1>
            <p className="mt-2 text-primary-foreground/80">Wholesale from China to Bangladesh</p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-10">

          {/* Intro */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">Who We Are</h2>
            <p className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground">TradeOn.global</strong> is a leading B2B sourcing platform connecting Bangladeshi businesses with verified wholesale suppliers from China, primarily through the <strong className="text-foreground">1688.com</strong> marketplace — China's largest domestic wholesale platform.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              We simplify the import process so that entrepreneurs, retailers, and businesses of all sizes in Bangladesh can access millions of Chinese products at factory prices — without the complexity of navigating foreign markets, language barriers, or complicated logistics.
            </p>
          </section>

          {/* Mission */}
          <section className="bg-muted rounded-xl p-6 space-y-3">
            <h2 className="text-xl font-bold text-foreground">Our Mission</h2>
            <p className="text-muted-foreground leading-relaxed">
              To empower Bangladeshi businesses by making global wholesale sourcing simple, transparent, and affordable. We believe every entrepreneur deserves access to the same quality products and competitive prices that large importers have always enjoyed.
            </p>
          </section>

          {/* Stats */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: Globe, label: "Products", value: "10M+" },
              { icon: Users, label: "Happy Customers", value: "5,000+" },
              { icon: ShieldCheck, label: "Verified Suppliers", value: "500+" },
              { icon: Truck, label: "Deliveries Made", value: "20,000+" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-card border rounded-xl p-5 text-center space-y-2">
                <Icon className="h-6 w-6 text-primary mx-auto" />
                <p className="text-2xl font-bold text-foreground">{value}</p>
                <p className="text-sm text-muted-foreground">{label}</p>
              </div>
            ))}
          </section>

          {/* What We Do */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">What We Do</h2>
            <div className="space-y-3">
              {[
                { title: "Product Sourcing", desc: "We search and identify the best products from 1688.com and other Chinese wholesale marketplaces based on your requirements." },
                { title: "Quality Inspection", desc: "Before shipping, our team inspects products for quality, quantity, and accuracy to ensure you receive exactly what you ordered." },
                { title: "Order Management", desc: "We handle all communication with Chinese suppliers on your behalf, eliminating the language barrier completely." },
                { title: "Shipping & Logistics", desc: "We manage the entire shipping process — from China warehouses to your doorstep in Bangladesh, with full tracking." },
                { title: "After-Sales Support", desc: "Our dedicated support team is always ready to help with any issues, returns, or refund requests." },
              ].map(({ title, desc }) => (
                <div key={title} className="bg-card border rounded-lg p-5">
                  <h3 className="font-semibold text-foreground mb-1">{title}</h3>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Office */}
          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-foreground">Our Office</h2>
            <div className="bg-card border rounded-xl p-6">
              <p className="font-semibold text-foreground">HEAD OFFICE</p>
              <p className="text-muted-foreground mt-1">House 16, Road 07, Nikunja-02</p>
              <p className="text-muted-foreground">Dhaka, Bangladesh — 1229</p>
              <div className="mt-4 space-y-1 text-sm">
                <p><span className="text-foreground font-medium">Email:</span> <a href="mailto:info@TradeOn.global" className="text-primary hover:underline">info@TradeOn.global</a></p>
                <p><span className="text-foreground font-medium">Phone:</span> <a href="tel:+8801898889950" className="text-primary hover:underline">01898-889950</a></p>
              </div>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default AboutUs;
