import { useState, useEffect } from "react";
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Shield,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Lock,
  Mail,
  User as UserIcon,
  Building,
  KeyRound,
  RefreshCw,
  Plus,
  X,
  Check,
} from "lucide-react";

export interface UserAccount {
  id: number;
  name: string;
  email: string;
  role: string;
  terminal: string;
  is_active: boolean;
  created_at: string;
  last_login: string;
}

const initialMockUsers: UserAccount[] = [
  {
    id: 1,
    name: "Khalid Amrani",
    email: "k.amrani@marsamaroc.co.ma",
    role: "Administrateur HSE",
    terminal: "Tous les Terminals",
    is_active: true,
    created_at: "2026-01-10 09:15:00",
    last_login: "Aujourd'hui à 14:32",
  },
  {
    id: 2,
    name: "Youssef El Mansouri",
    email: "superviseur.tc1@marsamaroc.co.ma",
    role: "Superviseur Portuaire",
    terminal: "Terminal 1 - Conteneurs",
    is_active: true,
    created_at: "2026-02-14 11:20:00",
    last_login: "Aujourd'hui à 11:05",
  },
  {
    id: 3,
    name: "Amine Bennis",
    email: "operateur.pc@marsamaroc.co.ma",
    role: "Opérateur PC",
    terminal: "Terminal 2 - Vrac",
    is_active: true,
    created_at: "2026-03-01 08:30:00",
    last_login: "Hier à 16:45",
  },
  {
    id: 4,
    name: "Sarra Bennani",
    email: "s.bennani@marsamaroc.co.ma",
    role: "Directeur Terminal",
    terminal: "Terminal 3 - Ro-Ro",
    is_active: true,
    created_at: "2026-04-12 14:10:00",
    last_login: "23/07/2026",
  },
  {
    id: 5,
    name: "Hassan Chraibi",
    email: "h.chraibi@marsamaroc.co.ma",
    role: "Officer HSE",
    terminal: "Terminal 1 - Conteneurs",
    is_active: false,
    created_at: "2026-05-18 10:00:00",
    last_login: "15/06/2026",
  },
];

export function UsersPage() {
  const [users, setUsers] = useState<UserAccount[]>(() => {
    const saved = localStorage.getItem("marsa_users_list");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return initialMockUsers;
  });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [terminalFilter, setTerminalFilter] = useState("All");

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editUser, setEditUser] = useState<UserAccount | null>(null);

  // New user form state
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("Officer HSE");
  const [newTerminal, setNewTerminal] = useState("Terminal 1 - Conteneurs");
  const [newPassword, setNewPassword] = useState("Marsa@2026");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // Persist users list locally so refreshing F5 never loses created users
  useEffect(() => {
    localStorage.setItem("marsa_users_list", JSON.stringify(users));
  }, [users]);

  // Fetch users from Flask Backend
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/users");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setUsers(data);
        }
      }
    } catch (err) {
      console.warn("Backend users fetch fallback to local list:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError("");
    setActionSuccess("");

    if (!newName || !newEmail) {
      setActionError("Le nom et l'email sont obligatoires.");
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          password: newPassword,
          role: newRole,
          terminal: newTerminal,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Échec de création de l'utilisateur");
      }

      setActionSuccess("Utilisateur créé avec succès !");
      setUsers((prev) => [data.user, ...prev]);
      setTimeout(() => {
        setShowAddModal(false);
        setNewName("");
        setNewEmail("");
        setActionSuccess("");
      }, 800);
    } catch (err: any) {
      // Local fallback creation
      const newUserObj: UserAccount = {
        id: Date.now(),
        name: newName,
        email: newEmail,
        role: newRole,
        terminal: newTerminal,
        is_active: true,
        created_at: new Date().toISOString().replace("T", " ").substring(0, 19),
        last_login: "Jamais",
      };
      setUsers((prev) => [newUserObj, ...prev]);
      setActionSuccess("Utilisateur ajouté à la liste !");
      setTimeout(() => {
        setShowAddModal(false);
        setNewName("");
        setNewEmail("");
        setActionSuccess("");
      }, 800);
    }
  };

  const handleToggleStatus = async (user: UserAccount) => {
    const updatedStatus = !user.is_active;
    try {
      await fetch(`http://localhost:5000/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: updatedStatus }),
      });
    } catch (err) {
      console.warn("Status update fallback:", err);
    }
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, is_active: updatedStatus } : u))
    );
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm("Voulez-vous vraiment supprimer cet utilisateur ?")) return;
    try {
      await fetch(`http://localhost:5000/api/users/${userId}`, { method: "DELETE" });
    } catch (err) {
      console.warn("Delete fallback:", err);
    }
    setUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    const matchesSearch = u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchesRole = roleFilter === "All" || u.role === roleFilter;
    const matchesTerminal = terminalFilter === "All" || u.terminal === terminalFilter;
    return matchesSearch && matchesRole && matchesTerminal;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl bg-card border border-border">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-orange-500" />
            <h1 className="text-lg font-bold text-foreground">Gestion des Utilisateurs Marsa Maroc</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Création de comptes d'habilitation, attribution des rôles et contrôle d'accès aux terminals.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="p-2 rounded-xl border border-border hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-md shadow-orange-500/20 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            Créer un Utilisateur
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-56">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou email pro..."
            className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2 text-xs text-foreground outline-none cursor-pointer"
        >
          <option value="All">Tous les Rôles</option>
          <option value="Administrateur HSE">Administrateur HSE</option>
          <option value="Officer HSE">Officer HSE</option>
          <option value="Superviseur Portuaire">Superviseur Portuaire</option>
          <option value="Directeur Terminal">Directeur Terminal</option>
          <option value="Opérateur PC">Opérateur PC</option>
        </select>
        <select
          value={terminalFilter}
          onChange={(e) => setTerminalFilter(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2 text-xs text-foreground outline-none cursor-pointer"
        >
          <option value="All">Tous les Terminals</option>
          <option value="Terminal 1 - Conteneurs">Terminal 1 - Conteneurs</option>
          <option value="Terminal 2 - Vrac">Terminal 2 - Vrac</option>
          <option value="Terminal 3 - Ro-Ro">Terminal 3 - Ro-Ro</option>
          <option value="Tous les Terminals">Tous les Terminals</option>
        </select>
        <div className="text-xs text-muted-foreground font-mono ml-auto">
          {filteredUsers.length} comptes trouvés
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[800px]">
            <thead>
              <tr className="border-b border-border bg-white/[0.02]">
                {["Utilisateur", "Rôle / Habilitation", "Terminal Affecté", "Statut", "Dernier Accès", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-xs flex-shrink-0" style={{ background: "#f97316" }}>
                        {u.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">{u.name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.terminal}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleStatus(u)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium cursor-pointer transition-opacity hover:opacity-80 ${
                        u.is_active ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? "bg-green-400" : "bg-red-400"}`} />
                      {u.is_active ? "Actif" : "Désactivé"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">{u.last_login}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className={`p-1.5 rounded-lg transition-colors ${u.is_active ? "hover:bg-red-500/10 text-red-400" : "hover:bg-green-500/10 text-green-400"}`}
                        title={u.is_active ? "Désactiver le compte" : "Activer le compte"}
                      >
                        {u.is_active ? <XCircle size={14} /> : <CheckCircle size={14} />}
                      </button>
                      <button
                        onClick={() => handleDeleteUser(u.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors"
                        title="Supprimer l'utilisateur"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Add User */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-orange-500" />
                <h3 className="text-base font-bold text-white">Créer un Nouveau Compte</h3>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                ⚠️ {actionError}
              </div>
            )}
            {actionSuccess && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
                ✅ {actionSuccess}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nom Complet</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Youssef El Mansouri"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Email Professionnel Marsa Maroc</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="nom@marsamaroc.co.ma"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Rôle / Habilitation</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none"
                  >
                    <option value="Administrateur HSE">Administrateur HSE</option>
                    <option value="Officer HSE">Officer HSE</option>
                    <option value="Superviseur Portuaire">Superviseur Portuaire</option>
                    <option value="Directeur Terminal">Directeur Terminal</option>
                    <option value="Opérateur PC">Opérateur PC</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Terminal Affecté</label>
                  <select
                    value={newTerminal}
                    onChange={(e) => setNewTerminal(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none"
                  >
                    <option value="Terminal 1 - Conteneurs">Terminal 1 - Conteneurs</option>
                    <option value="Terminal 2 - Vrac">Terminal 2 - Vrac</option>
                    <option value="Terminal 3 - Ro-Ro">Terminal 3 - Ro-Ro</option>
                    <option value="Tous les Terminals">Tous les Terminals</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Mot de passe temporaire</label>
                <input
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl text-white font-semibold bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600"
                >
                  Créer le Compte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
