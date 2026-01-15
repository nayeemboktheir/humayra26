import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  MapPin,
  Package,
  Truck,
  Play,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  MessageCircle,
  Check,
  Box,
} from "lucide-react";

const productData = {
  id: 557059808553,
  source: "1688",
  title_cn: "52MM 2X 增倍镜 适用尼康口 佳能宾得",
  title_en: "52mm 2X Telephoto Conversion Lens",
  title_bn: "52mm 2X টেলিফটো কনভার্সন লেন্স",
  price: {
    currency: "CNY",
    base_price: 33,
    price_ranges: [
      { min_qty: 2, price: 33 },
      { min_qty: 10, price: 28 },
    ],
  },
  stock: 200,
  min_order: 1,
  unit: "piece",
  location: "Shenzhen, Guangdong, China",
  images: {
    thumbnail:
      "https://cbu01.alicdn.com/img/ibank/O1CN01sjfi3N214RugTXhg1_!!3392826931-0-cib.jpg",
    gallery: [
      "https://cbu01.alicdn.com/img/ibank/O1CN01sjfi3N214RugTXhg1_!!3392826931-0-cib.jpg",
      "https://cbu01.alicdn.com/img/ibank/4555649732_1179535926.jpg",
      "https://cbu01.alicdn.com/img/ibank/4555706669_1179535926.jpg",
      "https://cbu01.alicdn.com/img/ibank/4555715067_1179535926.jpg",
    ],
    description_images: [
      "https://img.alicdn.com/imgextra/i3/383221451/TB2hoqbbXXXXXXhXXXXXXXXXXXX-383221451.gif",
      "https://cbu01.alicdn.com/img/ibank/2015/008/218/2482812800_266332664.jpg",
      "https://cbu01.alicdn.com/img/ibank/2015/877/760/2482067778_266332664.jpg",
      "https://cbu01.alicdn.com/img/ibank/2015/800/399/2523993008_266332664.jpg",
    ],
  },
  video:
    "https://cloud.video.taobao.com/play/u/3392826931/p/1/e/6/t/1/246523666024.mp4",
  description: {
    short_bn:
      "এই 52mm 2X টেলিফটো লেন্সটি আপনার ক্যামেরার লেন্সের সামনে লাগিয়ে দূরের অবজেক্ট আরও কাছে এনে ছবি তুলতে সাহায্য করে।",
    features: [
      "2X অপটিক্যাল জুম",
      "52mm ফিল্টার থ্রেড সাপোর্ট",
      "ডিজিটাল ও ভিডিও ক্যামেরা compatible",
      "মাল্টি-কোটেড গ্লাস",
      "হালকা ও বহনযোগ্য ডিজাইন",
    ],
  },
  specifications: {
    lens_type: "Telephoto Conversion Lens",
    magnification: "2X",
    mount_thread: "52mm",
    front_diameter: "62mm",
    material: "Aluminum Alloy + Optical Glass",
    color: "Black",
    weight: "200g",
    use_case: "Photography, Videography",
    stabilization: "No",
  },
  package_includes: [
    "52mm Telephoto Lens",
    "Lens Pouch",
    "Front Lens Cap",
    "Rear Lens Cap",
  ],
  dropshipping: {
    supported: true,
    one_piece_delivery: true,
  },
  meta: {
    original_url: "https://detail.1688.com/offer/557059808553.html",
    total_sold: 24,
    platforms: ["AliExpress", "Amazon", "eBay", "Lazada", "Independent Store"],
  },
};

// CNY to BDT conversion rate
const CNY_TO_BDT = 17.5;

const convertToBDT = (cny: number) => Math.round(cny * CNY_TO_BDT);

export default function ProductDetail() {
  const [selectedImage, setSelectedImage] = useState(0);
  const [showVideo, setShowVideo] = useState(false);

  const allImages = productData.images.gallery;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <Badge variant="secondary" className="mb-2">
            {productData.source}
          </Badge>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            {productData.title_bn}
          </h1>
          <p className="text-muted-foreground">{productData.title_en}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Image Gallery */}
          <div className="space-y-4">
            {/* Main Image / Video */}
            <div className="relative aspect-square rounded-xl overflow-hidden bg-muted">
              {showVideo ? (
                <video
                  src={productData.video}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                />
              ) : (
                <img
                  src={allImages[selectedImage]}
                  alt={productData.title_en}
                  className="w-full h-full object-contain"
                />
              )}

              {/* Video Toggle Button */}
              {productData.video && !showVideo && (
                <button
                  onClick={() => setShowVideo(true)}
                  className="absolute bottom-4 right-4 bg-black/70 hover:bg-black/90 text-white px-4 py-2 rounded-full flex items-center gap-2 transition-colors"
                >
                  <Play className="w-4 h-4" />
                  ভিডিও দেখুন
                </button>
              )}

              {showVideo && (
                <button
                  onClick={() => setShowVideo(false)}
                  className="absolute top-4 right-4 bg-black/70 hover:bg-black/90 text-white px-4 py-2 rounded-full transition-colors"
                >
                  ছবি দেখুন
                </button>
              )}
            </div>

            {/* Thumbnail Gallery */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {allImages.map((img, idx) => (
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
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Right: Product Info */}
          <div className="space-y-6">
            {/* Price Section */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-6">
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-4xl font-bold text-primary">
                    ৳{convertToBDT(productData.price.base_price)}
                  </span>
                  <span className="text-lg text-muted-foreground">
                    / {productData.unit}
                  </span>
                </div>

                {/* Tiered Pricing */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    পাইকারি মূল্য:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {productData.price.price_ranges.map((range, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="px-3 py-1.5"
                      >
                        {range.min_qty}+ পিস: ৳{convertToBDT(range.price)}
                      </Badge>
                    ))}
                  </div>
                </div>

                <Separator className="my-4" />

                {/* Stock & Location */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <span>স্টক: {productData.stock} পিস</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="truncate">{productData.location}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Dropshipping Badge */}
            {productData.dropshipping.supported && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                <Truck className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-700">
                    ড্রপশিপিং সাপোর্টেড
                  </p>
                  {productData.dropshipping.one_piece_delivery && (
                    <p className="text-sm text-green-600">
                      ১ পিস থেকেও ডেলিভারি সম্ভব
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Description */}
            <div>
              <h3 className="text-lg font-semibold mb-3">বিবরণ</h3>
              <p className="text-muted-foreground leading-relaxed">
                {productData.description.short_bn}
              </p>
            </div>

            {/* Features */}
            <div>
              <h3 className="text-lg font-semibold mb-3">বৈশিষ্ট্য</h3>
              <ul className="space-y-2">
                {productData.description.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button size="lg" className="flex-1">
                <ShoppingCart className="w-5 h-5 mr-2" />
                অর্ডার করুন
              </Button>
              <Button size="lg" variant="outline" className="flex-1">
                <MessageCircle className="w-5 h-5 mr-2" />
                WhatsApp
              </Button>
            </div>

            {/* Sold Info */}
            <p className="text-sm text-muted-foreground text-center">
              মোট বিক্রি হয়েছে: {productData.meta.total_sold} পিস
            </p>
          </div>
        </div>

        {/* Specifications */}
        <Card className="mt-8">
          <CardContent className="p-6">
            <h3 className="text-xl font-semibold mb-4">স্পেসিফিকেশন</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(productData.specifications).map(([key, value]) => (
                <div
                  key={key}
                  className="flex justify-between items-center p-3 rounded-lg bg-muted/50"
                >
                  <span className="text-muted-foreground capitalize">
                    {key.replace(/_/g, " ")}
                  </span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Package Includes */}
        <Card className="mt-6">
          <CardContent className="p-6">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Box className="w-5 h-5" />
              প্যাকেজে যা থাকছে
            </h3>
            <div className="flex flex-wrap gap-2">
              {productData.package_includes.map((item, idx) => (
                <Badge key={idx} variant="secondary" className="px-3 py-1.5">
                  {item}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Platforms */}
        <Card className="mt-6">
          <CardContent className="p-6">
            <h3 className="text-xl font-semibold mb-4">
              যেসব প্ল্যাটফর্মে বিক্রি করা যায়
            </h3>
            <div className="flex flex-wrap gap-2">
              {productData.meta.platforms.map((platform, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="px-4 py-2 text-sm"
                >
                  {platform}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Description Images */}
        <Card className="mt-6">
          <CardContent className="p-6">
            <h3 className="text-xl font-semibold mb-4">পণ্যের বিস্তারিত ছবি</h3>
            <div className="space-y-4">
              {productData.images.description_images.map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt={`Description ${idx + 1}`}
                  className="w-full rounded-lg"
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Original Link */}
        <div className="mt-6 text-center">
          <a
            href={productData.meta.original_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-primary underline"
          >
            মূল পণ্য লিংক দেখুন (1688.com)
          </a>
        </div>
      </div>
    </div>
  );
}
