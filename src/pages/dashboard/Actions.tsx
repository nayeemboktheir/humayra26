import EmptyState from "@/components/dashboard/EmptyState";
import { AlertCircle } from "lucide-react";

const Actions = () => (
  <div>
    <h1 className="text-2xl font-bold mb-6">Action Needed</h1>
    <EmptyState title="No actions needed." description="You're all caught up!" icon={<AlertCircle className="h-16 w-16 opacity-40" />} />
  </div>
);

export default Actions;
