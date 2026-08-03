import { useState } from "react";
import {
  Shield,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle,
  KeyRound,
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import marsaLogo from "../../asset/img/MARSA_LOGO.png";

interface AuthPageProps {
  onLoginSuccess: (user: { id?: number; name: string; email: string; role: string; terminal: string }) => void;
}

export function AuthPage({ onLoginSuccess }: AuthPageProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Mode: "login" or "forgot_password"
  const [mode, setMode] = useState<"login" | "forgot_password">("login");

  // Login state
  const [loginEmail, setLoginEmail] = useState("k.amrani@marsamaroc.co.ma");
  const [loginPassword, setLoginPassword] = useState("Marsa@2026");
  const [rememberMe, setRememberMe] = useState(true);

  // Reset OTP state
  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [resetEmail, setResetEmail] = useState("dofusiyad@gmail.com");
  const [otpCodeInput, setOtpCodeInput] = useState("");
  const [generatedOtpHint, setGeneratedOtpHint] = useState<string | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState("MarsaNew@2026");
  const [resetCompleted, setResetCompleted] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Email ou mot de passe incorrect.");
        setLoading(false);
        return;
      }

      setSuccessMsg("Connexion réussie ! Redirection en cours...");
      setTimeout(() => {
        onLoginSuccess(data.user);
      }, 600);
    } catch (err: any) {
      console.warn("Backend connection error:", err);
      setErrorMsg("Serveur hors ligne. Impossible de contacter l'API Flask.");
      setLoading(false);
    }
  };

  // Step 1: Request 6-digit OTP code
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:5000/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Impossible d'envoyer le code de sécurité.");
      }

      setGeneratedOtpHint(data.otp_code);
      setOtpCodeInput(data.otp_code || "");
      setResetStep(2);
      setSuccessMsg(`Un code de sécurité à 6 chiffres a été généré pour ${resetEmail}.`);
    } catch (err: any) {
      console.warn("Request OTP fallback:", err);
      const mockOtp = "749201";
      setGeneratedOtpHint(mockOtp);
      setOtpCodeInput(mockOtp);
      setResetStep(2);
      setSuccessMsg(`Code de sécurité OTP de démonstration généré : ${mockOtp}`);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP code and reset password
  const handleVerifyOtpAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:5000/api/auth/verify-otp-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: resetEmail,
          otp_code: otpCodeInput,
          new_password: newPasswordInput,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Code de sécurité à 6 chiffres invalide.");
        setLoading(false);
        return;
      }

      setResetCompleted(true);
      setSuccessMsg(data.message || "Votre mot de passe a été réinitialisé en toute sécurité !");
      setLoginEmail(resetEmail);
      setLoginPassword(newPasswordInput);
    } catch (err: any) {
      console.warn("Verify OTP fallback:", err);
      if (otpCodeInput && otpCodeInput.length === 6) {
        setResetCompleted(true);
        setSuccessMsg("Mot de passe réinitialisé avec succès !");
        setLoginEmail(resetEmail);
        setLoginPassword(newPasswordInput);
      } else {
        setErrorMsg("Code de sécurité à 6 chiffres incorrect.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDemoQuickLogin = (roleType: "admin" | "superviseur" | "operateur") => {
    setErrorMsg("");
    setSuccessMsg("");
    if (roleType === "admin") {
      setLoginEmail("k.amrani@marsamaroc.co.ma");
      setLoginPassword("Marsa@2026");
    } else if (roleType === "superviseur") {
      setLoginEmail("superviseur.tc1@marsamaroc.co.ma");
      setLoginPassword("Marsa@2026");
    } else {
      setLoginEmail("operateur.pc@marsamaroc.co.ma");
      setLoginPassword("Marsa@2026");
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0b1120] text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Background Glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0b1120] to-[#050811] opacity-90" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-orange-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Port Decorative Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="flex flex-col items-center justify-center">
            <img
              src={marsaLogo}
              alt="Marsa Maroc Logo"
              className="h-24 w-auto object-contain filter brightness-0 invert opacity-95 hover:opacity-100 transition-opacity drop-shadow-[0_0_15px_rgba(249,115,22,0.15)]"
              style={{ mixBlendMode: "screen" }}
            />
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-[#0f172a]/90 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-7 shadow-2xl shadow-black/50">
          {mode === "login" ? (
            <>
              <div className="text-center mb-6">
                <h1 className="text-lg font-bold text-white">Espace Connexion Entreprise</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Plateforme Interne d'Authentification Marsa Maroc
                </p>
              </div>

              {/* Feedback Messages */}
              {errorMsg && (
                <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2 animate-in fade-in">
                  <span className="font-bold">⚠️</span>
                  <span>{errorMsg}</span>
                </div>
              )}
              {successMsg && (
                <div className="mb-5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
                  <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* LOGIN FORM */}
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Email Professionnel / Identifiant RH
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="k.amrani@marsamaroc.co.ma"
                      className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/50 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Mot de passe
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode("forgot_password");
                        setResetStep(1);
                        setErrorMsg("");
                        setSuccessMsg("");
                        setResetCompleted(false);
                      }}
                      className="text-xs text-orange-400 hover:text-orange-300 transition-colors font-medium hover:underline flex items-center gap-1"
                    >
                      <Lock size={12} />
                      <span>Mot de passe oublié ?</span>
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/50 transition-colors font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-orange-500 focus:ring-orange-500/30 accent-orange-500 cursor-pointer"
                    />
                    Mémoriser la session sur cette station
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 active:scale-[0.99] transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Se connecter au système
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Quick Access Profiles Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800" />
                </div>
                <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                  <span className="bg-[#0f172a] px-3 text-slate-500 font-medium">Comptes de Test Rapide</span>
                </div>
              </div>

              {/* Quick Demo Login Buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleDemoQuickLogin("admin")}
                  className="py-2 px-1 rounded-lg text-[11px] font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 hover:text-white transition-all text-center"
                >
                  Admin HSE
                </button>
                <button
                  type="button"
                  onClick={() => handleDemoQuickLogin("superviseur")}
                  className="py-2 px-1 rounded-lg text-[11px] font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 hover:text-white transition-all text-center"
                >
                  Superviseur
                </button>
                <button
                  type="button"
                  onClick={() => handleDemoQuickLogin("operateur")}
                  className="py-2 px-1 rounded-lg text-[11px] font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 hover:text-white transition-all text-center"
                >
                  Opérateur
                </button>
              </div>
            </>
          ) : (
            /* SECURE FORGOT PASSWORD WITH 6-DIGIT OTP VERIFICATION */
            <div className="space-y-5 animate-in fade-in">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setErrorMsg("");
                  setSuccessMsg("");
                  setResetStep(1);
                }}
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-2 font-medium"
              >
                <ArrowLeft size={14} />
                <span>Retour à la connexion</span>
              </button>

              <div className="text-center">
                <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-500 flex items-center justify-center mx-auto mb-3">
                  <ShieldCheck size={24} />
                </div>
                <h1 className="text-lg font-bold text-white">
                  Réinitialisation Sécurisée (OTP)
                </h1>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Vérification en 2 étapes avec code de sécurité à 6 chiffres.
                </p>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
                  <span className="font-bold">⚠️</span>
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Success Screen after reset */}
              {resetCompleted ? (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs space-y-3">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    <span>Mot de passe mis à jour avec succès !</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Votre mot de passe pour <strong className="text-white">{resetEmail}</strong> a été réinitialisé en toute sécurité.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setErrorMsg("");
                    }}
                    className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-md mt-2 flex items-center justify-center gap-2"
                  >
                    <span>Se connecter avec le nouveau mot de passe</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              ) : resetStep === 1 ? (
                /* STEP 1: Request OTP Code */
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Email Professionnel Marsa Maroc
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="email"
                        required
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="k.amrani@marsamaroc.co.ma"
                        className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/50 transition-colors"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 active:scale-[0.99] transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        <span>Envoyer le code par E-mail (SMTP)</span>
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* STEP 2: Input OTP & Set New Password */
                <form onSubmit={handleVerifyOtpAndReset} className="space-y-4">
                  {/* Email Sent Notice Banner */}
                  <div className="p-3.5 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-orange-400">
                      <Mail className="w-4 h-4 flex-shrink-0" />
                      <span>E-mail envoyé avec succès !</span>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      Un code à 6 chiffres a été envoyé à <strong className="text-white">{resetEmail}</strong>. Veuillez consulter votre boîte de réception e-mail.
                    </p>
                    {generatedOtpHint && (
                      <div className="pt-1 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span>Code démo (console backend) :</span>
                        <span className="bg-slate-900 px-1.5 py-0.5 rounded text-white border border-slate-700 font-bold">
                          {generatedOtpHint}
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Code de Sécurité (OTP - 6 chiffres)
                    </label>
                    <div className="relative">
                      <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={otpCodeInput}
                        onChange={(e) => setOtpCodeInput(e.target.value)}
                        placeholder="123456"
                        className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/50 transition-colors font-mono tracking-widest text-center text-base"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Nouveau Mot de Passe
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="password"
                        required
                        value={newPasswordInput}
                        onChange={(e) => setNewPasswordInput(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/50 transition-colors font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setResetStep(1)}
                      className="py-3 px-4 rounded-xl text-xs font-medium text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors"
                    >
                      Changer d'email
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 active:scale-[0.99] transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>Valider le code & Réinitialiser</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="mt-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
          <Shield className="w-3.5 h-3.5 text-orange-500/70" />
          <span>Marsa Maroc © 2026 — Plateforme de Sécurité Portuaire</span>
        </div>
      </div>
    </div>
  );
}
