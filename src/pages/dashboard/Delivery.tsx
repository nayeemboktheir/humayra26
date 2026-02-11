import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import EmptyState from "@/components/dashboard/EmptyState";
import { Truck, Loader2, ExternalLink, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const DELIVERY_STAGES = [
  "Ordered",
  "Purchased from 1688",
  "Shipped to Warehouse",
  "Arrived at Warehouse",
  "Shipped to Bangladesh",
  "In Customs",
  "Out for Delivery",
  "Delivered",
];

const stageIcons: Record<string, string> = {
  "Ordered": "📦",
  "Purchased from 1688": "🛒",
  "Shipped to Warehouse": "🚚",
  "Arrived at Warehouse": "🏭",
  "Shipped to Bangladesh": "✈️",
  "In Customs": "🛃",
  "Out for Delivery": "🏍️",
  "Delivered": "✅",
};

const Delivery = () => {
  const { user } = useAuth();
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("shipments")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setShipments(data || []);
        setLoading(false);
      });
  }, [user]);

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">My Delivery</h1>
      {shipments.length === 0 ? (
        <EmptyState
          title="No deliveries yet."
          description="Your deliveries will appear here once orders are shipped."
          icon={<Truck className="h-16 w-16 opacity-40" />}
        />
      ) : (
        <div className="space-y-4">
          {shipments.map((shipment) => {
            const currentIndex = DELIVERY_STAGES.indexOf(shipment.status);
            return (
              <Card key={shipment.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      {shipment.tracking_number
                        ? `Tracking: ${shipment.tracking_number}`
                        : "Shipment"}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {shipment.carrier && (
                        <Badge variant="outline">{shipment.carrier}</Badge>
                      )}
                      {shipment.external_tracking_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            window.open(shipment.external_tracking_url, "_blank")
                          }
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Track
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Stage Timeline */}
                  <div className="relative">
                    <div className="flex items-start justify-between overflow-x-auto pb-2">
                      {DELIVERY_STAGES.map((stage, index) => {
                        const isCompleted = index <= currentIndex;
                        const isCurrent = index === currentIndex;
                        return (
                          <div
                            key={stage}
                            className="flex flex-col items-center min-w-[80px] relative flex-1"
                          >
                            {/* Connector line */}
                            {index > 0 && (
                              <div
                                className={`absolute top-4 -left-1/2 w-full h-0.5 ${
                                  index <= currentIndex
                                    ? "bg-primary"
                                    : "bg-muted-foreground/20"
                                }`}
                                style={{ zIndex: 0 }}
                              />
                            )}
                            {/* Circle */}
                            <div
                              className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 transition-all ${
                                isCurrent
                                  ? "border-primary bg-primary text-primary-foreground scale-110 shadow-md"
                                  : isCompleted
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-muted-foreground/30 bg-background text-muted-foreground/40"
                              }`}
                            >
                              {stageIcons[stage]}
                            </div>
                            {/* Label */}
                            <span
                              className={`text-[10px] mt-1.5 text-center leading-tight ${
                                isCurrent
                                  ? "font-bold text-primary"
                                  : isCompleted
                                  ? "text-foreground"
                                  : "text-muted-foreground/50"
                              }`}
                            >
                              {stage}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Notes */}
                  {shipment.stage_notes && (
                    <div className="mt-4 p-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Note:</span>{" "}
                      {shipment.stage_notes}
                    </div>
                  )}

                  {/* Estimated delivery */}
                  {shipment.estimated_delivery && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Est. delivery:{" "}
                      {new Date(shipment.estimated_delivery).toLocaleDateString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Delivery;
