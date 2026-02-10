import EmptyState from "@/components/dashboard/EmptyState";
import { Truck } from "lucide-react";

const Delivery = () => (
  <div>
    <h1 className="text-2xl font-bold mb-6">My Delivery</h1>
    <EmptyState title="No deliveries yet." description="Your deliveries will appear here once orders are shipped." icon={<Truck className="h-16 w-16 opacity-40" />} />
  </div>
);

export default Delivery;
