import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { Loader2, Mail, Lock, User, Phone } from "lucide-react";
import { isStaffRole, resolveUserRole } from "@/lib/roles";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Phone OTP states
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);

  // Phone registration after OTP verify
  const [isNewPhoneUser, setIsNewPhoneUser] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [phoneFullName, setPhoneFullName] = useState("");
  const [phoneEmail, setPhoneEmail] = useState("");
  const [phonePassword, setPhonePassword] = useState("");

  // Signup phone verification states
  const [signupPhone, setSignupPhone] = useState("");
  const [signupOtpSent, setSignupOtpSent] = useState(false);
  const [signupOtp, setSignupOtp] = useState("");
  const [signupPhoneVerified, setSignupPhoneVerified] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);

  const normalizePhone = (value: string) => {
    let normalizedPhone = value.replace(/[^0-9]/g, "");
    if (normalizedPhone.startsWith("0")) {
      normalizedPhone = "880" + normalizedPhone.substring(1);
    }
    if (normalizedPhone && !normalizedPhone.startsWith("880")) {
      normalizedPhone = "880" + normalizedPhone;
    }
    return normalizedPhone;
  };

  const syncProfileDetails = async (userId: string, payload: { full_name?: string; phone?: string }) => {
    const updates = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value && value.trim() !== "")
    );

    if (Object.keys(updates).length === 0) return;

    const { error } = await supabase.from("profiles").update(updates).eq("user_id", userId);
    if (error) {
      console.error("Failed to sync profile details", error);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("সফলভাবে লগইন হয়েছে!");

          const role = await resolveUserRole(data.user.id);
          navigate(isStaffRole(role) ? "/admin" : "/dashboard");
      } else {
        const normalizedPhone = signupPhone ? normalizePhone(signupPhone) : "";

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, phone: normalizedPhone || null },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;

        if (data.user?.id) {
          await syncProfileDetails(data.user.id, {
            full_name: fullName,
            phone: normalizedPhone,
          });
        }

        if (data.session) {
          toast.success("একাউন্ট তৈরি হয়েছে! আপনি এখন লগইন আছেন।");
          const role = data.user?.id ? await resolveUserRole(data.user.id) : null;
          navigate(isStaffRole(role) ? "/admin" : "/dashboard");
          return;
        }

        toast.success("একাউন্ট তৈরি হয়েছে! এখন লগইন করুন।");
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSendOtp = async () => {
    if (!signupPhone || signupPhone.length < 11) {
      toast.error("সঠিক মোবাইল নাম্বার দিন");
      return;
    }
    setSignupLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-sms-otp", {
        body: { phone: signupPhone },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSignupOtpSent(true);
      toast.success("OTP পাঠানো হয়েছে!");
    } catch (error: any) {
      toast.error(error.message || "OTP পাঠাতে সমস্যা হয়েছে");
    } finally {
      setSignupLoading(false);
    }
  };

  const handleSignupVerifyOtp = async () => {
    if (signupOtp.length !== 6) {
      toast.error("৬ সংখ্যার OTP দিন");
      return;
    }
    setSignupLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-sms-otp", {
        body: { phone: signupPhone, otp: signupOtp },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSignupPhoneVerified(true);
      toast.success("মোবাইল নাম্বার ভেরিফাই হয়েছে!");
    } catch (error: any) {
      toast.error(error.message || "OTP ভেরিফাই করতে সমস্যা হয়েছে");
    } finally {
      setSignupLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!phone || phone.length < 11) {
      toast.error("সঠিক মোবাইল নাম্বার দিন");
      return;
    }
    setPhoneLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-sms-otp", {
        body: { phone },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setOtpSent(true);
      toast.success("OTP পাঠানো হয়েছে!");
    } catch (error: any) {
      toast.error(error.message || "OTP পাঠাতে সমস্যা হয়েছে");
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      toast.error("৬ সংখ্যার OTP দিন");
      return;
    }
    setPhoneLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-sms-otp", {
        body: { phone, otp },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data.isNewUser) {
        // New user - show registration form
        setIsNewPhoneUser(true);
        setVerifiedPhone(data.verifiedPhone);
        toast.info("নতুন একাউন্ট তৈরি করতে তথ্য দিন");
      } else {
        // Existing user - verify with magic link token
        if (data.token_hash && data.email) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: data.token_hash,
            type: "magiclink",
          });
          if (verifyError) throw verifyError;
          toast.success("সফলভাবে লগইন হয়েছে!");
          // Check role to redirect admin/staff to admin panel
          const { data: { user: loggedInUser } } = await supabase.auth.getUser();
          if (loggedInUser) {
            const role = await resolveUserRole(loggedInUser.id);
            navigate(isStaffRole(role) ? "/admin" : "/dashboard");
          } else {
            navigate("/dashboard");
          }
        }
      }
    } catch (error: any) {
      toast.error(error.message || "OTP ভেরিফাই করতে সমস্যা হয়েছে");
    } finally {
      setPhoneLoading(false);
    }
  };

  const handlePhoneRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: phoneEmail,
        password: phonePassword,
        options: {
          data: { full_name: phoneFullName, phone: verifiedPhone },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;

      if (data.user?.id) {
        await syncProfileDetails(data.user.id, {
          full_name: phoneFullName,
          phone: verifiedPhone,
        });
      }

      toast.success("একাউন্ট তৈরি হয়েছে! এখনই লগইন হয়েছে।");
      // Reset states
      setIsNewPhoneUser(false);
      setOtpSent(false);
      setOtp("");
      setPhone("");

      const role = data.user?.id ? await resolveUserRole(data.user.id) : null;
      navigate(isStaffRole(role) ? "/admin" : "/dashboard");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setPhoneLoading(false);
    }
  };

  const resetPhoneFlow = () => {
    setOtpSent(false);
    setOtp("");
    setIsNewPhoneUser(false);
    setVerifiedPhone("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {isLogin ? "স্বাগতম" : "একাউন্ট তৈরি করুন"}
          </CardTitle>
          <CardDescription>
            {isLogin ? "আপনার একাউন্টে সাইন ইন করুন" : "নতুন একাউন্ট তৈরি করুন"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLogin ? (
            <Tabs defaultValue="email" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  ইমেইল
                </TabsTrigger>
                <TabsTrigger value="phone" onClick={resetPhoneFlow} className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  মোবাইল
                </TabsTrigger>
              </TabsList>

              <TabsContent value="email">
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="ইমেইল"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      placeholder="পাসওয়ার্ড"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10"
                      required
                      minLength={6}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    সাইন ইন
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="phone">
                {isNewPhoneUser ? (
                  <form onSubmit={handlePhoneRegister} className="space-y-4">
                    <p className="text-sm text-muted-foreground text-center mb-2">
                      নতুন একাউন্ট তৈরি করুন
                    </p>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="পুরো নাম"
                        value={phoneFullName}
                        onChange={(e) => setPhoneFullName(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder="ইমেইল"
                        value={phoneEmail}
                        onChange={(e) => setPhoneEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="password"
                        placeholder="পাসওয়ার্ড"
                        value={phonePassword}
                        onChange={(e) => setPhonePassword(e.target.value)}
                        className="pl-10"
                        required
                        minLength={6}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={phoneLoading}>
                      {phoneLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      একাউন্ট তৈরি করুন
                    </Button>
                    <Button type="button" variant="ghost" className="w-full" onClick={resetPhoneFlow}>
                      বাতিল করুন
                    </Button>
                  </form>
                ) : !otpSent ? (
                  <div className="space-y-4">
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="tel"
                        placeholder="01XXXXXXXXX"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="pl-10"
                        maxLength={14}
                      />
                    </div>
                    <Button onClick={handleSendOtp} className="w-full" disabled={phoneLoading}>
                      {phoneLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      OTP পাঠান
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground text-center">
                      {phone} নাম্বারে OTP পাঠানো হয়েছে
                    </p>
                    <div className="flex justify-center">
                      <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                        <InputOTPGroup>
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    <Button onClick={handleVerifyOtp} className="w-full" disabled={phoneLoading}>
                      {phoneLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      ভেরিফাই করুন
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={resetPhoneFlow}>
                      আবার চেষ্টা করুন
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          ) : (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="পুরো নাম"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="ইমেইল"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="পাসওয়ার্ড"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                  minLength={6}
                />
              </div>

              {/* Phone verification section */}
              <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                <p className="text-sm font-medium flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  মোবাইল নাম্বার (অপশনাল ভেরিফিকেশন)
                  {signupPhoneVerified && <span className="text-green-600 text-xs ml-auto">✓ ভেরিফাইড</span>}
                </p>
                {signupPhoneVerified ? (
                  <p className="text-sm text-muted-foreground">{signupPhone}</p>
                ) : !signupOtpSent ? (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="tel"
                        placeholder="01XXXXXXXXX"
                        value={signupPhone}
                        onChange={(e) => setSignupPhone(e.target.value)}
                        className="pl-10"
                        maxLength={14}
                      />
                    </div>
                    <Button type="button" onClick={handleSignupSendOtp} disabled={signupLoading} size="sm">
                      {signupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "OTP পাঠান"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">{signupPhone} নাম্বারে OTP পাঠানো হয়েছে</p>
                    <div className="flex justify-center">
                      <InputOTP maxLength={6} value={signupOtp} onChange={setSignupOtp}>
                        <InputOTPGroup>
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" onClick={handleSignupVerifyOtp} disabled={signupLoading} size="sm" className="flex-1">
                        {signupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "ভেরিফাই"}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setSignupOtpSent(false); setSignupOtp(""); }}>
                        আবার চেষ্টা
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                সাইন আপ
              </Button>
            </form>
          )}
          <div className="mt-4 text-center text-sm">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline"
            >
              {isLogin
                ? "একাউন্ট নেই? সাইন আপ করুন"
                : "একাউন্ট আছে? সাইন ইন করুন"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
