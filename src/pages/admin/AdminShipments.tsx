import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminDataTable, { Column } from "@/components/admin/AdminDataTable";
import { Badge } from "@/components/ui/badge";

const DELIVERY_STAGES = [
  "Ordered",
  "Purchased From factory",
  "Shipped",
  "RCV CN Warehouse",
  "Dhaka Airport",
  "Dhaka Warehouse",
  "Delivered",
];

const stageColor: Record<string, string> = {
  "Ordered": "bg-gray-100 text-gray-800",
  "Purchased From factory": "bg-blue-100 text-blue-800",
  "Shipped": "bg-indigo-100 text-indigo-800",
  "RCV CN Warehouse": "bg-purple-100 text-purple-800",
  "Dhaka Airport": "bg-orange-100 text-orange-800",
  "Dhaka Warehouse": "bg-teal-100 text-teal-800",
  "Delivered": "bg-green-100 text-green-800",
};

export default function AdminShipments() {
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});

  // Stage badge counts come from a GROUP BY rather than from counting a fully
  // downloaded table.
  const loadStageCounts = useCallback(async () => {
    const { data } = await supabase.rpc("get_shipment_stage_counts");
    if (!data) return;
    const map: Record<string, number> = {};
    for (const row of data as any[]) map[row.status] = Number(row.count) || 0;
    setStageCounts(map);
  }, []);

  useEffect(() => { void loadStageCounts(); }, [loadStageCounts]);

  const totalShipments = Object.values(stageCounts).reduce((a, b) => a + b, 0);

  // Resolve customer names for the visible page only.
  const attachCustomerNames = useCallback(async (rows: any[]) => {
    const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    if (ids.length === 0) return rows;
    const { data: profiles } = await supabase
      .from("profiles").select("user_id, full_name").in("user_id", ids);
    const pMap = new Map<string, string>();
    (profiles || []).forEach((p: any) => pMap.set(p.user_id, p.full_name || "Unknown"));
    return rows.map((r) => ({ ...r, customer_name: pMap.get(r.user_id) || "Unknown" }));
  }, []);

  const filters = useMemo(
    () => (stageFilter ? { status: stageFilter } : undefined),
    [stageFilter],
  );

  const columns: Column[] = [
    { key: "customer_name", label: "Customer" },
    { key: "tracking_number", label: "Tracking Code", editable: true },
    { key: "carrier", label: "Carrier", editable: true },
    {
      key: "status",
      label: "Stage",
      editable: true,
      render: (v) => <Badge className={stageColor[v] || ""}>{v}</Badge>,
    },
    { key: "stage_notes", label: "Notes", editable: true },
    { key: "external_tracking_url", label: "Tracking URL", editable: true },
    { key: "order_id", label: "Order ID" },
    { key: "created_at", label: "Date", render: (v) => new Date(v).toLocaleDateString() },
  ];

  const onUpdate = async (id: string, vals: Record<string, any>) => {
    // Remove computed field before saving
    const { customer_name, ...dbVals } = vals;
    const { error } = await supabase.from("shipments").update(dbVals).eq("id", id);
    if (error) throw error;
    await loadStageCounts();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("shipments").delete().eq("id", id);
    if (error) throw error;
    await loadStageCounts();
  };

  const onCreate = async (vals: Record<string, any>) => {
    const { error } = await supabase.from("shipments").insert([vals as any]);
    if (error) throw error;
    await loadStageCounts();
  };

  return (
    <div>
      <div className="mb-4 p-3 rounded-lg border bg-muted/50">
        <p className="text-sm font-medium mb-2">Filter by Stage:</p>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setStageFilter(null)}>
            <Badge variant="outline" className={`cursor-pointer transition-all ${!stageFilter ? "ring-2 ring-primary ring-offset-1" : "opacity-60 hover:opacity-100"}`}>All ({totalShipments})</Badge>
          </button>
          {DELIVERY_STAGES.map((stage) => {
            const count = stageCounts[stage] ?? 0;
            return (
              <button key={stage} onClick={() => setStageFilter(stageFilter === stage ? null : stage)}>
                <Badge variant="outline" className={`cursor-pointer transition-all ${stageColor[stage]} ${stageFilter === stage ? "ring-2 ring-primary ring-offset-1" : "opacity-60 hover:opacity-100"}`}>
                  {stage} ({count})
                </Badge>
              </button>
            );
          })}
        </div>
      </div>
      <AdminDataTable
        title="Shipments & Tracking"
        columns={columns}
        table="shipments"
        searchColumns={["tracking_number", "carrier", "status", "external_tracking_url"]}
        filters={filters}
        transformRows={attachCustomerNames}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onCreate={onCreate}
        createFields={[
          { key: "user_id", label: "User ID", required: true },
          { key: "order_id", label: "Order ID" },
          { key: "tracking_number", label: "Tracking Code" },
          { key: "carrier", label: "Carrier" },
          { key: "status", label: "Stage (e.g. Ordered)", required: true },
          { key: "stage_notes", label: "Notes" },
          { key: "external_tracking_url", label: "External Tracking URL" },
        ]}
      />
    </div>
  );
}
