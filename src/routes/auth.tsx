import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { toUserMessage } from "@/lib/errorMessages";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    role: (s.role === "fundi" ? "fundi" : "client") as "client" | "fundi",
  }),
  component: AuthPage,
});

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email address");

const signinSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(72),
});

const signupPasswordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(72, "Password is too long")
  .regex(/[a-z]/, "Add a lowercase letter")
  .regex(/[A-Z]/, "Add an uppercase letter")
  .regex(/[0-9]/, "Add a number")
  .regex(/[^A-Za-z0-9]/, "Add a symbol");

const signupSchema = z
  .object({
    full_name: z.string().trim().min(2, "Enter your full name").max(80, "Name is too long"),
    phone: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || /^\+?[0-9 ]{7,15}$/.test(v), "Enter a valid phone number"),
    email: emailSchema,
    password: signupPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
    agree: z.boolean().refine((v) => v, "You must agree to the Terms of Service"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

const forgotSchema = z.object({ email: emailSchema });

const resetSchema = z
  .object({
    password: signupPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

function friendlyAuthError(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Incorrect email or password.";
  if (m.includes("email not confirmed")) return "Please confirm your email address first.";
  if (m.includes("already been registered") || m.includes("already registered"))
    return "An account with this email already exists. Try signing in.";
  if (m.includes("rate limit")) return "Too many attempts. Please wait a moment and try again.";
  if (m.includes("password should be at least")) return "Password must be at least 8 characters.";
  return toUserMessage(new Error(msg), "We couldn't complete that. Please try again.");
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function passwordScore(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 5);
}

function strengthMeta(score: number) {
  if (score <= 1) return { label: "Weak", color: "bg-red-500", text: "text-red-500" };
  if (score <= 3) return { label: "Fair", color: "bg-amber-500", text: "text-amber-600" };
  if (score <= 4) return { label: "Good", color: "bg-lime-500", text: "text-lime-600" };
  return { label: "Strong", color: "bg-emerald-500", text: "text-emerald-600" };
}

const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (v: string) => v.length >= 8 },
  { label: "Lower & uppercase letters", test: (v: string) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { label: "At least one number", test: (v: string) => /[0-9]/.test(v) },
  { label: "At least one symbol", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];

const GOOGLE_ENABLED = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === "true";

function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs text-destructive">
      {error}
    </p>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  show,
  onToggleShow,
  autoComplete,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  autoComplete: string;
  invalid: boolean;
  describedBy?: string;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={cn("pr-10", invalid && "border-destructive focus-visible:ring-destructive/40")}
      />
      <button
        type="button"
        onClick={onToggleShow}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 grid place-items-center px-3 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function AuthPage() {
  const { role } = Route.useSearch();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [view, setView] = useState<"auth" | "forgot" | "reset">("auth");
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Redirect signed-in users away — but NOT during the recovery/reset flow,
  // because Supabase logs the user in with a limited recovery session.
  useEffect(() => {
    if (!loading && user && view !== "reset") navigate({ to: "/app" });
  }, [user, loading, navigate, view]);

  // Detect password-recovery links from the "forgot password" email.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setView("reset");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const setRole = (r: "client" | "fundi") => {
    navigate({ to: "/auth", search: { role: r }, replace: true });
  };

  const clearFieldError = (key: string) =>
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (view === "forgot") {
      const parsed = forgotSchema.safeParse({ email: form.email });
      if (!parsed.success) return setErrors(fieldErrors(parsed.error));
      setBusy(true);
      const { error } = await supabase.auth.resetPasswordForEmail(form.email.trim(), {
        redirectTo: `${window.location.origin}/auth`,
      });
      setBusy(false);
      if (error) {
        setErrors({ email: friendlyAuthError(error.message) });
        return;
      }
      setResetSent(true);
      return;
    }

    if (view === "reset") {
      const parsed = resetSchema.safeParse({
        password: form.password,
        confirmPassword: form.confirmPassword,
      });
      if (!parsed.success) return setErrors(fieldErrors(parsed.error));
      setBusy(true);
      const { error } = await supabase.auth.updateUser({ password: form.password });
      setBusy(false);
      if (error) {
        toast.error(friendlyAuthError(error.message));
        return;
      }
      toast.success("Password updated — you're all set");
      navigate({ to: "/app" });
      return;
    }

    if (mode === "signup") {
      const parsed = signupSchema.safeParse({ ...form, agree });
      if (!parsed.success) return setErrors(fieldErrors(parsed.error));
      setBusy(true);
      const { error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            full_name: form.full_name.trim(),
            phone: form.phone.trim() || undefined,
            role,
          },
        },
      });
      setBusy(false);
      if (error) {
        setErrors({ form: friendlyAuthError(error.message) });
        return;
      }
      toast.success("Almost there — check your email to confirm your account");
    } else {
      const parsed = signinSchema.safeParse({ email: form.email, password: form.password });
      if (!parsed.success) return setErrors(fieldErrors(parsed.error));
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });
      setBusy(false);
      if (error) {
        setErrors({ form: friendlyAuthError(error.message) });
        return;
      }
      toast.success("Welcome back!");
    }
  };

  const googleSignIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) toast.error(friendlyAuthError(error.message));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-hero grid place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const score = passwordScore(form.password);
  const strength = strengthMeta(score);
  const isSignup = view === "auth" && mode === "signup";

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="inline-grid h-12 w-12 place-items-center rounded-2xl bg-gradient-primary text-lg font-bold text-primary-foreground shadow-elegant">
            F
          </div>
          <h1 className="mt-3 font-display text-2xl font-bold">FundiFast</h1>
          <p className="text-sm text-muted-foreground">Hire trusted local fundis in Tanzania</p>
        </div>

        <Card className="p-6 sm:p-8 shadow-elegant">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
            ← Back to home
          </Link>

          {view === "forgot" ? (
            <>
              <h2 className="text-xl font-bold mt-3">Reset your password</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we'll send you a link to set a new password.
              </p>
              {resetSent ? (
                <div className="space-y-4">
                  <div className="rounded-xl border bg-success/10 text-success px-4 py-3 text-sm">
                    Reset link sent — check your inbox (and spam folder).
                  </div>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => {
                      setView("auth");
                      setResetSent(false);
                    }}
                  >
                    Back to sign in
                  </Button>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-4">
                  <div>
                    <Label htmlFor="forgot-email">Email</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      className="mt-1 h-11"
                      value={form.email}
                      onChange={(e) => {
                        setForm({ ...form, email: e.target.value });
                        clearFieldError("email");
                      }}
                      aria-invalid={!!errors.email}
                      aria-describedby={errors.email ? "forgot-email-error" : undefined}
                    />
                    <FieldError id="forgot-email-error" error={errors.email} />
                  </div>
                  <Button type="submit" disabled={busy} className="w-full h-11 bg-gradient-primary">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setView("auth")}
                    className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                  >
                    Remembered it? Sign in
                  </button>
                </form>
              )}
            </>
          ) : view === "reset" ? (
            <>
              <h2 className="text-xl font-bold mt-3">Set a new password</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Choose a strong password you haven't used before.
              </p>
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <Label htmlFor="reset-pw">New password</Label>
                  <div className="mt-1">
                    <PasswordInput
                      id="reset-pw"
                      value={form.password}
                      onChange={(v) => {
                        setForm({ ...form, password: v });
                        clearFieldError("password");
                      }}
                      show={showPw}
                      onToggleShow={() => setShowPw(!showPw)}
                      autoComplete="new-password"
                      invalid={!!errors.password}
                      describedBy={errors.password ? "reset-pw-error" : undefined}
                    />
                    <FieldError id="reset-pw-error" error={errors.password} />
                  </div>
                  <PasswordStrength password={form.password} />
                </div>
                <div>
                  <Label htmlFor="reset-confirm">Confirm new password</Label>
                  <div className="mt-1">
                    <PasswordInput
                      id="reset-confirm"
                      value={form.confirmPassword}
                      onChange={(v) => {
                        setForm({ ...form, confirmPassword: v });
                        clearFieldError("confirmPassword");
                      }}
                      show={showConfirm}
                      onToggleShow={() => setShowConfirm(!showConfirm)}
                      autoComplete="new-password"
                      invalid={!!errors.confirmPassword}
                      describedBy={errors.confirmPassword ? "reset-confirm-error" : undefined}
                    />
                    <FieldError id="reset-confirm-error" error={errors.confirmPassword} />
                  </div>
                </div>
                <Button type="submit" disabled={busy} className="w-full h-11 bg-gradient-primary">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="mt-3">
                <div className="grid grid-cols-2 rounded-xl bg-muted p-1">
                  {(["client", "fundi"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={cn(
                        "h-9 rounded-lg text-sm font-medium transition-colors",
                        role === r
                          ? "bg-background shadow-sm text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {r === "client" ? "I'm a Client" : "I'm a Fundi"}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground text-center">
                  {role === "fundi"
                    ? "Create an account or sign in to pick up jobs."
                    : "Create an account or sign in to book a fundi."}
                </p>
              </div>

              <h2 className="text-xl font-bold mt-4">
                {mode === "signup" ? "Create your account" : "Welcome back"}
              </h2>
              <p className="text-sm text-muted-foreground mb-5">
                {mode === "signup"
                  ? `Sign up as a ${role === "fundi" ? "Fundi (technician)" : "Client"}.`
                  : "Sign in to continue."}
              </p>

              {GOOGLE_ENABLED && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11"
                    onClick={googleSignIn}
                    disabled={busy}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                    )}
                    Continue with Google
                  </Button>
                  <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="h-px flex-1 bg-border" />
                    or continue with email
                    <div className="h-px flex-1 bg-border" />
                  </div>
                </>
              )}

              <form onSubmit={submit} className="space-y-4" noValidate>
                <div className="flex rounded-xl bg-muted p-1">
                  {(
                    [
                      ["signin", "Sign in"],
                      ["signup", "Sign up"],
                    ] as const
                  ).map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMode(m);
                        setErrors({});
                      }}
                      className={cn(
                        "flex-1 h-9 rounded-lg text-sm font-medium transition-colors",
                        mode === m
                          ? "bg-background shadow-sm text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {mode === "signup" && (
                  <>
                    <div>
                      <Label htmlFor="name">Full name</Label>
                      <Input
                        id="name"
                        autoComplete="name"
                        className="mt-1 h-11"
                        value={form.full_name}
                        onChange={(e) => {
                          setForm({ ...form, full_name: e.target.value });
                          clearFieldError("full_name");
                        }}
                        aria-invalid={!!errors.full_name}
                        aria-describedby={errors.full_name ? "name-error" : undefined}
                      />
                      <FieldError id="name-error" error={errors.full_name} />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone (optional)</Label>
                      <Input
                        id="phone"
                        type="tel"
                        autoComplete="tel"
                        placeholder="+255 7XX XXX XXX"
                        className="mt-1 h-11"
                        value={form.phone}
                        onChange={(e) => {
                          setForm({ ...form, phone: e.target.value });
                          clearFieldError("phone");
                        }}
                        aria-invalid={!!errors.phone}
                        aria-describedby={errors.phone ? "phone-error" : undefined}
                      />
                      <FieldError id="phone-error" error={errors.phone} />
                    </div>
                  </>
                )}

                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    className="mt-1 h-11"
                    value={form.email}
                    onChange={(e) => {
                      setForm({ ...form, email: e.target.value });
                      clearFieldError("email");
                    }}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "email-error" : undefined}
                  />
                  <FieldError id="email-error" error={errors.email} />
                </div>

                <div>
                  <Label htmlFor="pw">Password</Label>
                  <div className="mt-1">
                    <PasswordInput
                      id="pw"
                      value={form.password}
                      onChange={(v) => {
                        setForm({ ...form, password: v });
                        clearFieldError("password");
                      }}
                      show={showPw}
                      onToggleShow={() => setShowPw(!showPw)}
                      autoComplete={isSignup ? "new-password" : "current-password"}
                      invalid={!!errors.password}
                      describedBy={errors.password ? "pw-error" : undefined}
                    />
                    <FieldError id="pw-error" error={errors.password} />
                  </div>
                  {isSignup ? (
                    <PasswordStrength password={form.password} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setView("forgot");
                        setErrors({});
                      }}
                      className="mt-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Forgot your password?
                    </button>
                  )}
                </div>

                {mode === "signup" && (
                  <div>
                    <Label htmlFor="confirm">Confirm password</Label>
                    <div className="mt-1">
                      <PasswordInput
                        id="confirm"
                        value={form.confirmPassword}
                        onChange={(v) => {
                          setForm({ ...form, confirmPassword: v });
                          clearFieldError("confirmPassword");
                        }}
                        show={showConfirm}
                        onToggleShow={() => setShowConfirm(!showConfirm)}
                        autoComplete="new-password"
                        invalid={!!errors.confirmPassword}
                        describedBy={errors.confirmPassword ? "confirm-error" : undefined}
                      />
                      <FieldError id="confirm-error" error={errors.confirmPassword} />
                    </div>
                  </div>
                )}

                {mode === "signup" && (
                  <div>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agree}
                        onChange={(e) => {
                          setAgree(e.target.checked);
                          clearFieldError("agree");
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                      />
                      <span>
                        I agree to the{" "}
                        <Link
                          to="/privacy"
                          className="font-medium underline underline-offset-2 hover:text-foreground"
                        >
                          Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link
                          to="/privacy"
                          className="font-medium underline underline-offset-2 hover:text-foreground"
                        >
                          Privacy Policy
                        </Link>
                        .
                      </span>
                    </label>
                    {errors.agree && (
                      <p role="alert" className="mt-1 text-xs text-destructive">
                        {errors.agree}
                      </p>
                    )}
                  </div>
                )}

                {errors.form && (
                  <div
                    role="alert"
                    className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                  >
                    {errors.form}
                  </div>
                )}

                <Button type="submit" disabled={busy} className="w-full h-11 bg-gradient-primary">
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : mode === "signup" ? (
                    "Create account"
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>

              <button
                onClick={() => {
                  setMode(mode === "signup" ? "signin" : "signup");
                  setErrors({});
                }}
                className="mt-5 text-sm text-muted-foreground hover:text-foreground block w-full text-center"
              >
                {mode === "signup"
                  ? "Already have an account? Sign in"
                  : "New here? Create an account"}
              </button>
            </>
          )}
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} FundiFast · Dar es Salaam, Tanzania
        </p>
      </div>
    </div>
  );
}

function PasswordStrength({ password }: { password: string }) {
  const score = passwordScore(password);
  const strength = strengthMeta(score);
  return (
    <div className="mt-2 space-y-1.5">
      {password.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex flex-1 gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= score ? strength.color : "bg-muted",
                )}
              />
            ))}
          </div>
          <span className={cn("ml-2 text-xs font-medium", strength.text)}>{strength.label}</span>
        </div>
      )}
      <ul className="space-y-0.5">
        {PASSWORD_RULES.map((rule) => {
          const ok = rule.test(password);
          return (
            <li
              key={rule.label}
              className={cn(
                "flex items-center gap-1.5 text-xs",
                ok ? "text-emerald-600" : "text-muted-foreground",
              )}
            >
              {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
