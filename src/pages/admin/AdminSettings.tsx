import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Settings, DollarSign, RefreshCw, Loader2, Save, CheckCircle } from "lucide-react";

export default function AdminSettings() {
  const { user } = useAuth();
  const [rate, setRate] = useState("17.5");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingRate, setFetchingRate] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("app_settings").select("*").eq("key", "cny_to_bdt_rate").maybeSingle();
      if (data) setRate(data.value);
      setLoading(false);
    };
    fetch();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("app_settings")
        .update({ value: rate, updated_at: new Date().toISOString(), updated_by: user?.id } as any)
        .eq("key", "cny_to_bdt_rate");
      if (error) throw error;
      toast({ title: "Currency rate updated", description: `1 CNY = ${rate} BDT` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const fetchLiveRate = async () => {
    setFetchingRate(true);
    try {
      const resp = await fetch("https://open.er-api.com/v6/latest/CNY");
      const data = await resp.json();
      if (data?.rates?.BDT) {
        const liveRate = data.rates.BDT.toFixed(2);
        setRate(liveRate);
        toast({ title: "Live rate fetched", description: `1 CNY = ${liveRate} BDT. Click Save to apply.` });
      } else {
        throw new Error("Could not fetch rate");
      }
    } catch (e: any) {
      toast({ title: "Error fetching rate", description: e.message, variant: "destructive" });
    }
    setFetchingRate(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Settings className="h-6 w-6" /> App Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage platform-wide configurations</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-5 w-5 text-emerald-500" /> Currency Exchange Rate
          </CardTitle>
          <CardDescription>
            Set the CNY to BDT conversion rate used across the platform for price calculations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-xs">1 CNY = ? BDT</Label>
              <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="text-lg font-bold" />
            </div>
            <Button variant="outline" onClick={fetchLiveRate} disabled={fetchingRate} className="shrink-0">
              <RefreshCw className={`h-4 w-4 mr-2 ${fetchingRate ? "animate-spin" : ""}`} />
              {fetchingRate ? "Fetching..." : "Fetch Live Rate"}
            </Button>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm">
            <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>Example: ¥100 = ৳{(100 * parseFloat(rate || "0")).toFixed(2)} BDT</span>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            <Save className="h-4 w-4 mr-2" /> {saving ? "Saving..." : "Save Rate"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
