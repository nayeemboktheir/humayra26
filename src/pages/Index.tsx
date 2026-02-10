import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Camera, ImageIcon, Loader2, ChevronLeft, ChevronRight, Star, BadgeCheck, Flame, Truck, Heart, ShoppingCart, User, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { alibaba1688Api, Product1688, ProductDetail1688 } from "@/lib/api/alibaba1688";
import { supabase } from "@/integrations/supabase/client";
import ProductDetail from "@/components/ProductDetail";
import { useAuth } from "@/contexts/AuthContext";

const CNY_TO_BDT = 17.5;
const convertToBDT = (cny: number) => Math.round(cny * CNY_TO_BDT);

// Categories matching chinaonlinebd.com
const categories = [
  { name: "Shoes", icon: "👟", query: "shoes" },
  { name: "Bag", icon: "👜", query: "bag" },
  { name: "Jewelry", icon: "💎", query: "jewelry" },
  { name: "Beauty And Personal Care", icon: "💄", query: "beauty products" },
  { name: "Men's Clothing", icon: "👔", query: "men clothing" },
  { name: "Women's Clothing", icon: "👗", query: "women clothing" },
  { name: "Baby Items", icon: "🍼", query: "baby items" },
  { name: "Eyewear", icon: "🕶️", query: "eyewear sunglasses" },
  { name: "Office Supplies", icon: "📎", query: "office supplies" },
  { name: "Seasonal Products", icon: "🌸", query: "seasonal products" },
  { name: "Phone Accessories", icon: "📱", query: "phone accessories" },
  { name: "Sports And Fitness", icon: "🏋️", query: "sports fitness" },
  { name: "Entertainment Items", icon: "🎮", query: "entertainment" },
  { name: "Watches", icon: "⌚", query: "watches" },
  { name: "Automobile Items", icon: "🚗", query: "automobile accessories" },
  { name: "Groceries And Pets", icon: "🐾", query: "pet supplies" },
  { name: "Outdoor And Travelling", icon: "🏕️", query: "outdoor travelling" },
  { name: "Electronics And Gadgets", icon: "🔌", query: "electronics gadgets" },
  { name: "Kitchen Gadgets", icon: "🍳", query: "kitchen gadgets" },
  { name: "Tools And Home Improvement", icon: "🔧", query: "tools home improvement" },
  { name: "School Supplies", icon: "📚", query: "school supplies" },
];

const topCategories = [
  { name: "Shoes", icon: "👟", query: "shoes", price: "150" },
  { name: "Bag", icon: "👜", query: "bag", price: "384" },
  { name: "Jewelry", icon: "💎", query: "jewelry", price: "14" },
  { name: "Beauty And Personal Care", icon: "💄", query: "beauty products", price: "50" },
  { name: "Men's Clothing", icon: "👔", query: "men clothing", price: "238" },
  { name: "Women's Clothing", icon: "👗", query: "women clothing", price: "717" },
  { name: "Baby Items", icon: "🍼", query: "baby items", price: "6" },
  { name: "Eyewear", icon: "🕶️", query: "eyewear", price: "70" },
  { name: "Office Supplies", icon: "📎", query: "office supplies", price: "35" },
  { name: "Winter Items", icon: "❄️", query: "winter items", price: "2" },
  { name: "Phone Accessories", icon: "📱", query: "phone accessories", price: "1" },
  { name: "Sports And Fitness", icon: "🏋️", query: "sports fitness", price: "40" },
  { name: "Entertainment Items", icon: "🎮", query: "entertainment", price: "2000" },
  { name: "Watches", icon: "⌚", query: "watches", price: "80" },
  { name: "Automobile", icon: "🚗", query: "automobile", price: "108" },
  { name: "Groceries And Pets", icon: "🐾", query: "pet supplies", price: "110" },
  { name: "Outdoor And Travelling", icon: "🏕️", query: "outdoor travelling", price: "620" },
  { name: "Electronics And Gadgets", icon: "🔌", query: "electronics", price: "30" },
  { name: "Kitchen Gadgets", icon: "🍳", query: "kitchen gadgets", price: "2" },
  { name: "Tools And Home", icon: "🔧", query: "tools", price: "6" },
  { name: "School Supplies", icon: "📚", query: "school supplies", price: "2" },
];

// Trending products data (from chinaonlinebd.com)
const trendingProducts = [
  { id: "abb-189535847655", title: "Metal Stainless Steel Compass Set for Students", image: "https://cbu01.alicdn.com/img/ibank/O1CN01hcgHP51nIHYLPqiTh_!!2220460965066-0-cib.310x310.jpg", price: 74, oldPrice: 76, sold: 8432108 },
  { id: "abb-130714535773", title: "Original Cartoon Shoulder Bag Large Capacity Canvas Bag", image: "https://cbu01.alicdn.com/img/ibank/O1CN01s5Oil52Eh0WsZp8Mm_!!2214657758775-0-cib.310x310.jpg", price: 91, oldPrice: 94, sold: 3982769 },
  { id: "abb-172982973149", title: "Deli Sf568 Posture-Correcting Student Fountain Pen Set", image: "https://cbu01.alicdn.com/img/ibank/O1CN01vN7RGZ1VXFOqHBYqJ_!!2219976542662-0-cib.310x310.jpg", price: 66, oldPrice: 68, sold: 1254653 },
  { id: "abb-158883101861", title: "True Color New Three-Color Gel Pen High-Quality", image: "https://cbu01.alicdn.com/img/ibank/O1CN01HrJlC61bmiSerh7vr_!!2219455113508-0-cib.310x310.jpg", price: 72, oldPrice: 74, sold: 9692584 },
  { id: "abb-113853719837", title: "Deli Ss005 Turbo Warrior Gel Pen Quick-Drying", image: "https://cbu01.alicdn.com/img/ibank/O1CN01VqLzZj2EZDqRlf3do_!!2214183158758-0-cib.310x310.jpg", price: 69, oldPrice: 71, sold: 8070966 },
  { id: "abb-189347214600", title: "Blue Fruit Handbook Pen Morandi Color Series 9-Piece Set", image: "https://cbu01.alicdn.com/img/ibank/O1CN01mFUfmw2Kue38hmDqQ_!!2220432529617-0-cib.310x310.jpg", price: 68, oldPrice: 70, sold: 4342616 },
  { id: "abb-104449903717", title: "New Creative Aircraft Gel Pen Military Weapon Fighter", image: "https://cbu01.alicdn.com/img/ibank/O1CN01eEHP4f1egFOeIzs0x_!!2208127063900-0-cib.310x310.jpg", price: 70, oldPrice: 72, sold: 4982215 },
  { id: "abb-868362523543", title: "Travel to Beautiful China 30 Postcards Night Scenery", image: "https://cbu01.alicdn.com/img/ibank/O1CN01Ti6Bv71FKqRCoR1mD_!!2458430469-0-cib.310x310.jpg", price: 95, oldPrice: 98, sold: 2326810 },
  { id: "abb-905114125851", title: "Xingyue Zircon Pearl Bracelet Women's Niche Design", image: "https://cbu01.alicdn.com/img/ibank/O1CN01PU5Ly120nVAvd6Lld_!!2204814786894-0-cib.310x310.jpg", price: 15, oldPrice: 16, sold: 1609452 },
  { id: "abb-872326066846", title: "Bracelet Ins Creative Design Star Moon Bracelet", image: "https://cbu01.alicdn.com/img/ibank/O1CN01TOrYkz1IENhWfZFuQ_!!2211872010861-0-cib.310x310.jpg", price: 24, oldPrice: 24, sold: 6584100 },
  { id: "abb-046426059572", title: "Bulletproof Youth Group Storage Bag Cosmetic Bag", image: "https://cbu01.alicdn.com/img/ibank/O1CN01PJvtV225rElM8ybFF_!!2218389807579-0-cib.310x310.jpg", price: 144, oldPrice: 148, sold: 7408922 },
  { id: "abb-012386255704", title: "Kapibala Ruler Suit Primary School Students Cute Set", image: "https://cbu01.alicdn.com/img/ibank/O1CN01yNa6ZA1OGZdF3hI1K_!!1060571678-0-cib.310x310.jpg", price: 65, oldPrice: 67, sold: 3906949 },
  { id: "abb-160064165815", title: "New Men's Wallet Casual Short Zipper Multi-Function", image: "https://cbu01.alicdn.com/img/ibank/O1CN01Dgz4Pf1OOonZeH0Bd_!!2217611721696-0-cib.310x310.jpg", price: 127, oldPrice: 131, sold: 7835575 },
  { id: "abb-122202715635", title: "Knock Cute Bear Schoolbag Nightlight Keychain", image: "https://cbu01.alicdn.com/img/ibank/O1CN01QkCQWH1h9E2zvLTp6_!!2218787444234-0-cib.310x310.jpg", price: 64, oldPrice: 66, sold: 5066763 },
  { id: "abb-159300685866", title: "Fitness Keychain Exquisite Key Chain Bag Pendant", image: "https://cbu01.alicdn.com/img/ibank/O1CN01LNBFUq1cCp2Q0lpKy_!!1703653565-0-cib.310x310.jpg", price: 123, oldPrice: 126, sold: 1572667 },
];

async function translateTextsBackground(texts: string[]): Promise<string[]> {
  try {
    const { data, error } = await supabase.functions.invoke('translate-text', { body: { texts } });
    if (error || !data?.translations) return texts;
    return data.translations;
  } catch { return texts; }
}

const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product1688[]>([]);
  const [translatedTitles, setTranslatedTitles] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductDetail1688 | null>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const topCatScrollRef = useRef<HTMLDivElement>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalResults, setTotalResults] = useState<number | null>(null);
  const [activeSearch, setActiveSearch] = useState<{
    mode: "text" | "image";
    query: string;
    altQueries: string[];
  } | null>(null);
  const [altQueryIndex, setAltQueryIndex] = useState(0);
  const [isTranslatingTitles, setIsTranslatingTitles] = useState(false);

  const handleTranslateTitles = async () => {
    if (products.length === 0 || isTranslatingTitles) return;
    setIsTranslatingTitles(true);
    try {
      const titles = products.map((p) => p.title);
      const translated = await translateTextsBackground(titles);
      const titleMap: Record<number, string> = {};
      products.forEach((product, index) => {
        const t = translated[index];
        if (t && t !== product.title) titleMap[product.num_iid] = t;
      });
      setTranslatedTitles(titleMap);
    } finally { setIsTranslatingTitles(false); }
  };

  const performSearch = async (searchQuery: string, page = 1) => {
    setIsLoading(true);
    setHasSearched(true);
    setSelectedProduct(null);
    setTranslatedTitles({});
    setCurrentPage(page);
    if (page === 1) { setTotalResults(null); setAltQueryIndex(0); }
    setActiveSearch({ mode: "text", query: searchQuery, altQueries: [] });

    try {
      const result = await alibaba1688Api.search(searchQuery, page);
      if (result.success && result.data) {
        setProducts(result.data.items);
        setTotalResults(result.data.total);
        if (result.data.items.length === 0) toast.info("No products found");
        else toast.success(`Found ${result.data.items.length} products`);
      } else {
        toast.error(result.error || "Search failed");
        setProducts([]);
        setTotalResults(0);
      }
    } catch {
      toast.error("Search failed");
      setProducts([]);
      setTotalResults(0);
    } finally { setIsLoading(false); }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) { toast.error("Please enter a search term"); return; }
    performSearch(trimmed);
  };

  const handleCategoryClick = (categoryQuery: string) => {
    setQuery(categoryQuery);
    performSearch(categoryQuery);
  };

  const handleImageSearch = async (file: File) => {
    setIsLoading(true);
    setHasSearched(true);
    setSelectedProduct(null);
    setTranslatedTitles({});
    setCurrentPage(1);
    setTotalResults(null);
    setAltQueryIndex(0);
    setActiveSearch({ mode: "image", query: "", altQueries: [] });

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => { resolve((reader.result as string).split(",")[1]); };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const imageBase64 = await base64Promise;
      toast.info("Uploading image and searching...");

      const result = await alibaba1688Api.searchByImage(imageBase64, 1);
      if (result.success && result.data) {
        setProducts(result.data.items);
        setTotalResults(result.data.total);
        const derivedQuery = (result.meta as any)?.query;
        const altQueries = Array.isArray((result.meta as any)?.altQueries) ? ((result.meta as any).altQueries as string[]) : [];
        setActiveSearch({
          mode: "image",
          query: typeof derivedQuery === "string" ? derivedQuery : "",
          altQueries: altQueries.filter(Boolean),
        });
        if (result.data.items.length === 0) toast.info("No similar products found");
        else toast.success(`Found ${result.data.items.length} similar products`);
      } else {
        toast.error(result.error || "Image search failed");
        setProducts([]);
        setTotalResults(0);
      }
    } catch {
      toast.error("Image search failed");
      setProducts([]);
      setTotalResults(0);
    } finally { setIsLoading(false); }
  };

  const PAGE_SIZE = 40;
  const totalPages = totalResults ? Math.ceil(totalResults / PAGE_SIZE) : 0;

  const goToPage = async (page: number) => {
    if (!activeSearch || isLoading) return;
    if (page < 1 || (totalPages > 0 && page > totalPages)) return;
    setIsLoading(true);
    setTranslatedTitles({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const searchQuery = activeSearch.query || query.trim();
      const resp = await alibaba1688Api.search(searchQuery, page);
      if (resp.success && resp.data) {
        setProducts(resp.data.items);
        setCurrentPage(page);
        setTotalResults(resp.data.total);
      } else toast.error(resp.error || "Failed to load page");
    } catch { toast.error("Failed to load page"); }
    finally { setIsLoading(false); }
  };

  const tryAlternativeMatch = async () => {
    if (!activeSearch || activeSearch.mode !== "image") return;
    const alts = activeSearch.altQueries;
    if (!alts || alts.length === 0) return;
    const nextIndex = (altQueryIndex + 1) % alts.length;
    const nextQuery = alts[nextIndex];
    if (!nextQuery) return;
    setAltQueryIndex(nextIndex);
    performSearch(nextQuery);
  };

  const handleImageButtonClick = () => { fileInputRef.current?.click(); };

  const validateAndSearchImage = (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be less than 5MB"); return; }
    handleImageSearch(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSearchImage(file);
    e.target.value = '';
  };

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current++; if (e.dataTransfer.types.includes('Files')) setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current--; if (dragCounterRef.current === 0) setIsDragging(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); dragCounterRef.current = 0; const files = e.dataTransfer.files; if (files.length > 0) validateAndSearchImage(files[0]); };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) { e.preventDefault(); validateAndSearchImage(file); break; }
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [isLoading]);

  const handleProductClick = async (product: Product1688) => {
    const fallback: ProductDetail1688 = {
      num_iid: product.num_iid,
      title: product.title,
      desc: '',
      price: product.price,
      pic_url: product.pic_url,
      item_imgs: (product.extra_images?.length ? product.extra_images : [product.pic_url]).filter(Boolean).map(url => ({ url })),
      location: product.location || '',
      num: product.stock ? String(product.stock) : '',
      min_num: 1,
      props: [],
      seller_info: { nick: product.vendor_name || '', shop_name: product.vendor_name || '', item_score: '', delivery_score: '', composite_score: '' },
      total_sold: product.sales,
      item_weight: product.weight,
    };
    setSelectedProduct(fallback);
    setIsLoadingProduct(true);
    try {
      const result = await alibaba1688Api.getProduct(product.num_iid);
      if (result.success && result.data) setSelectedProduct(result.data);
    } catch (error) { console.error("Product details error:", error); }
    finally { setIsLoadingProduct(false); }
  };

  const handleTrendingClick = async (productId: string) => {
    const numIid = parseInt(productId.replace('abb-', ''));
    setIsLoadingProduct(true);
    setSelectedProduct(null);
    try {
      const result = await alibaba1688Api.getProduct(numIid);
      if (result.success && result.data) setSelectedProduct(result.data);
      else toast.error("Failed to load product");
    } catch { toast.error("Failed to load product"); }
    finally { setIsLoadingProduct(false); }
  };

  const handleBackToSearch = () => { setSelectedProduct(null); };

  const getDisplayTitle = (product: Product1688) => translatedTitles[product.num_iid] || product.title;

  const scrollTopCat = (dir: 'left' | 'right') => {
    if (!topCatScrollRef.current) return;
    topCatScrollRef.current.scrollBy({ left: dir === 'left' ? -300 : 300, behavior: 'smooth' });
  };

  // Product detail view
  if (selectedProduct || isLoadingProduct) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader query={query} setQuery={setQuery} handleSearch={handleSearch} isLoading={isLoading} handleImageButtonClick={handleImageButtonClick} fileInputRef={fileInputRef} handleFileChange={handleFileChange} user={user} navigate={navigate} />
        <ProductDetail product={selectedProduct || undefined} isLoading={isLoadingProduct} onBack={handleBackToSearch} />
      </div>
    );
  }

  // Search results view
  if (hasSearched) {
    return (
      <div className="min-h-screen bg-background relative" onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
        {isDragging && <DragOverlay />}
        <SiteHeader query={query} setQuery={setQuery} handleSearch={handleSearch} isLoading={isLoading} handleImageButtonClick={handleImageButtonClick} fileInputRef={fileInputRef} handleFileChange={handleFileChange} user={user} navigate={navigate} />
        <div className="container mx-auto px-4 py-6 max-w-7xl">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Searching products...</p>
            </div>
          ) : products.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">
                  {totalResults ? `${totalResults.toLocaleString()} results` : `${products.length} products`}
                </h2>
                {totalPages > 1 && <span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</span>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {[...products].sort((a, b) => {
                  const scoreA = (a.sales || 0) >= 2000 ? 2 : (a.sales || 0) >= 500 ? 1 : 0;
                  const scoreB = (b.sales || 0) >= 2000 ? 2 : (b.sales || 0) >= 500 ? 1 : 0;
                  return scoreB - scoreA;
                }).map((product) => <ProductCard key={product.num_iid} product={product} getDisplayTitle={getDisplayTitle} onClick={() => handleProductClick(product)} />)}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-1 mt-8 pb-4">
                  <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1 || isLoading}><ChevronLeft className="h-4 w-4" /></Button>
                  {(() => {
                    const pages: (number | '...')[] = [];
                    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
                    else {
                      pages.push(1);
                      if (currentPage > 3) pages.push('...');
                      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
                      if (currentPage < totalPages - 2) pages.push('...');
                      pages.push(totalPages);
                    }
                    return pages.map((p, idx) =>
                      p === '...' ? <span key={`e-${idx}`} className="px-2 text-muted-foreground">…</span> : (
                        <Button key={p} variant={p === currentPage ? "default" : "outline"} size="sm" className="min-w-[36px]" onClick={() => goToPage(p)} disabled={isLoading}>{p}</Button>
                      )
                    );
                  })()}
                  <Button variant="outline" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages || isLoading}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-20"><p className="text-muted-foreground">No products found</p></div>
          )}
        </div>
      </div>
    );
  }

  // Homepage - like chinaonlinebd.com
  return (
    <div className="min-h-screen bg-background relative" onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
      {isDragging && <DragOverlay />}
      <SiteHeader query={query} setQuery={setQuery} handleSearch={handleSearch} isLoading={isLoading} handleImageButtonClick={handleImageButtonClick} fileInputRef={fileInputRef} handleFileChange={handleFileChange} user={user} navigate={navigate} />

      {/* Main content with category sidebar */}
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex gap-6 mt-4">
          {/* Category Sidebar - desktop only */}
          <aside className="hidden lg:block w-56 shrink-0">
            <div className="bg-card rounded-xl border p-4 sticky top-20">
              <h2 className="text-lg font-bold text-primary mb-4">Category</h2>
              <nav className="space-y-0.5">
                {categories.map((cat) => (
                  <button
                    key={cat.name}
                    onClick={() => handleCategoryClick(cat.query)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors text-left"
                  >
                    <span className="text-lg">{cat.icon}</span>
                    <span className="capitalize">{cat.name}</span>
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main area */}
          <div className="flex-1 min-w-0">
            {/* Hero banners */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="md:col-span-2 rounded-xl overflow-hidden bg-gradient-to-r from-primary/10 to-primary/5 border p-8 flex items-center">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">Buy Chinese Products</h1>
                  <p className="text-muted-foreground mb-4">Wholesale market from 1688.com with shipping to Bangladesh</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="cursor-pointer" onClick={() => handleCategoryClick("trending products")}>🔥 Trending</Badge>
                    <Badge variant="outline" className="cursor-pointer" onClick={() => handleCategoryClick("new arrivals")}>✨ New Arrivals</Badge>
                    <Badge variant="outline" className="cursor-pointer" onClick={() => handleCategoryClick("best selling")}>⭐ Best Sellers</Badge>
                  </div>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-6 flex flex-col justify-center">
                <h3 className="text-xl font-bold mb-2">শিপিং সার্ভিস</h3>
                <p className="text-sm opacity-90 mb-3">Ship your products from China to Bangladesh</p>
                <Button variant="secondary" size="sm" className="w-fit" onClick={() => navigate("/dashboard/shipments")}>
                  Learn More
                </Button>
              </div>
            </div>

            {/* Mobile categories */}
            <div className="lg:hidden mb-6">
              <div className="flex overflow-x-auto gap-3 pb-2 scrollbar-hide">
                {categories.slice(0, 12).map((cat) => (
                  <button
                    key={cat.name}
                    onClick={() => handleCategoryClick(cat.query)}
                    className="flex flex-col items-center gap-1 shrink-0 p-2 rounded-lg hover:bg-secondary transition-colors min-w-[72px]"
                  >
                    <span className="text-2xl">{cat.icon}</span>
                    <span className="text-[10px] text-muted-foreground text-center leading-tight capitalize">{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Top Category carousel */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="h-6 w-6 text-primary" />
                <h2 className="text-xl font-bold">Top Category</h2>
              </div>
              <div className="relative">
                <Button variant="ghost" size="icon" className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 bg-card shadow-md border h-8 w-8 hidden md:flex" onClick={() => scrollTopCat('left')}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div ref={topCatScrollRef} className="flex overflow-x-auto gap-4 pb-2 scrollbar-hide">
                  {topCategories.map((cat) => (
                    <button
                      key={cat.name}
                      onClick={() => handleCategoryClick(cat.query)}
                      className="flex flex-col items-center gap-2 shrink-0 group"
                    >
                      <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-secondary flex items-center justify-center text-3xl md:text-4xl group-hover:bg-primary/10 transition-colors border">
                        {cat.icon}
                      </div>
                      <Badge variant="outline" className="text-[10px] px-2 py-0 text-primary border-primary/30">
                        From {cat.price} ৳
                      </Badge>
                      <span className="text-xs font-medium text-center max-w-[96px] leading-tight capitalize">{cat.name}</span>
                    </button>
                  ))}
                </div>
                <Button variant="ghost" size="icon" className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 bg-card shadow-md border h-8 w-8 hidden md:flex" onClick={() => scrollTopCat('right')}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </section>

            {/* Trending Products */}
            <section className="mb-12">
              <div className="flex items-center gap-2 mb-4">
                <Heart className="h-6 w-6 text-primary fill-primary" />
                <h2 className="text-xl font-bold">Trending Products</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {trendingProducts.map((product) => (
                  <Card
                    key={product.id}
                    className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group"
                    onClick={() => handleTrendingClick(product.id)}
                  >
                    <div className="aspect-square overflow-hidden bg-muted relative">
                      <img
                        src={product.image}
                        alt={product.title}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                      />
                      <Badge className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5">
                        3% OFF
                      </Badge>
                    </div>
                    <CardContent className="p-3 space-y-1.5">
                      <h3 className="text-sm font-medium line-clamp-2 min-h-[2.5rem] leading-tight">{product.title}</h3>
                      <div className="flex items-center gap-0.5">
                        {[...Array(5)].map((_, i) => <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />)}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-primary">৳{product.price}</span>
                        {product.oldPrice > product.price && (
                          <span className="text-xs text-muted-foreground line-through">৳{product.oldPrice}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">SOLD : {product.sold.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t bg-card mt-8">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <h3 className="font-bold mb-3">Quick Links</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <button onClick={() => handleCategoryClick("shoes")} className="block hover:text-foreground">Shoes</button>
                <button onClick={() => handleCategoryClick("bag")} className="block hover:text-foreground">Bags</button>
                <button onClick={() => handleCategoryClick("electronics")} className="block hover:text-foreground">Electronics</button>
              </div>
            </div>
            <div>
              <h3 className="font-bold mb-3">Services</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Buy & Ship for me</p>
                <p>Ship for me</p>
                <p>RFQ Management</p>
              </div>
            </div>
            <div>
              <h3 className="font-bold mb-3">Support</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>How to Order</p>
                <p>Shipping Policy</p>
                <p>Contact Us</p>
              </div>
            </div>
            <div>
              <h3 className="font-bold mb-3">Account</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <button onClick={() => navigate(user ? "/dashboard" : "/auth")} className="block hover:text-foreground">
                  {user ? "Dashboard" : "Sign In"}
                </button>
                <button onClick={() => navigate("/dashboard/orders")} className="block hover:text-foreground">My Orders</button>
                <button onClick={() => navigate("/dashboard/wishlist")} className="block hover:text-foreground">Wishlist</button>
              </div>
            </div>
          </div>
          <div className="border-t mt-6 pt-6 text-center text-sm text-muted-foreground">
            <p>© 2025 China Online BD - Wholesale from 1688.com to Bangladesh</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

// Shared components

const SiteHeader = ({ query, setQuery, handleSearch, isLoading, handleImageButtonClick, fileInputRef, handleFileChange, user, navigate }: any) => (
  <header className="sticky top-0 z-50 bg-card border-b shadow-sm">
    <div className="container mx-auto px-4 max-w-7xl">
      <div className="flex items-center gap-4 h-16">
        {/* Logo */}
        <button onClick={() => { setQuery(""); window.location.href = "/"; }} className="shrink-0">
          <h1 className="text-xl font-bold text-primary">ChinaOnlineBD</h1>
        </button>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex-1 flex gap-2 max-w-2xl">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input type="text" placeholder="Search by product name..." value={query} onChange={(e: any) => setQuery(e.target.value)} className="pl-10 h-10" />
          </div>
          <Button type="button" variant="outline" size="icon" title="Search by image" onClick={handleImageButtonClick} disabled={isLoading} className="shrink-0">
            <Camera className="h-4 w-4" />
          </Button>
          <Button type="submit" disabled={isLoading} className="shrink-0 px-6">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </form>

        {/* Right nav */}
        <div className="hidden md:flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/wishlist")} title="Wishlist">
            <Heart className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/orders")} title="Orders">
            <ShoppingCart className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate(user ? "/dashboard" : "/auth")} title={user ? "Dashboard" : "Sign In"}>
            <User className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  </header>
);

const DragOverlay = () => (
  <div className="fixed inset-0 z-[100] bg-primary/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
    <div className="bg-background border-2 border-dashed border-primary rounded-xl p-12 text-center shadow-lg">
      <ImageIcon className="h-16 w-16 text-primary mx-auto mb-4" />
      <p className="text-xl font-semibold text-primary">Drop image to search</p>
      <p className="text-sm text-muted-foreground mt-2">Find similar products on 1688</p>
    </div>
  </div>
);

const ProductCard = ({ product, getDisplayTitle, onClick }: { product: Product1688; getDisplayTitle: (p: Product1688) => string; onClick: () => void }) => {
  const isTopRated = (product.sales || 0) >= 2000;
  const isVerified = !isTopRated && (product.sales || 0) >= 500;
  const formattedSales = product.sales
    ? product.sales >= 1000 ? `${(product.sales / 1000).toFixed(product.sales >= 10000 ? 0 : 1)}K Sold` : `${product.sales} Sold`
    : null;

  return (
    <Card className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group" onClick={onClick}>
      <div className="aspect-square overflow-hidden bg-muted relative">
        <img src={product.pic_url} alt={getDisplayTitle(product)} referrerPolicy="no-referrer" loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
        />
        {product.location && (
          <div className="absolute bottom-2 left-2 bg-background/80 backdrop-blur-sm text-foreground text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
            <span className="inline-block w-3 h-2 rounded-sm bg-destructive" /> CN
          </div>
        )}
      </div>
      <CardContent className="p-3 space-y-1.5">
        <h3 className="text-sm font-medium line-clamp-2 min-h-[2.5rem] leading-tight">{getDisplayTitle(product)}</h3>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /><span>5</span></div>
          {formattedSales && <span>{formattedSales}</span>}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-bold text-primary">৳{convertToBDT(product.price).toLocaleString()}</span>
          <span className="text-xs text-muted-foreground">(¥{product.price})</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {isVerified && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-emerald-500 text-emerald-600 bg-emerald-50 gap-0.5">
              <BadgeCheck className="h-3 w-3" /> Verified
            </Badge>
          )}
          {isTopRated && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-destructive text-destructive bg-destructive/10 gap-0.5">
              <Flame className="h-3 w-3" /> Top Rated
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
          <span>MOQ: 1</span>
          <span className="flex items-center gap-0.5"><Truck className="h-3 w-3" /> CN to BD: 10-12 days</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default Index;
