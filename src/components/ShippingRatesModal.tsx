import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plane } from "lucide-react";
import { ReactNode } from "react";

interface RateItem {
  name: string;
  rate: string;
}

interface RateCategory {
  heading: string;
  description?: string;
  items: RateItem[];
}

const shippingCategories: RateCategory[] = [
  {
    heading: "Category A — 780 Tk/Kg",
    description: "Without Battery, Liquid, Magnet",
    items: [
      { name: "Shoes & Sandals", rate: "780 Tk/Kg" },
      { name: "Bags (all types)", rate: "780 Tk/Kg" },
      { name: "Jewelry & Accessories", rate: "780 Tk/Kg" },
      { name: "Appliances", rate: "780 Tk/Kg" },
      { name: "Stickers & Decals", rate: "780 Tk/Kg" },
      { name: "Electronics (no battery)", rate: "780 Tk/Kg" },
      { name: "Computer Accessories", rate: "780 Tk/Kg" },
      { name: "Ceramics", rate: "780 Tk/Kg" },
      { name: "Metal Products", rate: "780 Tk/Kg" },
      { name: "Leather Products", rate: "780 Tk/Kg" },
      { name: "Rubber & Plastic Products", rate: "780 Tk/Kg" },
      { name: "Toys", rate: "780 Tk/Kg" },
    ],
  },
  {
    heading: "Category B — 1080 Tk/Kg",
    description: "With Battery",
    items: [
      { name: "Battery-type Products", rate: "1080 Tk/Kg" },
      { name: "Duplicate/Copy Brand Products", rate: "1080 Tk/Kg" },
      { name: "Networking Items", rate: "1080 Tk/Kg" },
      { name: "Magnet / Laser Products", rate: "1080 Tk/Kg" },
    ],
  },
  {
    heading: "Category C — Special Items",
    items: [
      { name: "Clothing / Garments", rate: "780 Tk/Kg" },
      { name: "Hijab / Veil", rate: "850 Tk/Kg" },
      { name: "Bluetooth Headphones", rate: "1100 Tk/Kg" },
      { name: "Ordinary Watch", rate: "1200 Tk/Kg" },
      { name: "Food Items", rate: "1250 Tk/Kg" },
      { name: "Liquid / Cosmetics", rate: "1250 Tk/Kg" },
      { name: "Smart Watch", rate: "1250 Tk/Kg" },
      { name: "Powder", rate: "1300 Tk/Kg" },
      { name: "Battery / Power Bank Only", rate: "1350 Tk/Kg" },
      { name: "CC Camera", rate: "1500 Tk/Kg" },
      { name: "Sunglasses", rate: "3000 Tk/Kg" },
    ],
  },
];

export default function ShippingRatesModal({ children }: { children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5 text-primary" />
            Shipping Charges — By Air
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {shippingCategories.map((cat) => (
            <div key={cat.heading}>
              <h3 className="font-bold text-sm mb-1">{cat.heading}</h3>
              {cat.description && (
                <p className="text-xs text-muted-foreground mb-2">{cat.description}</p>
              )}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="text-left py-2 px-3 font-semibold text-muted-foreground text-xs">Item</th>
                      <th className="text-right py-2 px-3 font-semibold text-muted-foreground text-xs">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {cat.items.map((item) => (
                      <tr key={item.name} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2 px-3">{item.name}</td>
                        <td className="py-2 px-3 text-right font-medium text-primary">{item.rate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <p className="text-xs text-muted-foreground leading-relaxed">
            ** পণ্যা বাংলাদেশে আমার পর পণ্যের ক্যাটাগরির উপর নির্ভর করে চূড়ান্ত শিপিং চার্জ নির্ধারণ করা হবে।
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
