import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Camera, ImageIcon, Loader2, ChevronLeft, ChevronRight, Star, BadgeCheck, Flame, Truck, Heart, ShoppingCart, User, Zap, SlidersHorizontal, Download, X, ArrowRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { alibaba1688Api, Product1688, ProductDetail1688 } from "@/lib/api/alibaba1688";
import { supabase } from "@/integrations/supabase/client";
import ProductDetail from "@/components/ProductDetail";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import SearchFilters, { SearchFilterValues, getDefaultFilters, applyFilters } from "@/components/SearchFilters";
import CategorySection from "@/components/CategorySection";
import { useAppSettings } from "@/hooks/useAppSettings";
import BottomNav from "@/components/BottomNav";

const ProductCardSkeleton = () => (
  <Card className="overflow-hidden">
    <Skeleton className="aspect-square w-full" />
    <CardContent className="p-3 space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-3 w-16" />
    </CardContent>
  </Card>
);

const ProductGridSkeleton = ({ count = 12 }: { count?: number }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 animate-fade-in">
    {Array.from({ length: count }).map((_, i) => (
      <ProductCardSkeleton key={i} />
    ))}
  </div>
);

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

// Hardcoded fallback trending products
const fallbackTrendingProducts = [
  { id: "abb-189535847655", title: "Metal Stainless Steel Compass Set for Students", image: "https://cbu01.alicdn.com/img/ibank/O1CN01hcgHP51nIHYLPqiTh_!!2220460965066-0-cib.310x310.jpg", price: 74, oldPrice: 76, sold: 8432108 },
  { id: "abb-905114125851", title: "Original Cartoon Shoulder Bag Large Capacity Canvas", image: "https://cbu01.alicdn.com/img/ibank/O1CN01s5Oil52Eh0WsZp8Mm_!!2214657758775-0-cib.310x310.jpg", price: 91, oldPrice: 94, sold: 3982769 },
  { id: "abb-172982973149", title: "Deli Sf568 Posture-Correcting Student Fountain Pen Set", image: "https://cbu01.alicdn.com/img/ibank/O1CN01vN7RGZ1VXFOqHBYqJ_!!2219976542662-0-cib.310x310.jpg", price: 66, oldPrice: 68, sold: 1254653 },
  { id: "abb-113853719837", title: "Deli Ss005 Turbo Warrior Gel Pen Quick-Drying", image: "https://cbu01.alicdn.com/img/ibank/O1CN01VqLzZj2EZDqRlf3do_!!2214183158758-0-cib.310x310.jpg", price: 69, oldPrice: 71, sold: 8070966 },
  { id: "abb-189347214600", title: "Blue Fruit Handbook Pen Morandi Color Series 9-Piece Set", image: "https://cbu01.alicdn.com/img/ibank/O1CN01mFUfmw2Kue38hmDqQ_!!2220432529617-0-cib.310x310.jpg", price: 68, oldPrice: 70, sold: 4342616 },
  { id: "abb-104449903717", title: "New Creative Aircraft Gel Pen Military Weapon Fighter", image: "https://cbu01.alicdn.com/img/ibank/O1CN01eEHP4f1egFOeIzs0x_!!2208127063900-0-cib.310x310.jpg", price: 70, oldPrice: 72, sold: 4982215 },
  { id: "abb-868362523543", title: "Travel to Beautiful China 30 Postcards Night Scenery", image: "https://cbu01.alicdn.com/img/ibank/O1CN01Ti6Bv71FKqRCoR1mD_!!2458430469-0-cib.310x310.jpg", price: 95, oldPrice: 98, sold: 2326810 },
];




const Index = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { settings } = useAppSettings();
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product1688[]>([]);
  const [_translatedTitles] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductDetail1688 | null>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [isTranslatingProduct] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [imageSearchFile, setImageSearchFile] = useState<File | null>(null);
  const [imageSearchKeyword, setImageSearchKeyword] = useState("");
  const [imageSearchPreview, setImageSearchPreview] = useState<string | null>(null);
  const [imageSearchBase64, setImageSearchBase64] = useState<string | null>(null);
  const [imageSearchConvertedUrl, setImageSearchConvertedUrl] = useState<string | null>(null);
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
  const [_isTranslatingTitles] = useState(false);
  const [filters, setFilters] = useState<SearchFilterValues>(getDefaultFilters());
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [trendingProducts, setTrendingProducts] = useState(fallbackTrendingProducts);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Prefetch all category products in one query + trending products
  const [categoryProductsMap, setCategoryProductsMap] = useState<Record<string, any[]>>({});
  const [isTrendingLoaded, setIsTrendingLoaded] = useState(false);
  const [loadedCategoryCount, setLoadedCategoryCount] = useState(0);

  useEffect(() => {
    // Step 1: Load trending products first (instant display)
    const fetchTrending = async () => {
      const trendingRes = await supabase.from("trending_products").select("*").order("sold", { ascending: false });
      if (!trendingRes.error && trendingRes.data && trendingRes.data.length > 0) {
        setTrendingProducts(
          trendingRes.data.map((p: any) => ({
            id: p.product_id,
            title: p.title,
            image: p.image_url,
            price: Number(p.price) || 0,
            oldPrice: Number(p.old_price) || Number(p.price) || 0,
            sold: Number(p.sold) || 0,
          }))
        );
      }
      setIsTrendingLoaded(true);
    };

    // Step 2: Load categories progressively (serial batches so sections appear one-by-one)
    const fetchCategories = async () => {
      const [categoryRes1, categoryRes2] = await Promise.all([
        supabase.from("category_products").select("*").order("created_at", { ascending: true }).range(0, 999),
        supabase.from("category_products").select("*").order("created_at", { ascending: true }).range(1000, 1999),
      ]);
      const allCategoryData = [
        ...(categoryRes1.data || []),
        ...(categoryRes2.data || []),
      ];

      if (allCategoryData.length > 0) {
        const grouped: Record<string, any[]> = {};
        for (const row of allCategoryData) {
          if (!grouped[row.category_query]) grouped[row.category_query] = [];
          grouped[row.category_query].push(row);
        }
        // Progressive reveal: add categories one by one with small delays
        const categoryKeys = categories.map(c => c.query).filter(q => grouped[q]);
        const buildMap: Record<string, any[]> = {};
        for (let i = 0; i < categoryKeys.length; i++) {
          buildMap[categoryKeys[i]] = grouped[categoryKeys[i]];
          setCategoryProductsMap({ ...buildMap });
          setLoadedCategoryCount(i + 1);
          // Small stagger so each category animates in
          if (i < categoryKeys.length - 1) {
            await new Promise(r => setTimeout(r, 80));
          }
        }
      }
    };

    // Fire trending first, then categories after
    fetchTrending().then(fetchCategories);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        toast.success("App installed successfully!");
      }
      setDeferredPrompt(null);
    } else if (window.matchMedia("(display-mode: standalone)").matches) {
      toast.info("App is already installed!");
    } else {
      // Fallback for iOS / browsers that don't support beforeinstallprompt
      toast.info("Tap Share → Add to Home Screen to install", { duration: 5000 });
    }
  };




  const performSearch = async (searchQuery: string, page = 1) => {
    setIsLoading(true);
    setHasSearched(true);
    setSelectedProduct(null);


    setCurrentPage(page);
    if (page === 1) { setTotalResults(null); setAltQueryIndex(0); }
    setActiveSearch({ mode: "text", query: searchQuery, altQueries: [] });

    // Update URL with search query and page
    const params = new URLSearchParams();
    params.set("q", searchQuery);
    if (page > 1) params.set("page", String(page));
    setSearchParams(params, { replace: true });

    try {
      const result = await alibaba1688Api.search(searchQuery, page, 40);
      if (result.success && result.data) {
        setProducts(result.data.items);
        setTotalResults(result.data.total);
        if (result.data.items.length === 0) toast.info("No products found");
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

  // State for cached category view
  const [activeCategoryView, setActiveCategoryView] = useState<{ query: string; name: string; icon: string } | null>(null);
  const [categoryPage, setCategoryPage] = useState(1);
  const [categoryProducts, setCategoryProducts] = useState<Product1688[]>([]);
  const [categoryTotal, setCategoryTotal] = useState<number | null>(null);
  const [isCategoryLoading, setIsCategoryLoading] = useState(false);
  const [visibleCategoryCount, setVisibleCategoryCount] = useState<number>(Infinity);

  const CATEGORY_PAGE_SIZE = 40;
  const categoryTotalPages = categoryTotal ? Math.ceil(categoryTotal / CATEGORY_PAGE_SIZE) : 0;

  const loadCategoryPage = async (categoryQuery: string, page: number) => {
    setIsCategoryLoading(true);
    setVisibleCategoryCount(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const result = await alibaba1688Api.search(categoryQuery, page, CATEGORY_PAGE_SIZE);
      if (result.success && result.data) {
        setCategoryProducts(result.data.items);
        setCategoryTotal(result.data.total);
        setCategoryPage(page);
        // Progressive reveal: show first row instantly, then add rows
        const cols = window.innerWidth >= 1280 ? 6 : window.innerWidth >= 1024 ? 5 : window.innerWidth >= 768 ? 4 : window.innerWidth >= 640 ? 3 : 2;
        const totalItems = result.data.items.length;
        setVisibleCategoryCount(cols); // First row instant
        setIsCategoryLoading(false);
        // Reveal remaining rows progressively
        for (let shown = cols * 2; shown <= totalItems; shown += cols) {
          await new Promise(r => setTimeout(r, 60));
          setVisibleCategoryCount(shown);
        }
        setVisibleCategoryCount(Infinity); // Show all
      } else {
        toast.error(result.error || "Failed to load page");
        setIsCategoryLoading(false);
      }
    } catch {
      toast.error("Failed to load page");
      setIsCategoryLoading(false);
    }
  };

  const handleCategoryClick = (categoryQuery: string) => {
    const cat = categories.find(c => c.query === categoryQuery);
    if (cat) {
      // Page 1 loads from cache
      const cachedRows = categoryProductsMap[categoryQuery] || [];
      const cachedProducts: Product1688[] = cachedRows.map((row: any) => ({
        num_iid: parseInt(String(row.product_id).replace(/^abb-/, ''), 10) || 0,
        title: row.title,
        pic_url: row.image_url,
        price: Number(row.price) || 0,
        sales: row.sales || undefined,
        detail_url: row.detail_url || '',
        location: row.location || '',
        vendor_name: row.vendor_name || '',
        stock: row.stock || undefined,
        weight: row.weight ? Number(row.weight) : undefined,
        extra_images: row.extra_images || [],
      }));
      setActiveCategoryView({ query: categoryQuery, name: cat.name, icon: cat.icon });
      setCategoryProducts(cachedProducts);
      setCategoryPage(1);
      setCategoryTotal(null);
      setVisibleCategoryCount(Infinity);
      setSearchParams({ category: categoryQuery }, { replace: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setQuery(categoryQuery);
      performSearch(categoryQuery);
    }
  };

  const goToCategoryPage = (page: number) => {
    if (!activeCategoryView || isCategoryLoading) return;
    if (page === 1) {
      // Go back to cached page 1
      handleCategoryClick(activeCategoryView.query);
      return;
    }
    setCategoryPage(page);
    setSearchParams({ category: activeCategoryView.query, page: String(page) }, { replace: true });
    loadCategoryPage(activeCategoryView.query, page);
  };

  const handleImageSearch = async (file: File, keyword = '') => {
    setImageSearchFile(null);
    setImageSearchPreview(null);
    setImageSearchKeyword("");
    setIsLoading(true);
    setHasSearched(true);
    setSelectedProduct(null);

    setCurrentPage(1);
    setTotalResults(null);
    setAltQueryIndex(0);
    setActiveSearch({ mode: "image", query: keyword, altQueries: [] });

    try {
      // Compress image for faster upload & search
      const { compressImage } = await import('@/lib/compressImage');
      toast.info("Compressing image...");
      const imageBase64 = await compressImage(file, 800, 800, 0.7);
      toast.info("Uploading image and searching...");

      // Use filename as hint if no keyword provided
      const effectiveKeyword = keyword || file.name.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ');
      setImageSearchBase64(imageBase64);
      const result = await alibaba1688Api.searchByImage(imageBase64, 1, 20, effectiveKeyword);
      if (result.success && result.data) {
        setProducts(result.data.items);
        setTotalResults(result.data.total);
        // Store converted image URL for faster pagination (no re-upload needed)
        const convertedUrl = (result as any).meta?.convertedImageUrl;
        if (convertedUrl) setImageSearchConvertedUrl(convertedUrl);
        const derivedQuery = (result.meta as any)?.query;
        const altQueries = Array.isArray((result.meta as any)?.altQueries) ? ((result.meta as any).altQueries as string[]) : [];
        setActiveSearch({
          mode: "image",
          query: typeof derivedQuery === "string" ? derivedQuery : keyword,
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
    
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Update URL with page
    const params = new URLSearchParams(searchParams);
    if (page > 1) params.set("page", String(page));
    else params.delete("page");
    setSearchParams(params, { replace: true });

    try {
      if (activeSearch.mode === 'image' && (imageSearchConvertedUrl || imageSearchBase64)) {
        // Image search pagination — use converted URL if available (faster, no re-upload)
        const resp = await alibaba1688Api.searchByImage(
          imageSearchBase64 || '', page, 20, '', imageSearchConvertedUrl || ''
        );
        if (resp.success && resp.data) {
          setProducts(resp.data.items);
          setCurrentPage(page);
          setTotalResults(resp.data.total);
        } else toast.error(resp.error || "Failed to load page");
      } else {
        const searchQuery = activeSearch.query || query.trim();
        const resp = await alibaba1688Api.search(searchQuery, page, 40);
        if (resp.success && resp.data) {
          setProducts(resp.data.items);
          setCurrentPage(page);
          setTotalResults(resp.data.total);
        } else toast.error(resp.error || "Failed to load page");
      }
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
    // Show preview dialog for optional keyword hint
    setImageSearchFile(file);
    setImageSearchKeyword("");
    const url = URL.createObjectURL(file);
    setImageSearchPreview(url);
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

  // Titles are now translated server-side in edge functions

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
    setSearchParams({ product: String(product.num_iid) });
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
    setSearchParams({ product: String(numIid) });
    try {
      const result = await alibaba1688Api.getProduct(numIid);
      if (result.success && result.data) {
        setSelectedProduct(result.data);
      } else if (!result.success) {
        toast.error("This product is no longer available");
        setSelectedProduct(null);
        setSearchParams({});
      }
    } catch {
      toast.error("This product is no longer available");
      setSelectedProduct(null);
      setSearchParams({});
    }
    finally { setIsLoadingProduct(false); }
  };

  const handleBackToSearch = () => { setSelectedProduct(null); setActiveCategoryView(null); setSearchParams({}); };

  // Load product or search from URL params on mount
  useEffect(() => {
    const productParam = searchParams.get('product');
    const qParam = searchParams.get('q');
    const pageParam = searchParams.get('page');
    if (productParam && !selectedProduct && !isLoadingProduct) {
      const numIid = parseInt(productParam);
      if (!isNaN(numIid) && numIid > 0) {
        handleTrendingClick(`abb-${numIid}`);
      }
    } else if (qParam && !hasSearched) {
      setQuery(qParam);
      performSearch(qParam, pageParam ? parseInt(pageParam) : 1);
    } else {
      const catParam = searchParams.get('category');
      if (catParam && !activeCategoryView) {
        const cat = categories.find(c => c.query === catParam);
        if (cat) {
          const catPageParam = searchParams.get('page');
          const catPage = catPageParam ? parseInt(catPageParam) : 1;
          if (catPage > 1) {
            // Load from API for page 2+
            setActiveCategoryView({ query: catParam, name: cat.name, icon: cat.icon });
            loadCategoryPage(catParam, catPage);
          } else {
            handleCategoryClick(catParam);
          }
        }
      }
    }
  }, []);

  const getDisplayTitle = (product: Product1688) => product.title;

  const scrollTopCat = (dir: 'left' | 'right') => {
    if (!topCatScrollRef.current) return;
    topCatScrollRef.current.scrollBy({ left: dir === 'left' ? -300 : 300, behavior: 'smooth' });
  };

  // Image search hint dialog
  const imageSearchDialog = imageSearchFile && imageSearchPreview && (
    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setImageSearchFile(null); setImageSearchPreview(null); }}>
      <div className="bg-card rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Image Search</h3>
          <button onClick={() => { setImageSearchFile(null); setImageSearchPreview(null); }} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="aspect-square max-h-48 mx-auto rounded-lg overflow-hidden bg-muted">
          <img src={imageSearchPreview} alt="Search image" className="w-full h-full object-contain" />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">Add keyword for better accuracy (optional)</label>
          <Input
            type="text"
            placeholder="e.g. fog machine, LED light, bag..."
            value={imageSearchKeyword}
            onChange={(e) => setImageSearchKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleImageSearch(imageSearchFile!, imageSearchKeyword.trim());
              }
            }}
            autoFocus
          />
          <p className="text-xs text-muted-foreground mt-1">Adding a keyword helps find more relevant products</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => handleImageSearch(imageSearchFile!)}>
            Search without keyword
          </Button>
          <Button className="flex-1" onClick={() => handleImageSearch(imageSearchFile!, imageSearchKeyword.trim())} disabled={!imageSearchKeyword.trim()}>
            <Search className="h-4 w-4 mr-1" /> Search
          </Button>
        </div>
      </div>
    </div>
  );

  // Product detail view
  if (selectedProduct || isLoadingProduct) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-0">
        {imageSearchDialog}
        <SiteHeader query={query} setQuery={setQuery} handleSearch={handleSearch} isLoading={isLoading} handleImageButtonClick={handleImageButtonClick} fileInputRef={fileInputRef} handleFileChange={handleFileChange} user={user} navigate={navigate} handleInstallClick={handleInstallClick} settings={settings} />
        <ProductDetail product={selectedProduct || undefined} isLoading={isTranslatingProduct} onBack={handleBackToSearch} />
        <BottomNav />
      </div>
    );
  }

  // Cached category view
  if (activeCategoryView) {
    const displayProducts = applyFilters(categoryProducts, filters, convertToBDT);
    const showPagination = categoryTotalPages > 1 || categoryPage === 1; // Always show nav since there are more pages on 1688

    return (
      <div className="min-h-screen bg-background pb-20 md:pb-0">
        {imageSearchDialog}
        <SiteHeader query={query} setQuery={setQuery} handleSearch={handleSearch} isLoading={isLoading} handleImageButtonClick={handleImageButtonClick} fileInputRef={fileInputRef} handleFileChange={handleFileChange} user={user} navigate={navigate} handleInstallClick={handleInstallClick} settings={settings} />
        <div className="px-3 sm:px-6">
          <div className="flex gap-6 mt-4">
            {/* Category Sidebar - desktop only */}
            <aside className="hidden lg:block w-56 shrink-0">
              <div className="bg-card rounded-xl border p-4 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-hide">
                <h2 className="text-lg font-bold text-primary mb-4">Category</h2>
                <nav className="space-y-0.5">
                  {categories.map((cat) => (
                    <button
                      key={cat.name}
                      onClick={() => handleCategoryClick(cat.query)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left ${cat.query === activeCategoryView.query ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
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
              {/* Category header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={handleBackToSearch} className="gap-1">
                    <ChevronLeft className="h-4 w-4" /> Home
                  </Button>
                  <span className="text-2xl">{activeCategoryView.icon}</span>
                  <h2 className="text-xl font-bold">{activeCategoryView.name}</h2>
                </div>
                {categoryTotal && (
                  <span className="text-sm text-muted-foreground">
                    {categoryTotal.toLocaleString()} products · Page {categoryPage}
                  </span>
                )}
              </div>
              <div className="border-b border-primary/20 mb-4" />

              {/* Mobile categories */}
              <div className="lg:hidden mb-6">
                <div className="flex overflow-x-auto gap-3 pb-2 scrollbar-hide">
                  {categories.map((cat) => (
                    <button
                      key={cat.name}
                      onClick={() => handleCategoryClick(cat.query)}
                      className={`flex flex-col items-center gap-1 shrink-0 p-2 rounded-lg transition-colors min-w-[72px] ${cat.query === activeCategoryView.query ? 'bg-primary/10' : 'hover:bg-secondary'}`}
                    >
                      <span className="text-2xl">{cat.icon}</span>
                      <span className="text-[10px] text-muted-foreground text-center leading-tight capitalize">{cat.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {isCategoryLoading ? (
                <ProductGridSkeleton count={18} />
              ) : displayProducts.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {displayProducts.slice(0, visibleCategoryCount).map((product) => (
                      <Card
                        key={product.num_iid}
                        className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group animate-fade-in"
                        onClick={() => handleProductClick(product)}
                      >
                        <div className="aspect-square overflow-hidden bg-muted relative">
                          <img
                            src={product.pic_url}
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
                            <span className="text-lg font-bold text-primary">৳{convertToBDT(product.price).toLocaleString()}</span>
                          </div>
                          {product.sales ? (
                            <p className="text-[10px] text-muted-foreground">SOLD : {product.sales.toLocaleString()}</p>
                          ) : null}
                        </CardContent>
                      </Card>
                    ))}
                    {/* Skeleton placeholders for products not yet revealed */}
                    {visibleCategoryCount < displayProducts.length && (
                      Array.from({ length: Math.min(6, displayProducts.length - visibleCategoryCount) }).map((_, i) => (
                        <ProductCardSkeleton key={`skel-${i}`} />
                      ))
                    )}
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-center gap-1 mt-8 pb-4">
                    <Button variant="outline" size="sm" onClick={() => goToCategoryPage(categoryPage - 1)} disabled={categoryPage <= 1 || isCategoryLoading}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {(() => {
                      const maxPage = categoryTotalPages > 0 ? categoryTotalPages : Math.max(categoryPage + 5, 25);
                      const pages: (number | '...')[] = [];
                      if (maxPage <= 7) {
                        for (let i = 1; i <= maxPage; i++) pages.push(i);
                      } else {
                        pages.push(1);
                        if (categoryPage > 3) pages.push('...');
                        for (let i = Math.max(2, categoryPage - 1); i <= Math.min(maxPage - 1, categoryPage + 1); i++) pages.push(i);
                        if (categoryPage < maxPage - 2) pages.push('...');
                        pages.push(maxPage);
                      }
                      return pages.map((p, idx) =>
                        p === '...' ? <span key={`e-${idx}`} className="px-2 text-muted-foreground">…</span> : (
                          <Button key={p} variant={p === categoryPage ? "default" : "outline"} size="sm" className="min-w-[36px]" onClick={() => goToCategoryPage(p as number)} disabled={isCategoryLoading}>{p}</Button>
                        )
                      );
                    })()}
                    <Button variant="outline" size="sm" onClick={() => goToCategoryPage(categoryPage + 1)} disabled={isCategoryLoading || (categoryTotalPages > 0 && categoryPage >= categoryTotalPages)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-20"><p className="text-muted-foreground">No products in this category</p></div>
              )}
            </div>
          </div>
        </div>
        <Footer />
        <BottomNav />
      </div>
    );
  }

  // Search results view
  if (hasSearched) {
    const filteredProducts = applyFilters(products, filters, convertToBDT);

    return (
      <div className="min-h-screen bg-background relative pb-20 md:pb-0" onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
        {isDragging && <DragOverlay />}
        {imageSearchDialog}
        <SiteHeader query={query} setQuery={setQuery} handleSearch={handleSearch} isLoading={isLoading} handleImageButtonClick={handleImageButtonClick} fileInputRef={fileInputRef} handleFileChange={handleFileChange} user={user} navigate={navigate} handleInstallClick={handleInstallClick} />
        <div className="px-3 sm:px-6 py-6">
          <div className="flex gap-6">
            {/* Filter Sidebar */}
            <SearchFilters
              filters={filters}
              onFiltersChange={setFilters}
              onCategorySearch={(q) => { setQuery(q); performSearch(q); }}
            />

            {/* Mobile filter toggle */}
            <div className="lg:hidden fixed bottom-20 md:bottom-4 right-4 z-40">
              <Button size="sm" className="rounded-full shadow-lg gap-1.5" onClick={() => setMobileFiltersOpen(true)}>
                <SlidersHorizontal className="h-4 w-4" /> Filters
              </Button>
            </div>

            {/* Mobile filter drawer */}
            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <SheetContent side="bottom" className="h-[80vh] overflow-y-auto rounded-t-2xl">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <SearchFilters
                    filters={filters}
                    onFiltersChange={(f) => { setFilters(f); }}
                    onCategorySearch={(catQuery) => { setQuery(catQuery); performSearch(catQuery); setMobileFiltersOpen(false); }}
                    mobile
                  />
                  <Button className="w-full mt-4" onClick={() => setMobileFiltersOpen(false)}>
                    Apply Filters
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            {/* Results */}
            <div className="flex-1 min-w-0">
              {isLoading ? (
                <ProductGridSkeleton count={16} />
              ) : filteredProducts.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">
                      {totalResults ? `${totalResults.toLocaleString()} results` : `${filteredProducts.length} products`}
                      {filteredProducts.length !== products.length && (
                        <span className="text-sm font-normal text-muted-foreground ml-2">
                          ({filteredProducts.length} shown)
                        </span>
                      )}
                    </h2>
                    {totalPages > 1 && <span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</span>}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {filteredProducts.map((product) => <ProductCard key={product.num_iid} product={product} getDisplayTitle={getDisplayTitle} onClick={() => handleProductClick(product)} />)}
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
              ) : products.length > 0 ? (
                <div className="text-center py-20">
                  <p className="text-muted-foreground">No products match your filters</p>
                  <Button variant="link" onClick={() => setFilters(getDefaultFilters())} className="mt-2">Clear filters</Button>
                </div>
              ) : (
                <div className="text-center py-20"><p className="text-muted-foreground">No products found</p></div>
              )}
            </div>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  // Homepage - mobile-first like chinaonlinebd.com
  return (
    <div className="min-h-screen bg-background relative pb-20 md:pb-0" onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
      {isDragging && <DragOverlay />}
      {imageSearchDialog}
      <SiteHeader query={query} setQuery={setQuery} handleSearch={handleSearch} isLoading={isLoading} handleImageButtonClick={handleImageButtonClick} fileInputRef={fileInputRef} handleFileChange={handleFileChange} user={user} navigate={navigate} handleInstallClick={handleInstallClick} settings={settings} />

      {/* Main content */}
      <div className="flex gap-0 lg:gap-4">
        {/* Category Sidebar - desktop only */}
        <aside className="hidden lg:block w-52 shrink-0 pl-3 sm:pl-6 mt-4">
          <div className="bg-card rounded-xl border shadow-sm sticky top-[68px] max-h-[calc(100vh-5rem)] overflow-y-auto scrollbar-hide">
            <div className="flex items-center gap-2 px-4 pt-4 pb-2 border-b">
              <Zap className="h-4 w-4 text-primary fill-primary" />
              <h2 className="text-sm font-bold text-foreground">Top Category</h2>
            </div>
            <nav className="p-2 space-y-0.5">
              {topCategories.map((cat) => (
                <button
                  key={cat.name}
                  onClick={() => handleCategoryClick(cat.query)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors text-left group"
                >
                  <span className="text-base">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="capitalize text-xs font-medium block truncate">{cat.name}</span>
                    <span className="text-[10px] text-primary font-semibold">From ৳{cat.price}</span>
                  </div>
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main area */}
        <div className="flex-1 min-w-0 px-3 sm:px-6">
          {/* Hero Banner - desktop only */}
          <div className="hidden md:block mt-4 mb-5 rounded-2xl overflow-hidden header-gradient p-6 sm:p-8 md:p-10 relative">
            <div className="relative z-10">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-primary-foreground mb-2 leading-tight">
                {settings.hero_title || "Wholesale from China"}
              </h1>
              <p className="text-primary-foreground/80 text-sm sm:text-base mb-4 max-w-md">
                {settings.hero_subtitle || "Find products at factory prices"}
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-primary-foreground/20 text-primary-foreground border-0 cursor-pointer hover:bg-primary-foreground/30 backdrop-blur-sm" onClick={() => handleCategoryClick("trending products")}>{settings.hero_badge_1 || "🔥 Trending"}</Badge>
                <Badge className="bg-primary-foreground/20 text-primary-foreground border-0 cursor-pointer hover:bg-primary-foreground/30 backdrop-blur-sm" onClick={() => handleCategoryClick("new arrivals")}>{settings.hero_badge_2 || "✨ New Arrivals"}</Badge>
                <Badge className="bg-primary-foreground/20 text-primary-foreground border-0 cursor-pointer hover:bg-primary-foreground/30 backdrop-blur-sm" onClick={() => handleCategoryClick("best selling")}>{settings.hero_badge_3 || "⭐ Best Selling"}</Badge>
              </div>
            </div>
            <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-primary-foreground/10" />
            <div className="absolute -right-4 top-2 w-16 h-16 rounded-full bg-primary-foreground/5" />
          </div>

          {/* Shipping Service CTA */}
          <div className="shipping-cta rounded-xl px-4 py-2.5 md:px-5 md:py-3.5 mt-3 md:mt-0 mb-4 md:mb-6 flex items-center justify-between border border-primary/15">
            <div className="flex items-center gap-2 md:gap-3">
              <Truck className="h-4 w-4 md:h-5 md:w-5 text-primary shrink-0" />
              <span className="text-xs md:text-sm font-semibold text-foreground">Looking for Shipping Service</span>
            </div>
            <button
              onClick={() => navigate("/dashboard/shipments")}
              className="px-3 md:px-4 py-1 md:py-1.5 rounded-full bg-primary text-primary-foreground text-[10px] md:text-xs font-semibold hover:opacity-90 transition-opacity shrink-0"
            >
              Click Here
            </button>
          </div>

          {/* Mobile horizontal categories */}
          <section id="top-categories" className="lg:hidden mb-4 sticky top-[44px] md:top-[64px] z-40 bg-background pt-2 pb-3 -mx-3 px-3 sm:-mx-6 sm:px-6 border-b border-border/50">
            <div className="relative">
              <div ref={topCatScrollRef} className="flex overflow-x-auto gap-3 pb-1 scrollbar-hide snap-x">
                {topCategories.map((cat) => (
                  <button
                    key={cat.name}
                    onClick={() => handleCategoryClick(cat.query)}
                    className="flex flex-col items-center gap-1 shrink-0 snap-start group min-w-[64px]"
                  >
                    <div className="w-14 h-14 rounded-full border-2 border-primary/20 flex items-center justify-center bg-card transition-all group-hover:border-primary group-hover:scale-105">
                      <span className="text-lg">{cat.icon}</span>
                    </div>
                    <span className="text-[8px] text-primary font-semibold leading-tight">From {cat.price} ৳</span>
                    <span className="text-[8px] text-muted-foreground text-center leading-tight capitalize line-clamp-1 max-w-[64px]">{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Trending Products */}
          {!isTrendingLoaded ? (
            <section className="mb-10">
              <div className="flex items-center gap-2 mb-4">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-6 w-48" />
              </div>
              <div className="border-b border-primary/20 mb-4" />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)}
              </div>
            </section>
          ) : (
            <section className="mb-10 animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                <Heart className="h-5 w-5 text-primary fill-primary" />
                <h2 className="text-lg font-bold text-foreground">Trending Products</h2>
              </div>
              <div className="border-b border-primary/20 mb-4" />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {trendingProducts.map((product) => (
                  <Card
                    key={product.id}
                    className="overflow-hidden cursor-pointer hover:shadow-lg transition-all group border-0 shadow-sm"
                    onClick={() => handleTrendingClick(product.id)}
                  >
                    <div className="aspect-square overflow-hidden bg-muted relative">
                      <img
                        src={product.image}
                        alt={product.title}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                      />
                      <Badge className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm">
                        3% OFF
                      </Badge>
                      {/* Floating cart button */}
                      <button className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                        <ShoppingCart className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <CardContent className="p-3 space-y-1.5">
                      <h3 className="text-xs font-medium line-clamp-2 min-h-[2rem] leading-tight text-foreground">{product.title}</h3>
                      <div className="flex items-baseline gap-2">
                        <span className="text-base font-bold text-primary">৳{product.price}</span>
                        {product.oldPrice > product.price && (
                          <span className="text-[10px] text-muted-foreground line-through">৳{product.oldPrice}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">SOLD : {product.sold.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Category-wise product sections */}
          {categories.map((cat) => (
            <CategorySection
              key={cat.name}
              name={cat.name}
              icon={cat.icon}
              query={cat.query}
              cachedProducts={categoryProductsMap[cat.query] || null}
              onProductClick={handleProductClick}
              onViewAll={(q) => handleCategoryClick(q)}
            />
          ))}

          {/* Category loading skeletons */}
          {isTrendingLoaded && loadedCategoryCount < categories.length && (
            <section className="mb-10">
              <div className="flex items-center gap-2 mb-4">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-6 w-36" />
              </div>
              <div className="border-b border-primary/20 mb-4" />
              <div className="flex gap-3 overflow-hidden">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="shrink-0 w-[160px] sm:w-[180px]">
                    <Skeleton className="aspect-square w-full rounded-t-lg" />
                    <div className="p-2.5 space-y-1.5">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <Footer />
      <BottomNav />
    </div>
  );
};

// Shared components

const SiteHeader = ({ query, setQuery, handleSearch, isLoading, handleImageButtonClick, fileInputRef, handleFileChange, user, navigate, handleInstallClick, settings }: any) => (
  <header className="sticky top-0 z-50">
    {/* Mobile header */}
    <div className="md:hidden header-gradient">
      <div className="px-3 pt-1.5 pb-2">
        <form onSubmit={handleSearch} className="flex gap-1.5">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input type="text" placeholder={settings?.search_placeholder || "SEARCH FOR"} value={query} onChange={(e: any) => setQuery(e.target.value)} className="pl-9 h-9 bg-primary-foreground/95 border-0 rounded-lg text-xs shadow-sm" />
          </div>
          <Button type="button" variant="secondary" size="icon" title="Search by image" onClick={handleImageButtonClick} disabled={isLoading} className="shrink-0 h-9 w-9 rounded-lg bg-primary-foreground/20 border-0 text-primary-foreground hover:bg-primary-foreground/30">
            <Camera className="h-4 w-4" />
          </Button>
          <Button type="submit" disabled={isLoading} className="shrink-0 h-9 w-9 rounded-lg bg-primary-foreground text-primary hover:bg-primary-foreground/90">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>

    {/* Desktop header */}
    <div className="hidden md:block bg-card border-b shadow-sm">
      <div className="px-3 sm:px-6">
        <div className="flex items-center gap-4 h-16">
          <button onClick={() => { setQuery(""); window.location.href = "/"; }} className="shrink-0">
            <h1 className="text-xl font-bold text-primary">{settings?.site_name || "TradeOn Global"}</h1>
          </button>
          <form onSubmit={handleSearch} className="flex-1 flex gap-2 max-w-2xl">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type="text" placeholder={settings?.search_placeholder || "Search by product name..."} value={query} onChange={(e: any) => setQuery(e.target.value)} className="pl-10 h-10" />
            </div>
            <Button type="button" variant="outline" size="icon" title="Search by image" onClick={handleImageButtonClick} disabled={isLoading} className="shrink-0">
              <Camera className="h-4 w-4" />
            </Button>
            <Button type="submit" disabled={isLoading} className="shrink-0 px-6">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </form>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleInstallClick} title="Install App"><Download className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/wishlist")} title="Wishlist"><Heart className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/orders")} title="Orders"><ShoppingCart className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" onClick={() => navigate(user ? "/dashboard" : "/auth")} title={user ? "Dashboard" : "Sign In"}><User className="h-5 w-5" /></Button>
          </div>
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
