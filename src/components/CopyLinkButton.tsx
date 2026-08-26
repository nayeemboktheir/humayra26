import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CopyLinkButtonProps {
  className?: string;
  variant?: "ghost" | "outline";
  size?: "icon" | "sm";
  label?: string;
}

const CopyLinkButton = ({ className, variant = "ghost", size = "icon", label }: CopyLinkButtonProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const url = window.location.href;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const el = document.createElement("textarea");
        el.value = url;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopied(true);
      toast({ title: "Link copied", description: "Share it anywhere you like." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy link", description: url, variant: "destructive" });
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleCopy}
      title="Copy link"
      aria-label="Copy link"
      className={cn(size === "icon" ? "" : "gap-1.5", className)}
    >
      {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
      {label && <span className="hidden sm:inline">{copied ? "Copied" : label}</span>}
    </Button>
  );
};

export default CopyLinkButton;
