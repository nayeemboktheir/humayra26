import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, ArrowLeft } from "lucide-react";
import {
  MapPin,
  Package,
  Truck,
  Play,
  ShoppingCart,
  MessageCircle,
  Box,
  Weight,
  Star,
  ExternalLink,
} from "lucide-react";
import { ProductDetail1688 } from "@/lib/api/alibaba1688";

// CNY to BDT conversion rate
const CNY_TO_BDT = 17.5;

const convertToBDT = (cny: number) => Math.round(cny * CNY_TO_BDT);

// Property name translations (Chinese to English)
const propNameTranslations: Record<string, string> = {
  "品牌": "Brand",
  "型号": "Model",
  "货号": "Item No.",
  "产地": "Origin",
  "货源类别": "Stock Type",
  "镜头品种": "Lens Type",
  "镜头类型": "Lens Category",
  "类型": "Category",
  "滤镜口径": "Filter Size",
  "镜头结构": "Lens Structure",
  "镜头体积": "Dimensions",
  "镜头防抖类型": "Stabilization",
  "镜头用途": "Usage",
  "颜色": "Color",
  "重量": "Weight",
  "尺寸（直径 x 长度）": "Size",
  "是否支持一件代发": "Dropshipping",
  "售后服务": "Warranty",
  "材质": "Material",
  "适用场景": "Application",
  "适用人群": "Suitable For",
  "风格": "Style",
  "图案": "Pattern",
  "功能": "Function",
  "包装": "Packaging",
  "规格": "Specification",
};

// Property value translations (Chinese to English)
const propValueTranslations: Record<string, string> = {
  "中性": "Generic",
  "CN": "China",
  "现货": "In Stock",
  "附加镜头": "Add-on Lens",
  "增倍镜": "Teleconverter",
  "光学镜头": "Optical Lens",
  "不带防抖": "No Stabilization",
  "增距镜": "Telephoto Extender",
  "黑色": "Black",
  "白色": "White",
  "红色": "Red",
  "蓝色": "Blue",
  "绿色": "Green",
  "支持": "Supported",
  "不支持": "Not Supported",
  "店铺三包": "Shop Warranty",
  "是": "Yes",
  "否": "No",
};

// Location translations
const locationTranslations: Record<string, string> = {
  "广东省深圳市": "Shenzhen, China",
  "广东省广州市": "Guangzhou, China",
  "浙江省杭州市": "Hangzhou, China",
  "浙江省义乌市": "Yiwu, China",
  "上海市": "Shanghai, China",
  "北京市": "Beijing, China",
  "江苏省苏州市": "Suzhou, China",
  "福建省厦门市": "Xiamen, China",
};

const translateLocation = (location: string): string => {
  if (locationTranslations[location]) {
    return locationTranslations[location];
  }
  // Default: just append "China"
  if (location.includes("省") || location.includes("市")) {
    return "China";
  }
  return location;
};

const translatePropValue = (value: string): string => {
  return propValueTranslations[value] || value;
};

interface ProductDetailProps {
  product?: ProductDetail1688;
  isLoading?: boolean;
  onBack?: () => void;
}

export default function ProductDetail({ product, isLoading, onBack }: ProductDetailProps) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [showVideo, setShowVideo] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading product details...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">No product selected</p>
      </div>
    );
  }

  const images = product.item_imgs?.map((img) => img.url) || [product.pic_url];

  // Filter important props for display
  const displayProps = product.props?.slice(0, 10) || [];

  const getPriceRanges = () => {
    if (!product.priceRange || product.priceRange.length === 0) {
      return [{ minQty: 1, priceCNY: product.price, priceBDT: convertToBDT(product.price) }];
    }
    return product.priceRange.map(([minQty, price]) => ({
      minQty,
      priceCNY: price,
      priceBDT: convertToBDT(price)
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Back Button */}
        {onBack && (
          <Button variant="ghost" onClick={onBack} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Search
          </Button>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Image Gallery */}
          <div className="space-y-4">
            {/* Main Image / Video */}
            <div className="relative aspect-square rounded-xl overflow-hidden bg-muted border">
              {showVideo && product.video ? (
                <video
                  src={product.video}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                />
              ) : (
                <img
                  src={images[selectedImage]}
                  alt={product.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/placeholder.svg';
                  }}
                />
              )}

              {/* Video Toggle Button */}
              {product.video && (
                <button
                  onClick={() => setShowVideo(!showVideo)}
                  className="absolute bottom-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-full flex items-center gap-2 shadow-lg hover:bg-primary/90 transition-all"
                >
                  <Play className="w-4 h-4" />
                  {showVideo ? "View Images" : "Watch Video"}
                </button>
              )}
            </div>

            {/* Thumbnail Gallery */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSelectedImage(idx);
                    setShowVideo(false);
                  }}
                  className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                    selectedImage === idx && !showVideo
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <img
                    src={img}
                    alt={`Gallery ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = '/placeholder.svg';
                    }}
                  />
                </button>
              ))}
              {product.video && (
                <button
                  onClick={() => setShowVideo(true)}
                  className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all bg-muted flex items-center justify-center ${
                    showVideo
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <Play className="h-8 w-8 text-primary" />
                </button>
              )}
            </div>
          </div>

          {/* Right: Product Info */}
          <div className="space-y-6">
            {/* Title */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                  1688
                </Badge>
                {product.total_sold && (
                  <Badge variant="outline">Sold: {product.total_sold}</Badge>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                {product.title}
              </h1>
            </div>

            {/* Price Section */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-4xl font-bold text-primary">
                    ৳{convertToBDT(product.price)}
                  </span>
                  <span className="text-lg text-muted-foreground">
                    (¥{product.price})
                  </span>
                </div>

                {/* Tiered Pricing */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Price by Quantity:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {getPriceRanges().map((range, idx) => (
                      <div
                        key={idx}
                        className="bg-background rounded-lg p-3 border text-center"
                      >
                        <div className="text-xs text-muted-foreground mb-1">
                          ≥{range.minQty} pcs
                        </div>
                        <div className="font-bold text-primary">
                          ৳{range.priceBDT}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          ¥{range.priceCNY}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Info Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Package className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">Stock</div>
                  <div className="font-medium">{product.num} pcs</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Box className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">Min Order</div>
                  <div className="font-medium">{product.min_num} pcs</div>
                </div>
              </div>
              {product.item_weight && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Weight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground">Weight</div>
                    <div className="font-medium">{product.item_weight} kg</div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <MapPin className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">Location</div>
                  <div className="font-medium text-sm">{translateLocation(product.location)}</div>
                </div>
              </div>
            </div>

            {/* Dropshipping Badge */}
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
              <Truck className="h-5 w-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-700 dark:text-green-400">
                  Dropshipping Supported
                </p>
                <p className="text-sm text-green-600 dark:text-green-500">
                  Single piece delivery available
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button size="lg" className="flex-1">
                <ShoppingCart className="w-5 h-5 mr-2" />
                Order Now
              </Button>
              <Button size="lg" variant="outline" className="flex-1">
                <MessageCircle className="w-5 h-5 mr-2" />
                WhatsApp
              </Button>
            </div>

            {/* Original Link */}
            <a
              href={`https://detail.1688.com/offer/${product.num_iid}.html`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              View on 1688
            </a>
          </div>
        </div>

        <Separator className="my-8" />

        {/* Specifications & Seller Info */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Specifications */}
          <div className="lg:col-span-2 space-y-6">
            {displayProps.length > 0 && (
              <div>
                <h2 className="text-xl font-bold mb-4">Product Specifications</h2>
                <Card>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {displayProps.map((prop, index) => (
                        <div key={index} className="flex py-3 px-4">
                          <span className="w-1/3 text-muted-foreground text-sm">
                            {propNameTranslations[prop.name] || prop.name}
                          </span>
                          <span className="w-2/3 font-medium text-sm">
                            {translatePropValue(prop.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Description Images */}
            {product.desc_img && product.desc_img.length > 0 && (
              <div>
                <h2 className="text-xl font-bold mb-4">Product Images</h2>
                <div className="space-y-4">
                  {product.desc_img.map((img, index) => (
                    <img
                      key={index}
                      src={img}
                      alt={`Product detail ${index + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full rounded-lg border"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Seller Info */}
          <div>
            <h2 className="text-xl font-bold mb-4">Seller Information</h2>
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-xl font-bold text-primary">S</span>
                  </div>
                  <div>
                    <div className="font-medium">1688 Seller</div>
                    <div className="text-sm text-muted-foreground">{translateLocation(product.location)}</div>
                  </div>
                </div>

                <Separator />

                {product.seller_info && (
                  <div className="space-y-3">
                    {product.seller_info.item_score && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Product Rating</span>
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          <span className="font-medium">{product.seller_info.item_score}</span>
                        </div>
                      </div>
                    )}
                    {product.seller_info.delivery_score && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Delivery Rating</span>
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          <span className="font-medium">{product.seller_info.delivery_score}</span>
                        </div>
                      </div>
                    )}
                    {product.seller_info.composite_score && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Overall Rating</span>
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          <span className="font-medium">{product.seller_info.composite_score}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
