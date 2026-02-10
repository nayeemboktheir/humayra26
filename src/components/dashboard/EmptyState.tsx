import { Package } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
}

const EmptyState = ({ title = "No data available.", description = "There is no data to show you right now.", icon }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="mb-4 text-muted-foreground">
      {icon || <Package className="h-16 w-16 mx-auto opacity-40" />}
    </div>
    <h3 className="text-lg font-semibold text-foreground">{title}</h3>
    <p className="text-sm text-muted-foreground mt-1">{description}</p>
  </div>
);

export default EmptyState;
