import { useEffect } from "react";
import { useAppSettings } from "@/hooks/useAppSettings";

export default function TrackingScripts() {
  const { settings, loading } = useAppSettings();

  useEffect(() => {
    if (loading) return;

    // Meta Pixel
    if (settings.meta_pixel_enabled === "true" && settings.meta_pixel_id) {
      const id = settings.meta_pixel_id;
      if (!document.getElementById("meta-pixel-script")) {
        const script = document.createElement("script");
        script.id = "meta-pixel-script";
        script.innerHTML = `
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${id}');
          fbq('track', 'PageView');
        `;
        document.head.appendChild(script);

        const noscript = document.createElement("noscript");
        noscript.id = "meta-pixel-noscript";
        noscript.innerHTML = `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1"/>`;
        document.body.appendChild(noscript);
      }
    }

    // TikTok Pixel
    if (settings.tiktok_pixel_enabled === "true" && settings.tiktok_pixel_id) {
      const id = settings.tiktok_pixel_id;
      if (!document.getElementById("tiktok-pixel-script")) {
        const script = document.createElement("script");
        script.id = "tiktok-pixel-script";
        script.innerHTML = `
          !function (w, d, t) {
            w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var i=document.createElement("script");i.type="text/javascript",i.async=!0,i.src=r+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(i,a)};
            ttq.load('${id}');
            ttq.page();
          }(window, document, 'ttq');
        `;
        document.head.appendChild(script);
      }
    }

    // Google Analytics
    if (settings.google_analytics_enabled === "true" && settings.google_analytics_id) {
      const id = settings.google_analytics_id;
      if (!document.getElementById("ga-script")) {
        const gtagScript = document.createElement("script");
        gtagScript.id = "ga-script";
        gtagScript.async = true;
        gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
        document.head.appendChild(gtagScript);

        const inlineScript = document.createElement("script");
        inlineScript.id = "ga-inline-script";
        inlineScript.innerHTML = `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${id}');
        `;
        document.head.appendChild(inlineScript);
      }
    }
  }, [loading, settings]);

  return null;
}
