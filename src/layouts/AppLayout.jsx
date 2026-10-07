import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import { supabase } from "../lib/supabase.js";

export default function AppLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState(undefined);
  useEffect(() => {
    if (!supabase) { setUser(null); return undefined; }
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => listener.subscription.unsubscribe();
  }, []);
  if (user === undefined) return <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-gray-500">Проверяем вход…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  async function logout() { await supabase.auth.signOut(); navigate("/auth"); }
  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar />
      <main className="min-w-0 flex-1 px-10 py-8">
        <div className="mb-5 flex justify-end gap-3 text-xs text-gray-500"><span>{user.email}</span><button onClick={logout} className="font-semibold text-accent-600 hover:underline">Выйти</button></div>
        <Outlet />
      </main>
    </div>
  );
}
