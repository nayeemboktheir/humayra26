import { useState } from "react";
import { SlidersHorizontal, ChevronUp, ChevronDown, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

const PRICE_RANGES = [
  { label: "৳0-৳99", min: 0, max: 99 },
  { label: "৳100-৳499", min: 100, max: 499 },
  { label: "৳499-৳999", min: 499, max: 999 },
  { label: "৳1000-৳2999", min: 1000, max: 2999 },
  { label: "৳3000-৳4999", min: 3000, max: 4999 },
  { label: "৳5000-৳9999", min: 5000, max: 9999 },
  { label: "৳10000+", min: 10000, max: Infinity },
];

const CATEGORIES = [
  { name: "Shoes", query: "shoes" },
  { name: "Bag", query: "bag" },
  { name: "Jewelry", query: "jewelry" },
  { name: "Beauty & Personal Care", query: "beauty products" },
  { name: "Men's Clothing", query: "men clothing" },
  { name: "Women's Clothing", query: "women clothing" },
  { name: "Baby Items", query: "baby items" },
  { name: "Eyewear", query: "eyewear sunglasses" },
  { name: "Phone Accessories", query: "phone accessories" },
  { name: "Sports & Fitness", query: "sports fitness" },
  { name: "Electronics & Gadgets", query: "electronics gadgets" },
  { name: "Kitchen Gadgets", query: "kitchen gadgets" },
  { name: "Tools & Home", query: "tools home improvement" },
  { name: "Watches", query: "watches" },
];

const RATING_OPTIONS = [
  { label: "5+", min: 5, stars: 5 },
  { label: "4-4.99", min: 4, stars: 4 },
  { label: "3-3.99", min: 3, stars: 3 },
];

const SORT_OPTIONS = [
  { label: "Best Match", value: "best_match" },
  { label: "Price Low-High", value: "price_asc" },
  { label: "Price High-Low", value: "price_desc" },
  { label: "Most Sold", value: "most_sold" },
];

export interface SearchFilterValues {
  priceRange: { min: number; max: number } | null;
  customPriceMin: string;
  customPriceMax: string;
  selectedCategories: string[];
  minRating: number | null;
  sortBy: string;
}

interface SearchFiltersProps {
  filters: SearchFilterValues;
  onFiltersChange: (filters: SearchFilterValues) => void;
  onCategorySearch?: (query: string) => void;
}

export const getDefaultFilters = (): SearchFilterValues => ({
  priceRange: null,
  customPriceMin: "",
  customPriceMax: "",
  selectedCategories: [],
  minRating: null,
  sortBy: "best_match",
});

export default function SearchFilters({ filters, onFiltersChange, onCategorySearch }: SearchFiltersProps) {
  const [priceOpen, setPriceOpen] = useState(true);
  const [catOpen, setCatOpen] = useState(true);
  const [ratingOpen, setRatingOpen] = useState(true);
  const [showMoreCats, setShowMoreCats] = useState(false);

  const update = (partial: Partial<SearchFilterValues>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  const handlePriceRangeClick = (range: typeof PRICE_RANGES[0]) => {
    const isActive = filters.priceRange?.min === range.min && filters.priceRange?.max === range.max;
    update({ priceRange: isActive ? null : { min: range.min, max: range.max }, customPriceMin: "", customPriceMax: "" });
  };

  const handleCustomPriceApply = () => {
    const min = filters.customPriceMin ? parseInt(filters.customPriceMin) : 0;
    const max = filters.customPriceMax ? parseInt(filters.customPriceMax) : Infinity;
    if (min >= 0) {
      update({ priceRange: { min, max }, customPriceMin: filters.customPriceMin, customPriceMax: filters.customPriceMax });
    }
  };

  const handleCategoryToggle = (catQuery: string) => {
    const selected = filters.selectedCategories.includes(catQuery)
      ? filters.selectedCategories.filter(c => c !== catQuery)
      : [...filters.selectedCategories, catQuery];
    update({ selectedCategories: selected });
    if (!filters.selectedCategories.includes(catQuery) && onCategorySearch) {
      onCategorySearch(catQuery);
    }
  };

  const handleRatingClick = (min: number) => {
    update({ minRating: filters.minRating === min ? null : min });
  };

  const visibleCats = showMoreCats ? CATEGORIES : CATEGORIES.slice(0, 5);

  return (
    <aside className="hidden lg:block w-56 shrink-0">
      <div className="bg-card rounded-xl border p-4 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-hide">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <SlidersHorizontal className="h-5 w-5 text-foreground" />
          <h2 className="text-lg font-bold">Filters</h2>
        </div>

        {/* Sort */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => update({ sortBy: opt.value })}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                filters.sortBy === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <Separator className="mb-4" />

        {/* Price (BDT) */}
        <div className="mb-4">
          <button onClick={() => setPriceOpen(!priceOpen)} className="flex items-center justify-between w-full text-sm font-semibold mb-2">
            Price (BDT)
            {priceOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {priceOpen && (
            <div className="space-y-1.5">
              {/* Custom price */}
              <div className="flex items-center gap-1.5 mb-2">
                <Input
                  type="number"
                  placeholder="Min"
                  value={filters.customPriceMin}
                  onChange={(e) => update({ customPriceMin: e.target.value })}
                  className="h-7 text-xs px-2"
                />
                <Input
                  type="number"
                  placeholder="Max"
                  value={filters.customPriceMax}
                  onChange={(e) => update({ customPriceMax: e.target.value })}
                  className="h-7 text-xs px-2"
                />
                <Button size="sm" className="h-7 text-xs px-3" onClick={handleCustomPriceApply}>
                  Apply
                </Button>
              </div>
              {PRICE_RANGES.map(range => {
                const isActive = filters.priceRange?.min === range.min && filters.priceRange?.max === range.max;
                return (
                  <label key={range.label} className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <Checkbox checked={isActive} onCheckedChange={() => handlePriceRangeClick(range)} />
                    <span>{range.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <Separator className="mb-4" />

        {/* Categories */}
        <div className="mb-4">
          <button onClick={() => setCatOpen(!catOpen)} className="flex items-center justify-between w-full text-sm font-semibold mb-2">
            Categories
            {catOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {catOpen && (
            <div className="space-y-1.5">
              {visibleCats.map(cat => {
                const isActive = filters.selectedCategories.includes(cat.query);
                return (
                  <label key={cat.query} className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <Checkbox checked={isActive} onCheckedChange={() => handleCategoryToggle(cat.query)} />
                    <span className="capitalize">{cat.name}</span>
                  </label>
                );
              })}
              {CATEGORIES.length > 5 && (
                <button
                  onClick={() => setShowMoreCats(!showMoreCats)}
                  className="text-xs text-primary hover:underline mt-1"
                >
                  {showMoreCats ? "Show Less" : "Show More"}
                </button>
              )}
            </div>
          )}
        </div>

        <Separator className="mb-4" />

        {/* Ratings */}
        <div className="mb-2">
          <button onClick={() => setRatingOpen(!ratingOpen)} className="flex items-center justify-between w-full text-sm font-semibold mb-2">
            Ratings
            {ratingOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {ratingOpen && (
            <div className="space-y-1.5">
              {RATING_OPTIONS.map(opt => {
                const isActive = filters.minRating === opt.min;
                return (
                  <label key={opt.label} className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <Checkbox checked={isActive} onCheckedChange={() => handleRatingClick(opt.min)} />
                    <span className="flex items-center gap-0.5">
                      {[...Array(opt.stars)].map((_, i) => (
                        <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
                      ))}
                      {opt.stars < 5 && [...Array(5 - opt.stars)].map((_, i) => (
                        <Star key={i} className="h-3 w-3 text-muted-foreground/30" />
                      ))}
                    </span>
                    <span className="text-xs">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Clear All */}
        {(filters.priceRange || filters.selectedCategories.length > 0 || filters.minRating || filters.sortBy !== "best_match") && (
          <>
            <Separator className="my-3" />
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-destructive hover:text-destructive"
              onClick={() => onFiltersChange(getDefaultFilters())}
            >
              Clear All Filters
            </Button>
          </>
        )}
      </div>
    </aside>
  );
}

// Utility to apply filters to product list client-side
export function applyFilters<T extends { price: number; sales?: number }>(
  products: T[],
  filters: SearchFilterValues,
  convertPrice: (price: number) => number,
  preserveOrder = false,
): T[] {
  let filtered = [...products];

  // Price filter
  if (filters.priceRange) {
    filtered = filtered.filter(p => {
      const bdtPrice = convertPrice(p.price);
      return bdtPrice >= filters.priceRange!.min && bdtPrice <= filters.priceRange!.max;
    });
  }

  // Sort — skip for image search (preserveOrder=true) when using default "best_match"
  if (preserveOrder && filters.sortBy === "best_match") {
    // Keep OTAPI's native visual similarity order
    return filtered;
  }

  switch (filters.sortBy) {
    case "price_asc":
      filtered.sort((a, b) => a.price - b.price);
      break;
    case "price_desc":
      filtered.sort((a, b) => b.price - a.price);
      break;
    case "most_sold":
      filtered.sort((a, b) => (b.sales || 0) - (a.sales || 0));
      break;
    case "best_match":
    default:
      filtered.sort((a, b) => {
        const scoreA = (a.sales || 0) >= 2000 ? 2 : (a.sales || 0) >= 500 ? 1 : 0;
        const scoreB = (b.sales || 0) >= 2000 ? 2 : (b.sales || 0) >= 500 ? 1 : 0;
        return scoreB - scoreA;
      });
      break;
  }

  return filtered;
}
