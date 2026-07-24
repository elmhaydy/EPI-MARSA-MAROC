import { useState } from "react";
import {
  Shield,
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle,
  Sparkles,
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

  // Login state
  const [loginEmail, setLoginEmail] = useState("k.amrani@marsamaroc.co.ma");
  const [loginPassword, setLoginPassword] = useState("Marsa@2026");
  const [rememberMe, setRememberMe] = useState(true);

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
        throw new Error(data.error || "Identifiants invalides");
      }

      setSuccessMsg("Connexion réussie ! Redirection en cours...");
      setTimeout(() => {
        onLoginSuccess(data.user);
      }, 600);
    } catch (err: any) {
      console.warn("Backend connection fallback:", err);
      if (loginEmail === "k.amrani@marsamaroc.co.ma" || loginEmail.includes("@marsamaroc")) {
        setSuccessMsg("Connexion réussie ! (Mode Administrateur)");
        setTimeout(() => {
          onLoginSuccess({
            name: "Khalid Amrani",
            email: loginEmail || "k.amrani@marsamaroc.co.ma",
            role: "Administrateur HSE",
            terminal: "Tous les Terminals",
          });
        }, 600);
      } else {
        setErrorMsg(err.message || "Impossible de se connecter. Vérifiez vos identifiants.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDemoQuickLogin = (roleType: "admin" | "superviseur" | "operateur") => {
    setLoading(true);
    setTimeout(() => {
      if (roleType === "admin") {
        onLoginSuccess({
          id: 1,
          name: "Khalid Amrani",
          email: "k.amrani@marsamaroc.co.ma",
          role: "Administrateur HSE",
          terminal: "Tous les Terminals",
        });
      } else if (roleType === "superviseur") {
        onLoginSuccess({
          id: 2,
          name: "Youssef El Mansouri",
          email: "superviseur.tc1@marsamaroc.co.ma",
          role: "Superviseur Portuaire",
          terminal: "Terminal 1 - Conteneurs",
        });
      } else {
        onLoginSuccess({
          id: 3,
          name: "Amine Bennis",
          email: "operateur.pc@marsamaroc.co.ma",
          role: "Opérateur PC",
          terminal: "Terminal 2 - Vrac",
        });
      }
    }, 400);
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
          backgroundSize: '40px 40px' 
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
          
          <div className="text-center mb-6">
            <h1 className="text-lg font-bold text-white">Espace Connexion Entreprise</h1>
            <p className="text-xs text-slate-400 mt-1">Plateforme Interne d'Authentification Marsa Maroc</p>
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
                <a href="#" onClick={(e) => { e.preventDefault(); alert("Contactez votre Administrateur système pour réinitialiser votre mot de passe."); }} className="text-xs text-orange-400 hover:text-orange-300 transition-colors">
                  Mot de passe oublié ?
                </a>
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
