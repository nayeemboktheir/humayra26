import { ProductSearch } from "@/components/ProductSearch";
import { ShoppingBag } from "lucide-react";

const CATEGORIES = [
  { name: "Shoes", icon: "👟" },
  { name: "Bags", icon: "👜" },
  { name: "Jewelry", icon: "💎" },
  { name: "Beauty", icon: "💄" },
  { name: "Men's Clothing", icon: "👔" },
  { name: "Women's Clothing", icon: "👗" },
  { name: "Electronics", icon: "📱" },
  { name: "Watches", icon: "⌚" },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <ShoppingBag className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">ChinaShop</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#" className="text-muted-foreground hover:text-foreground transition">How it works</a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition">Shipping</a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition">Contact</a>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary/10 via-background to-background py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Import from <span className="text-primary">1688.com</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Search millions of products from China's largest wholesale marketplace. 
              Best prices, reliable shipping to Bangladesh.
            </p>
          </div>
          
          <ProductSearch />
        </div>
      </section>

      {/* Categories */}
      <section className="py-12 border-t">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-2xl font-bold mb-6">Popular Categories</h2>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-4">
            {CATEGORIES.map((cat) => (
              <button 
                key={cat.name}
                className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-muted transition group"
              >
                <span className="text-3xl group-hover:scale-110 transition-transform">{cat.icon}</span>
                <span className="text-xs text-center text-muted-foreground group-hover:text-foreground">
                  {cat.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2024 ChinaShop. Import products from 1688.com to Bangladesh.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
