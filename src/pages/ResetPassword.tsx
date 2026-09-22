import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Loader2, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const recoveryCode = url.searchParams.get("code");
    const hasRecoveryHash = new URLSearchParams(url.hash.replace(/^#/, "")).get("type") === "recovery";

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryReady(true);
    });

    const establishRecoverySession = async () => {
      if (recoveryCode) {
        const { error } = await supabase.auth.exchangeCodeForSession(recoveryCode);
        if (!error) {
          setRecoveryReady(true);
          window.history.replaceState({}, document.title, "/reset-password");
          return;
        }
      }

      if (hasRecoveryHash) setRecoveryReady(true);
    };

    void establishRecoverySession();
    return () => subscription.unsubscribe();
  }, []);

  const requestReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;

      // Keep this response generic so the form cannot reveal which emails are registered.
      toast.success("ইমেইলটি নিবন্ধিত হলে পাসওয়ার্ড রিসেটের লিংক পাঠানো হয়েছে।");
    } catch {
      toast.success("ইমেইলটি নিবন্ধিত হলে পাসওয়ার্ড রিসেটের লিংক পাঠানো হয়েছে।");
    } finally {
      setLoading(false);
    }
  };

  const updatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 6) {
      toast.error("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("দুটি পাসওয়ার্ড মিলছে না");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      toast.success("পাসওয়ার্ড পরিবর্তন হয়েছে। নতুন পাসওয়ার্ড দিয়ে সাইন ইন করুন।");
      navigate("/auth", { replace: true });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "পাসওয়ার্ড পরিবর্তন করা যায়নি");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">পাসওয়ার্ড রিসেট করুন</CardTitle>
          <CardDescription>
            {recoveryReady ? "নতুন পাসওয়ার্ড দিন" : "আপনার ইমেইলে রিসেট লিংক পাঠানো হবে"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recoveryReady ? (
            <form onSubmit={updatePassword} className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="নতুন পাসওয়ার্ড"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pl-10"
                  minLength={6}
                  required
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="পাসওয়ার্ড আবার দিন"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="pl-10"
                  minLength={6}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
                নতুন পাসওয়ার্ড সংরক্ষণ করুন
              </Button>
            </form>
          ) : (
            <form onSubmit={requestReset} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="ইমেইল"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="pl-10"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
                রিসেট লিংক পাঠান
              </Button>
            </form>
          )}
          <Button type="button" variant="ghost" className="w-full mt-3" onClick={() => navigate("/auth")}>
            সাইন ইন পেইজে ফিরে যান
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;

