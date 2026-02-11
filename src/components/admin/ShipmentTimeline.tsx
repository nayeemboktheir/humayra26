import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STAGES = [
  "Ordered",
  "Purchased from 1688",
  "Shipped to Warehouse",
  "Arrived at Warehouse",
  "Shipped to Bangladesh",
  "In Customs",
  "Out for Delivery",
  "Delivered",
];

interface ShipmentTimelineProps {
  orderId: string;
  userId: string;
  shipment: {
    id: string;
    status: string;
    stage_notes: string | null;
    tracking_number: string | null;
    external_tracking_url: string | null;
  } | null;
  onUpdate: () => void;
}

export default function ShipmentTimeline({ orderId, userId, shipment, onUpdate }: ShipmentTimelineProps) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentStageIndex = shipment ? STAGES.indexOf(shipment.status) : 0;
  const activeIndex = currentStageIndex === -1 ? 0 : currentStageIndex;

  const handleSetStage = async (stageIndex: number) => {
    setSaving(true);
    const newStatus = STAGES[stageIndex];
    try {
      // Map shipment stage to order status
      const orderStatus = newStatus === "Delivered" ? "delivered" 
        : newStatus === "Ordered" ? "pending" 
        : "processing";

      if (shipment) {
        const { error } = await supabase
          .from("shipments")
          .update({ status: newStatus })
          .eq("id", shipment.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("shipments")
          .insert({ order_id: orderId, user_id: userId, status: newStatus });
        if (error) throw error;
      }
      // Sync order status
      await supabase.from("orders").update({ status: orderStatus }).eq("id", orderId);
      toast({ title: `Stage updated to "${newStatus}"` });
      onUpdate();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const progress = ((activeIndex) / (STAGES.length - 1)) * 100;

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        <span>Tracking: <span className="text-foreground">{STAGES[activeIndex]}</span></span>
        {expanded ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
      </button>

      {/* Compact progress bar */}
      <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {expanded && (
        <div className="pt-2 space-y-1">
          {STAGES.map((stage, i) => {
            const isDone = i <= activeIndex;
            const isCurrent = i === activeIndex;
            return (
              <button
                key={stage}
                disabled={saving}
                onClick={() => handleSetStage(i)}
                className={cn(
                  "flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors",
                  isCurrent && "bg-primary/10 text-primary font-semibold",
                  isDone && !isCurrent && "text-foreground",
                  !isDone && "text-muted-foreground hover:bg-muted/60"
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors",
                  isDone ? "bg-primary border-primary text-primary-foreground" : "border-border"
                )}>
                  {isDone && <Check className="h-2.5 w-2.5" />}
                </div>
                {stage}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
