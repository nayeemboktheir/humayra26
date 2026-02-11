import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminDataTable, { Column } from "@/components/admin/AdminDataTable";
import { Badge } from "@/components/ui/badge";

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

const stageColor: Record<string, string> = {
  "Ordered": "bg-gray-100 text-gray-800",
  "Purchased from 1688": "bg-blue-100 text-blue-800",
  "Shipped to Warehouse": "bg-indigo-100 text-indigo-800",
  "Arrived at Warehouse": "bg-purple-100 text-purple-800",
  "Shipped to Bangladesh": "bg-orange-100 text-orange-800",
  "In Customs": "bg-yellow-100 text-yellow-800",
  "Out for Delivery": "bg-teal-100 text-teal-800",
  "Delivered": "bg-green-100 text-green-800",
};

export default function AdminShipments() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileMap, setProfileMap] = useState<Map<string, string>>(new Map());

  const fetchData = async () => {
    setLoading(true);
    const [shipmentsRes, profilesRes] = await Promise.all([
      supabase.from("shipments").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id, full_name"),
    ]);
    const pMap = new Map<string, string>();
    (profilesRes.data || []).forEach((p: any) => pMap.set(p.user_id, p.full_name || "Unknown"));
    setProfileMap(pMap);
    setData((shipmentsRes.data || []).map((s: any) => ({
      ...s,
      customer_name: pMap.get(s.user_id) || "Unknown",
    })));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

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
    fetchData();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("shipments").delete().eq("id", id);
    if (error) throw error;
    fetchData();
  };

  const onCreate = async (vals: Record<string, any>) => {
    const { error } = await supabase.from("shipments").insert([vals as any]);
    if (error) throw error;
    fetchData();
  };

  return (
    <div>
      <div className="mb-4 p-3 rounded-lg border bg-muted/50">
        <p className="text-sm font-medium mb-2">Delivery Stages:</p>
        <div className="flex flex-wrap gap-1.5">
          {DELIVERY_STAGES.map((stage, i) => (
            <span key={stage} className="text-xs">
              <Badge variant="outline" className={stageColor[stage]}>{stage}</Badge>
              {i < DELIVERY_STAGES.length - 1 && <span className="mx-1 text-muted-foreground">→</span>}
            </span>
          ))}
        </div>
      </div>
      <AdminDataTable
        title="Shipments & Tracking"
        columns={columns}
        data={data}
        loading={loading}
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
