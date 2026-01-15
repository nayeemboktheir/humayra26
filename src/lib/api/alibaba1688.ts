import { supabase } from '@/integrations/supabase/client';

export interface Product1688 {
  num_iid: number;
  title: string;
  pic_url: string;
  price: number;
  promotion_price?: number;
  sales?: number;
  detail_url: string;
  max_price?: number;
  min_price?: number;
  tag_percent?: string;
}

export interface ProductDetail1688 {
  num_iid: number;
  title: string;
  desc: string;
  price: number;
  orginal_price?: number;
  pic_url: string;
  item_imgs: { url: string }[];
  desc_img?: string[];
  location: string;
  num: string;
  min_num: number;
  video?: string;
  props: { name: string; value: string }[];
  priceRange?: number[][];
  seller_info: {
    nick: string;
    shop_name: string;
    item_score: string;
    delivery_score: string;
    composite_score: string;
  };
  total_sold?: number;
  item_weight?: number;
}

type ApiResponse<T = any> = {
  success: boolean;
  error?: string;
  data?: T;
};

// Translation helper
async function translateTexts(texts: string[]): Promise<string[]> {
  try {
    const { data, error } = await supabase.functions.invoke('translate-text', {
      body: { texts },
    });
    
    if (error || !data?.translations) {
      console.error('Translation error:', error);
      return texts; // Return original texts on error
    }
    
    return data.translations;
  } catch (error) {
    console.error('Translation failed:', error);
    return texts; // Return original texts on error
  }
}

export const alibaba1688Api = {
  // Search products on 1688
  async search(query: string, page = 1, pageSize = 40): Promise<ApiResponse<{ items: Product1688[]; total: number }>> {
    try {
      const { data, error } = await supabase.functions.invoke('alibaba-1688-search', {
        body: { query, page, pageSize },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data?.success) {
        return { success: false, error: data?.error || 'Search failed' };
      }

      // Parse the response structure from ATP Host API
      const items = data.data?.item?.items?.item || [];
      const total = data.data?.item?.items?.total_results || 0;

      // Extract titles for translation
      const titles = items.map((item: any) => item.title);
      const translatedTitles = await translateTexts(titles);

      return {
        success: true,
        data: {
          items: items.map((item: any, index: number) => ({
            num_iid: item.num_iid,
            title: translatedTitles[index] || item.title,
            pic_url: item.pic_url,
            price: item.price,
            promotion_price: item.promotion_price,
            sales: item.sales,
            detail_url: item.detail_url,
            max_price: item.max_price,
            min_price: item.min_price,
            tag_percent: item.tag_percent,
          })),
          total,
        },
      };
    } catch (error) {
      console.error('Error searching 1688:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Search failed' };
    }
  },

  // Get product details
  async getProduct(numIid: number): Promise<ApiResponse<ProductDetail1688>> {
    try {
      const { data, error } = await supabase.functions.invoke('alibaba-1688-item-get', {
        body: { numIid },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data?.success) {
        return { success: false, error: data?.error || 'Failed to get product' };
      }

      const item = data.data?.item;
      if (!item) {
        return { success: false, error: 'Product not found' };
      }

      // Translate title
      const translatedTitles = await translateTexts([item.title]);

      return {
        success: true,
        data: {
          num_iid: item.num_iid,
          title: translatedTitles[0] || item.title,
          desc: item.desc,
          price: item.price,
          orginal_price: item.orginal_price,
          pic_url: item.pic_url,
          item_imgs: item.item_imgs || [],
          desc_img: item.desc_img,
          location: item.location,
          num: item.num,
          min_num: item.min_num,
          video: item.video,
          props: item.props || [],
          priceRange: item.priceRange,
          seller_info: item.seller_info || {},
          total_sold: item.total_sold,
          item_weight: item.item_weight,
        },
      };
    } catch (error) {
      console.error('Error getting 1688 product:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get product' };
    }
  },
};
