import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/dashboard/EmptyState";
import { Loader2, Receipt } from "lucide-react";

const Transactions = () => {
  const { user } = useAuth();
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => { setTxns(data || []); setLoading(false); });
  }, [user]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Transactions</h1>
      {txns.length === 0 ? (
        <EmptyState title="No transactions yet." icon={<Receipt className="h-16 w-16 opacity-40" />} />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txns.map((t) => (
                <TableRow key={t.id}>
                  <TableCell><Badge variant="outline">{t.type}</Badge></TableCell>
                  <TableCell className={t.amount >= 0 ? "text-green-600" : "text-red-600"}>
                    {t.amount >= 0 ? "+" : ""}৳{Math.abs(t.amount).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-sm">{t.description || "—"}</TableCell>
                  <TableCell><Badge variant="secondary">{t.status}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default Transactions;
