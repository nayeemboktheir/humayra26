import InfoPageLayout from "@/components/InfoPageLayout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MapPin, Mail, Phone, Clock, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const contactInfo = [
  {
    icon: MapPin,
    label: "Office Address",
    value: "House 16, Road 07, Nikunja-02\nDhaka, Bangladesh — 1229",
    link: null,
  },
  {
    icon: Mail,
    label: "Email Address",
    value: "info@TradeOn.global",
    link: "mailto:info@TradeOn.global",
  },
  {
    icon: Phone,
    label: "Phone Number",
    value: "01898-889950",
    link: "tel:+8801898889950",
  },
  {
    icon: Clock,
    label: "Business Hours",
    value: "Saturday – Thursday\n9:00 AM – 6:00 PM",
    link: null,
  },
];

const ContactUs = () => {
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1000));
    toast.success("Message sent! We'll get back to you within 24 hours.");
    setForm({ name: "", email: "", phone: "", subject: "", message: "" });
    setSubmitting(false);
  };

  return (
    <InfoPageLayout
      title="Contact Us"
      subtitle="Our team is here to help you every step of the way."
      breadcrumb="Contact Us"
    >
      <div className="space-y-12">
        {/* Contact Info Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {contactInfo.map(({ icon: Icon, label, value, link }) => (
            <div key={label} className="bg-card border rounded-2xl p-5 flex flex-col items-center text-center gap-3 hover:border-primary/40 hover:shadow-md transition-all group">
              <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                {link ? (
                  <a href={link} className="text-sm font-semibold text-foreground hover:text-primary transition-colors whitespace-pre-line">
                    {value}
                  </a>
                ) : (
                  <p className="text-sm font-semibold text-foreground whitespace-pre-line">{value}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Form + Map */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Form */}
          <div className="lg:col-span-3 bg-card border rounded-2xl p-8">
            <h2 className="text-xl font-bold text-foreground mb-1">Send Us a Message</h2>
            <p className="text-sm text-muted-foreground mb-6">Fill in the form below and we'll respond within 24 hours.</p>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Full Name *</Label>
                  <Input id="name" required placeholder="Your name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phone</Label>
                  <Input id="phone" placeholder="01XXXXXXXXX" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email Address *</Label>
                <Input id="email" type="email" required placeholder="you@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subject" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subject *</Label>
                <Input id="subject" required placeholder="How can we help?" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="message" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Message *</Label>
                <Textarea id="message" required placeholder="Describe your inquiry in detail..." rows={5} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
              </div>
              <Button type="submit" className="w-full gap-2" disabled={submitting}>
                <Send className="h-4 w-4" />
                {submitting ? "Sending..." : "Send Message"}
              </Button>
            </form>
          </div>

          {/* Side info */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-primary text-primary-foreground rounded-2xl p-7">
              <h3 className="font-bold text-lg mb-3">Quick Response</h3>
              <p className="text-primary-foreground/80 text-sm leading-relaxed mb-5">
                For urgent inquiries, reach us directly via phone or WhatsApp during business hours.
              </p>
              <a
                href="https://wa.me/8801898889950"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-primary-foreground text-primary rounded-xl px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Chat on WhatsApp
              </a>
            </div>
            <div className="bg-card border rounded-2xl p-7">
              <h3 className="font-bold text-foreground mb-3">Frequently Asked</h3>
              <div className="space-y-3">
                {[
                  { q: "How long does shipping take?", a: "Typically 15–25 working days from China." },
                  { q: "What payment methods are accepted?", a: "bKash, Nagad, bank transfer, and more." },
                  { q: "Can I track my order?", a: "Yes, full tracking is available in your dashboard." },
                ].map(({ q, a }) => (
                  <div key={q} className="border-b last:border-0 pb-3 last:pb-0">
                    <p className="text-sm font-semibold text-foreground">{q}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{a}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </InfoPageLayout>
  );
};

export default ContactUs;
