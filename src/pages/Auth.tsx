import { useState, useEffect } from "react";
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
import { markSignupNoticePending } from "@/components/SignupImportantNotice";
import { errorMessage, getFunctionErrorMessage } from "@/lib/authErrors";

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
  const [phoneLoginPassword, setPhoneLoginPassword] = useState("");

  // Signup phone verification states
  const [signupPhone, setSignupPhone] = useState("");
  const [signupOtpSent, setSignupOtpSent] = useState(false);
  const [signupOtp, setSignupOtp] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);

  // Resend cooldown timers (seconds)
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [signupOtpCooldown, setSignupOtpCooldown] = useState(0);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = setTimeout(() => setOtpCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCooldown]);

  useEffect(() => {
    if (signupOtpCooldown <= 0) return;
    const t = setTimeout(() => setSignupOtpCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [signupOtpCooldown]);

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
        if (!signupOtpSent || !signupPhone || signupOtp.length !== 6) {
          toast.error("সাইন আপ করতে মোবাইল নাম্বার ভেরিফাই করুন");
          return;
        }

        const { data, error } = await supabase.functions.invoke("register-with-phone", {
          body: { fullName, email, password, phone: signupPhone, otp: signupOtp },
        });
        if (error || data?.error) {
          throw new Error(await getFunctionErrorMessage(error, data, "একাউন্ট তৈরি করা যায়নি"));
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        if (sessionError) throw sessionError;

        markSignupNoticePending();
        toast.success("একাউন্ট তৈরি হয়েছে! আপনি এখন লগইন আছেন।");
        const { data: { user } } = await supabase.auth.getUser();
        const role = user ? await resolveUserRole(user.id) : null;
        navigate(isStaffRole(role) ? "/admin" : "/dashboard");
      }
    } catch (error: unknown) {
      toast.error(errorMessage(error, "সাইন ইন করা যায়নি"));
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
      if (error || data?.error) {
        throw new Error(await getFunctionErrorMessage(error, data, "OTP পাঠানো যায়নি"));
      }
      setSignupOtpSent(true);
      setSignupOtpCooldown(60);
      toast.success("OTP পাঠানো হয়েছে!");
    } catch (error: unknown) {
      toast.error(errorMessage(error, "OTP পাঠাতে সমস্যা হয়েছে"));
    } finally {
      setSignupLoading(false);
    }
  };

  const handlePhonePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 11) {
      toast.error("সঠিক মোবাইল নাম্বার দিন");
      return;
    }
    if (!phoneLoginPassword) {
      toast.error("পাসওয়ার্ড দিন");
      return;
    }
    setPhoneLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("phone-password-login", {
        body: { phone, password: phoneLoginPassword },
      });
      if (error || data?.error) {
        throw new Error(await getFunctionErrorMessage(error, data, "মোবাইল নাম্বার বা পাসওয়ার্ড সঠিক নয়"));
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (sessionError) throw sessionError;

      toast.success("সফলভাবে লগইন হয়েছে!");
      const { data: { user: loggedInUser } } = await supabase.auth.getUser();
      const role = loggedInUser ? await resolveUserRole(loggedInUser.id) : null;
      navigate(isStaffRole(role) ? "/admin" : "/dashboard");
    } catch (error: unknown) {
      toast.error(errorMessage(error, "লগইন করতে সমস্যা হয়েছে"));
    } finally {
      setPhoneLoading(false);
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
      if (error || data?.error) {
        throw new Error(await getFunctionErrorMessage(error, data, "OTP পাঠানো যায়নি"));
      }
      setOtpSent(true);
      setOtpCooldown(60);
      toast.success("OTP পাঠানো হয়েছে!");
    } catch (error: unknown) {
      toast.error(errorMessage(error, "OTP পাঠাতে সমস্যা হয়েছে"));
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
      if (error || data?.error) {
        throw new Error(await getFunctionErrorMessage(error, data, "OTP ভেরিফাই করা যায়নি"));
      }

      if (!data.token_hash || !data.email) {
        throw new Error("এই নাম্বারে কোনো একাউন্ট নেই। সাইন আপ করুন।");
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: "magiclink",
      });
      if (verifyError) throw verifyError;
      toast.success("সফলভাবে লগইন হয়েছে!");
      const { data: { user: loggedInUser } } = await supabase.auth.getUser();
      if (loggedInUser) {
        const role = await resolveUserRole(loggedInUser.id);
        navigate(isStaffRole(role) ? "/admin" : "/dashboard");
      } else {
        navigate("/dashboard");
      }
    } catch (error: unknown) {
      toast.error(errorMessage(error, "OTP ভেরিফাই করতে সমস্যা হয়েছে"));
    } finally {
      setPhoneLoading(false);
    }
  };

  const resetPhoneFlow = () => {
    setOtpSent(false);
    setOtp("");
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
                  <button
                    type="button"
                    onClick={() => navigate("/reset-password")}
                    className="w-full text-sm text-primary hover:underline"
                  >
                    পাসওয়ার্ড ভুলে গেছেন?
                  </button>
                </form>
              </TabsContent>

              <TabsContent value="phone">
                {!otpSent ? (
                  <form onSubmit={handlePhonePasswordLogin} className="space-y-4">
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
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="password"
                        placeholder="পাসওয়ার্ড"
                        value={phoneLoginPassword}
                        onChange={(e) => setPhoneLoginPassword(e.target.value)}
                        className="pl-10"
                        minLength={6}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={phoneLoading}>
                      {phoneLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      সাইন ইন
                    </Button>
                    <div className="text-center text-xs text-muted-foreground">অথবা</div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSendOtp}
                      className="w-full"
                      disabled={phoneLoading}
                    >
                      OTP দিয়ে লগইন করুন
                    </Button>
                  </form>
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
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={handleSendOtp}
                      disabled={phoneLoading || otpCooldown > 0}
                    >
                      {otpCooldown > 0 ? `আবার পাঠান (${otpCooldown}s)` : "OTP আবার পাঠান"}
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={resetPhoneFlow}>
                      নাম্বার পরিবর্তন করুন
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
                  মোবাইল নাম্বার ভেরিফাই করুন <span className="text-destructive">*</span>
                </p>
                {!signupOtpSent ? (
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
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={handleSignupSendOtp}
                        disabled={signupLoading || signupOtpCooldown > 0}
                      >
                        {signupOtpCooldown > 0 ? `${signupOtpCooldown}s` : "আবার পাঠান"}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setSignupOtpSent(false); setSignupOtp(""); }}>
                        পরিবর্তন
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading || signupLoading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                মোবাইল যাচাই করে একাউন্ট তৈরি করুন
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
