import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Role = "super_admin" | "admin" | "admin_sementara" | "mahasiswa";

export const ROLE_PRIORITY: Role[] = ["super_admin", "admin", "admin_sementara", "mahasiswa"];
export const STAFF_ROLES: Role[] = ["super_admin", "admin", "admin_sementara"];

export type Profile = {
  id: string;
  email: string | null;
  nama: string | null;
  nim: string | null;
  prodi: string | null;
  is_profile_completed: boolean;
};

// Menentukan peran tertinggi yang MASIH BERLAKU (mengabaikan admin_sementara
// yang sudah kedaluwarsa), konsisten dengan has_role()/is_staff() di DB.
function pilihRole(rows: { role: string; expires_at: string | null }[] | null): Role | null {
  if (!rows) return null;
  const now = Date.now();
  const aktif = rows
    .filter((x) => !x.expires_at || new Date(x.expires_at).getTime() > now)
    .map((x) => x.role as Role);
  return ROLE_PRIORITY.find((x) => aktif.includes(x)) ?? "mahasiswa";
}

export async function fetchMyRole(userId: string): Promise<Role | null> {
  const { data } = await supabase
    .from("user_roles")
    .select("role, expires_at")
    .eq("user_id", userId);
  return pilihRole(data);
}

async function fetchMe(): Promise<{ profile: Profile | null; role: Role | null }> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { profile: null, role: null };
  const [{ data: p }, { data: r }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
    supabase.from("user_roles").select("role, expires_at").eq("user_id", u.user.id),
  ]);
  return { profile: p as Profile | null, role: pilihRole(r) };
}

export function useMe() {
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    staleTime: 60_000,
  });
  const profile = data?.profile ?? null;
  const role = data?.role ?? null;
  const isStaff = !!role && STAFF_ROLES.includes(role);
  return { profile, role, isStaff, loading: isLoading };
}

export function fmtIDR(n: number | null | undefined) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n ?? 0);
}

export function fmtWITA(iso: string | null | undefined) {
  if (!iso) return "-";
  return (
    new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Makassar",
    }).format(new Date(iso)) + " WITA"
  );
}
