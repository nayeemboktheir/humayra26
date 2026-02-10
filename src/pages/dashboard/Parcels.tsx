import EmptyState from "@/components/dashboard/EmptyState";
import { Package } from "lucide-react";

const Parcels = () => (
  <div>
    <h1 className="text-2xl font-bold mb-6">My Parcels</h1>
    <EmptyState title="No parcels yet." description="Your parcels will appear here." icon={<Package className="h-16 w-16 opacity-40" />} />
  </div>
);

export default Parcels;
