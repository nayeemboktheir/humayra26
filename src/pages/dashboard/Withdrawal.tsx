import EmptyState from "@/components/dashboard/EmptyState";
import { ArrowDownToLine } from "lucide-react";

const Withdrawal = () => (
  <div>
    <h1 className="text-2xl font-bold mb-6">Withdrawal Account</h1>
    <EmptyState title="No withdrawal account set up." description="Add a bank account or mobile wallet to withdraw funds." icon={<ArrowDownToLine className="h-16 w-16 opacity-40" />} />
  </div>
);

export default Withdrawal;
