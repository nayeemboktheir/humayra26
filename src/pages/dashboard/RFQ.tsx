import EmptyState from "@/components/dashboard/EmptyState";
import { FileText } from "lucide-react";

const RFQ = () => (
  <div>
    <h1 className="text-2xl font-bold mb-6">RFQ Management</h1>
    <EmptyState title="No RFQs yet." description="Request for quotation will appear here." icon={<FileText className="h-16 w-16 opacity-40" />} />
  </div>
);

export default RFQ;
