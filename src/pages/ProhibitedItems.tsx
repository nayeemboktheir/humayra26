import InfoPageLayout from "@/components/InfoPageLayout";
import { AlertTriangle, XCircle, ShieldAlert } from "lucide-react";

const categories = [
  {
    title: "Weapons & Dangerous Items",
    items: [
      "Firearms, guns, and ammunition of any kind",
      "Explosives, fireworks, and flammable substances",
      "Knives, swords, and bladed weapons",
      "Tasers, stun guns, and electric shock devices",
      "Parts or components used to manufacture weapons",
    ],
  },
  {
    title: "Drugs & Controlled Substances",
    items: [
      "Illegal narcotics, psychotropic substances, and controlled drugs",
      "Prescription medications without valid authorization",
      "Drug paraphernalia",
      "Substances that mimic controlled drugs",
    ],
  },
  {
    title: "Counterfeit & IP Violations",
    items: [
      "Counterfeit branded goods (fake Nike, Adidas, Apple, etc.)",
      "Pirated software, music, movies, or books",
      "Goods infringing on trademarks, copyrights, or patents",
      "Fake currency, stamps, or official documents",
    ],
  },
  {
    title: "Hazardous Materials",
    items: [
      "Radioactive materials",
      "Toxic chemicals and poisons",
      "Asbestos-containing products",
      "Batteries beyond legal mercury/cadmium limits",
      "Products not meeting Bangladesh safety standards",
    ],
  },
  {
    title: "Adult & Inappropriate Content",
    items: [
      "Pornographic or obscene materials",
      "Items related to gambling",
      "Products offensive to religious or ethnic groups",
    ],
  },
  {
    title: "Wildlife & Animal Products",
    items: [
      "Endangered animal species or their parts",
      "Live animals",
      "Products banned under CITES",
    ],
  },
  {
    title: "Food & Agriculture",
    items: [
      "Unprocessed food items without proper permits",
      "Seeds, soil, and live plant material without certificates",
      "Food items prohibited by Bangladesh customs",
    ],
  },
  {
    title: "Other Restricted Items",
    items: [
      "Stolen goods or items of unclear origin",
      "Human remains or body parts",
      "Items violating Bangladesh import regulations",
      "Currency exceeding legal limits",
      "Unauthorized surveillance devices",
    ],
  },
];

const ProhibitedItems = () => (
  <InfoPageLayout
    title="Prohibited Items"
    subtitle="Items we cannot import, ship, or assist with under any circumstances."
    breadcrumb="Prohibited Items"
  >
    <div className="space-y-8">

      {/* Warning Banner */}
      <div className="flex gap-4 bg-destructive/5 border border-destructive/20 rounded-2xl p-6">
        <AlertTriangle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-destructive mb-1">Legal Warning</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Attempting to import prohibited items is a serious offense under Bangladesh customs law. TradeOn.global reserves the right to cancel any order suspected of containing prohibited goods. Any legal consequences are the sole responsibility of the customer.
          </p>
        </div>
      </div>

      <p className="text-muted-foreground text-sm leading-relaxed">
        The following categories of items are strictly prohibited on our platform. This list is in addition to restrictions imposed by Chinese export laws and Bangladesh customs regulations.
      </p>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {categories.map(({ title, items }) => (
          <div key={title} className="bg-card border rounded-2xl p-6 hover:border-destructive/30 hover:shadow-sm transition-all">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                <XCircle className="h-4 w-4 text-destructive" />
              </div>
              <h3 className="font-bold text-foreground text-sm">{title}</h3>
            </div>
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Help Box */}
      <div className="bg-card border rounded-2xl p-8 flex flex-col sm:flex-row gap-5 items-start">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <ShieldAlert className="h-6 w-6 text-primary" />
        </div>
        <div>
          <p className="font-bold text-foreground mb-2">Not sure if your item is allowed?</p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            This list is not exhaustive. If you are unsure whether a product can be imported, please contact us before placing an order. We're happy to verify.
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <a href="mailto:info@TradeOn.global" className="text-primary hover:underline font-medium">📧 info@TradeOn.global</a>
            <a href="tel:+8801898889950" className="text-primary hover:underline font-medium">📞 01898-889950</a>
          </div>
        </div>
      </div>
    </div>
  </InfoPageLayout>
);

export default ProhibitedItems;
