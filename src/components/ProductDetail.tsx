import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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

// Static product data from 1688 API response
const productData = {
  item: {
    num_iid: 557059808553,
    title: "52MM 2X 增倍镜 适用尼康口 佳能宾得  52MM 2倍增距镜头 18-55",
    desc_short: "",
    price: 33,
    orginal_price: 33,
    num: "200",
    min_num: 1,
    detail_url: "https://detail.1688.com/offer/557059808553.html",
    pic_url: "https://cbu01.alicdn.com/img/ibank/O1CN01sjfi3N214RugTXhg1_!!3392826931-0-cib.jpg",
    item_imgs: [
      { url: "https://cbu01.alicdn.com/img/ibank/O1CN01sjfi3N214RugTXhg1_!!3392826931-0-cib.jpg" },
      { url: "https://cbu01.alicdn.com/img/ibank/4555649732_1179535926.jpg" },
      { url: "https://cbu01.alicdn.com/img/ibank/4555706669_1179535926.jpg" },
      { url: "https://cbu01.alicdn.com/img/ibank/4555715067_1179535926.jpg" },
      { url: "https://cbu01.alicdn.com/img/ibank/O1CN01FYKHG6214RpWmJRXg_!!3392826931-0-cib.jpg" }
    ],
    desc_img: [
      "https://img.alicdn.com/imgextra/i3/383221451/TB2hoqbbXXXXXXhXXXXXXXXXXXX-383221451.gif",
      "https://cbu01.alicdn.com/img/ibank/2015/008/218/2482812800_266332664.jpg",
      "https://cbu01.alicdn.com/img/ibank/2015/877/760/2482067778_266332664.jpg",
      "https://cbu01.alicdn.com/img/ibank/2015/800/399/2523993008_266332664.jpg"
    ],
    item_weight: 0.22,
    location: "广东省深圳市",
    video: "https://cloud.video.taobao.com/play/u/3392826931/p/1/e/6/t/1/246523666024.mp4",
    props: [
      { name: "品牌", value: "中性" },
      { name: "型号", value: "52MM 增倍镜头" },
      { name: "货号", value: "52MM 增倍镜头" },
      { name: "产地", value: "CN" },
      { name: "货源类别", value: "现货" },
      { name: "镜头品种", value: "附加镜头" },
      { name: "镜头类型", value: "增倍镜" },
      { name: "类型", value: "光学镜头" },
      { name: "滤镜口径", value: "62mm" },
      { name: "镜头结构", value: "2片1组" },
      { name: "镜头体积", value: "8.7 *7 *8.5厘米" },
      { name: "镜头防抖类型", value: "不带防抖" },
      { name: "镜头用途", value: "增距镜" },
      { name: "颜色", value: "黑色" },
      { name: "重量", value: "200G" },
      { name: "尺寸（直径 x 长度）", value: "8.7 *7 *8.5厘米" },
      { name: "是否支持一件代发", value: "支持" },
      { name: "售后服务", value: "店铺三包" }
    ],
    total_sold: 24,
    seller_info: {
      nick: "_sopid@BBBLMcb845f9wYO9QFJpPnZBA",
      item_score: "5.0",
      score_p: "5.0",
      delivery_score: "3.7",
      composite_score: "4.0"
    },
    batch_price: "33.0",
    unit: "件",
    is_support_mix: true,
    mix_amount: 100,
    priceRange: [
      [2, 33],
      [10, 28]
    ] as [number, number][],
    volume: "180.0000000000"
  }
};

// CNY to BDT conversion rate
const CNY_TO_BDT = 17.5;

const convertToBDT = (cny: number) => Math.round(cny * CNY_TO_BDT);

// Property name translations
const propNameTranslations: Record<string, string> = {
  "品牌": "ব্র্যান্ড",
  "型号": "মডেল",
  "货号": "আইটেম নং",
  "产地": "উৎপাদন স্থান",
  "货源类别": "স্টক টাইপ",
  "镜头品种": "লেন্স ধরন",
  "镜头类型": "লেন্স টাইপ",
  "类型": "ক্যাটাগরি",
  "滤镜口径": "ফিল্টার সাইজ",
  "镜头结构": "লেন্স গঠন",
  "镜头体积": "আকার",
  "镜头防抖类型": "স্ট্যাবিলাইজেশন",
  "镜头用途": "ব্যবহার",
  "颜色": "রঙ",
  "重量": "ওজন",
  "尺寸（直径 x 长度）": "মাপ",
  "是否支持一件代发": "১ পিস ডেলিভারি",
  "售后服务": "ওয়ারেন্টি"
};

// Property value translations
const propValueTranslations: Record<string, string> = {
  "中性": "জেনেরিক",
  "CN": "চীন",
  "现货": "রেডি স্টক",
  "附加镜头": "অ্যাড-অন লেন্স",
  "增倍镜": "টেলি কনভার্টার",
  "光学镜头": "অপটিক্যাল লেন্স",
  "不带防抖": "নেই",
  "增距镜": "জুম বাড়ানো",
  "黑色": "কালো",
  "支持": "সাপোর্ট করে",
  "店铺三包": "শপ ওয়ারেন্টি"
};

export default function ProductDetail() {
  const [selectedImage, setSelectedImage] = useState(0);
  const [showVideo, setShowVideo] = useState(false);

  const { item } = productData;
  const images = item.item_imgs.map((img) => img.url);

  // Filter important props for display
  const displayProps = item.props.filter((prop) =>
    ["型号", "镜头类型", "滤镜口径", "颜色", "重量", "镜头用途", "是否支持一件代发", "货源类别"].includes(prop.name)
  );

  const getPriceRanges = () => {
    return item.priceRange.map(([minQty, price]) => ({
      minQty,
      priceCNY: price,
      priceBDT: convertToBDT(price)
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Image Gallery */}
          <div className="space-y-4">
            {/* Main Image / Video */}
            <div className="relative aspect-square rounded-xl overflow-hidden bg-muted border">
              {showVideo ? (
                <video
                  src={item.video}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                />
              ) : (
                <img
                  src={images[selectedImage]}
                  alt={item.title}
                  className="w-full h-full object-contain"
                />
              )}

              {/* Video Toggle Button */}
              {item.video && (
                <button
                  onClick={() => setShowVideo(!showVideo)}
                  className="absolute bottom-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-full flex items-center gap-2 shadow-lg hover:bg-primary/90 transition-all"
                >
                  <Play className="w-4 h-4" />
                  {showVideo ? "ছবি দেখুন" : "ভিডিও দেখুন"}
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
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
              {item.video && (
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
                <Badge variant="outline">বিক্রি: {item.total_sold}</Badge>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                52mm 2X টেলিফটো কনভার্সন লেন্স
              </h1>
              <p className="text-muted-foreground">
                নিকন, ক্যানন, পেন্টাক্স 18-55mm লেন্স সাপোর্ট
              </p>
            </div>

            {/* Price Section */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-4xl font-bold text-primary">
                    ৳{convertToBDT(item.price)}
                  </span>
                  <span className="text-lg text-muted-foreground">
                    (¥{item.price})
                  </span>
                </div>

                {/* Tiered Pricing */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    পরিমাণ অনুযায়ী দাম:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {getPriceRanges().map((range, idx) => (
                      <div
                        key={idx}
                        className="bg-background rounded-lg p-3 border text-center"
                      >
                        <div className="text-xs text-muted-foreground mb-1">
                          ≥{range.minQty} {item.unit}
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
                  <div className="text-xs text-muted-foreground">স্টক</div>
                  <div className="font-medium">{item.num} {item.unit}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Box className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">ন্যূনতম অর্ডার</div>
                  <div className="font-medium">{item.min_num} {item.unit}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Weight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">ওজন</div>
                  <div className="font-medium">{item.item_weight} kg</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <MapPin className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">লোকেশন</div>
                  <div className="font-medium text-sm">শেনজেন, চীন</div>
                </div>
              </div>
            </div>

            {/* Dropshipping Badge */}
            {item.is_support_mix && (
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                <Truck className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-medium text-green-700 dark:text-green-400">
                    ড্রপশিপিং সাপোর্টেড
                  </p>
                  <p className="text-sm text-green-600 dark:text-green-500">
                    ১ পিস থেকেও ডেলিভারি সম্ভব
                  </p>
                </div>
              </div>
            )}

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

            {/* Original Link */}
            <a
              href={item.detail_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              1688 এ দেখুন
            </a>
          </div>
        </div>

        <Separator className="my-8" />

        {/* Specifications & Seller Info */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Specifications */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-4">পণ্যের বিবরণ</h2>
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {displayProps.map((prop, index) => (
                      <div key={index} className="flex py-3 px-4">
                        <span className="w-1/3 text-muted-foreground text-sm">
                          {propNameTranslations[prop.name] || prop.name}
                        </span>
                        <span className="w-2/3 font-medium text-sm">
                          {propValueTranslations[prop.value] || prop.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Description Images */}
            <div>
              <h2 className="text-xl font-bold mb-4">পণ্যের ছবি</h2>
              <div className="space-y-4">
                {item.desc_img.map((img, index) => (
                  <img
                    key={index}
                    src={img}
                    alt={`Description ${index + 1}`}
                    className="w-full rounded-lg border"
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Seller Info */}
          <div>
            <h2 className="text-xl font-bold mb-4">সেলার তথ্য</h2>
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-xl font-bold text-primary">S</span>
                  </div>
                  <div>
                    <div className="font-medium">1688 সেলার</div>
                    <div className="text-sm text-muted-foreground">শেনজেন, চীন</div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">পণ্যের রেটিং</span>
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-medium">{item.seller_info.item_score}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">সার্ভিস রেটিং</span>
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-medium">{item.seller_info.score_p}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">ডেলিভারি রেটিং</span>
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-medium">{item.seller_info.delivery_score}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">সামগ্রিক রেটিং</span>
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-medium">{item.seller_info.composite_score}</span>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{item.total_sold}</div>
                  <div className="text-sm text-muted-foreground">মোট বিক্রি</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
