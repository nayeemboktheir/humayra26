import Footer from "@/components/Footer";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, AlertTriangle, XCircle, ShieldAlert } from "lucide-react";

const categories = [
  {
    title: "Weapons & Dangerous Items",
    items: [
      "Firearms, guns, and ammunition of any kind",
      "Explosives, fireworks, and flammable substances",
      "Knives, swords, and bladed weapons",
      "Tasers, stun guns, and electric shock devices",
      "Any parts or components that can be used to manufacture weapons",
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
    title: "Counterfeit & Intellectual Property Violations",
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
      "Batteries containing mercury or cadmium beyond legal limits",
      "Products that do not meet Bangladesh safety standards",
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
      "Endangered animal species or their parts (ivory, rhino horn, etc.)",
      "Live animals",
      "Products banned under CITES (Convention on International Trade in Endangered Species)",
    ],
  },
  {
    title: "Food & Agriculture",
    items: [
      "Unprocessed food items without proper permits",
      "Seeds, soil, and live plant material without phytosanitary certificates",
      "Food items prohibited by Bangladesh customs",
    ],
  },
  {
    title: "Other Restricted Items",
    items: [
      "Stolen goods or items of unclear origin",
      "Human remains or body parts",
      "Items that violate Bangladesh import regulations",
      "Currency exceeding legal limits",
      "Gambling devices",
      "Spy equipment and unauthorized surveillance devices",
    ],
  },
];

const ProhibitedItems = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1">
        <div className="bg-primary text-primary-foreground py-10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <Button variant="ghost" className="text-primary-foreground hover:text-primary-foreground/80 mb-4 -ml-2" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <h1 className="text-3xl sm:text-4xl font-bold">Prohibited Items</h1>
            <p className="mt-2 text-primary-foreground/80">Items we cannot import or ship</p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">

          {/* Warning Banner */}
          <div className="flex gap-3 bg-destructive/10 border border-destructive/30 rounded-xl p-5">
            <AlertTriangle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-destructive">Important Notice</p>
              <p className="text-sm text-muted-foreground mt-1">
                Attempting to import prohibited items is a serious offense under Bangladesh customs law. TradeOn.global reserves the right to cancel any order suspected of containing prohibited goods. Any legal consequences arising from attempting to import prohibited items are the sole responsibility of the customer.
              </p>
            </div>
          </div>

          <p className="text-muted-foreground leading-relaxed">
            The following categories of items are strictly prohibited on our platform. We will not source, purchase, ship, or assist in importing these items under any circumstances. This list is in addition to any restrictions imposed by Chinese export laws and Bangladesh customs regulations.
          </p>

          {/* Categories */}
          <div className="space-y-5">
            {categories.map(({ title, items }) => (
              <div key={title} className="bg-card border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <XCircle className="h-5 w-5 text-destructive shrink-0" />
                  <h3 className="font-bold text-foreground">{title}</h3>
                </div>
                <ul className="space-y-1.5">
                  {items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-destructive mt-2 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Note */}
          <div className="flex gap-3 bg-muted rounded-xl p-5">
            <ShieldAlert className="h-6 w-6 text-primary shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-2">
              <p className="font-semibold text-foreground">Not sure if your item is allowed?</p>
              <p>This list is not exhaustive. If you are unsure whether a product can be imported, please contact us before placing an order. We're happy to help verify.</p>
              <p>📧 <a href="mailto:info@TradeOn.global" className="text-primary hover:underline">info@TradeOn.global</a> &nbsp;|&nbsp; 📞 <a href="tel:+8801898889950" className="text-primary hover:underline">01898-889950</a></p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ProhibitedItems;
