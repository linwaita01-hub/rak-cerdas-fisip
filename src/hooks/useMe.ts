import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Role = "super_admin" | "admin" | "admin_sementara" | "mahasiswa";

export type Profile = {
  id: string;
  email: string | null;
  nama: string | null;
  nim: string | null;
  prodi: string | null;
  is_profile_completed: boolean;
};

export function useMe() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setLoading(false); return; }
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      ]);
      setProfile(p as Profile | null);
      const roles = (r ?? []).map((x) => x.role as Role);
      const priority: Role[] = ["super_admin", "admin", "admin_sementara", "mahasiswa"];
      setRole(priority.find((x) => roles.includes(x)) ?? "mahasiswa");
      setLoading(false);
    })();
  }, []);

  const isStaff = role === "super_admin" || role === "admin" || role === "admin_sementara";
  return { profile, role, isStaff, loading };
}

export function fmtIDR(n: number | null | undefined) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n ?? 0);
}

export function fmtWITA(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar",
  }).format(new Date(iso)) + " WITA";
}
