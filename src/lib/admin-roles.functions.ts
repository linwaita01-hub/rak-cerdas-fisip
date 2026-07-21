import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type SB = SupabaseClient<Database>;

// Operasi ber-hak istimewa (elevasi/penurunan peran) dijalankan di server
// dengan service_role (supabaseAdmin) SETELAH memverifikasi pemanggil adalah
// super_admin. Ini menutup celah: RLS user_roles_staff_manage terlalu longgar
// (mengizinkan admin biasa mengelola peran). Verifikasi super_admin dilakukan
// eksplisit di sini, bukan mengandalkan RLS.

async function ensureSuperAdmin(context: { supabase: SB; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "super_admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Hanya super admin yang dapat mengelola peran admin sementara.");
}

// Daftar admin sementara aktif + sisa waktu (dibaca via service_role agar
// lengkap; tetap digate super_admin).
export const daftarAdminSementara = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role, expires_at, created_at")
      .eq("role", "admin_sementara")
      .order("expires_at", { ascending: true });
    if (error) throw new Error(error.message);

    const ids = (roles ?? []).map((r) => r.user_id);
    let profilById = new Map<
      string,
      { nama: string | null; nim: string | null; email: string | null }
    >();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, nama, nim, email")
        .in("id", ids);
      profilById = new Map(
        (profs ?? []).map((p) => [p.id, { nama: p.nama, nim: p.nim, email: p.email }]),
      );
    }
    return (roles ?? []).map((r) => ({
      user_id: r.user_id,
      expires_at: r.expires_at,
      created_at: r.created_at,
      profil: profilById.get(r.user_id) ?? { nama: null, nim: null, email: null },
    }));
  });

// Angkat akun menjadi admin_sementara dengan tanggal kedaluwarsa.
export const angkatAdminSementara = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        user_id: z.string().uuid(),
        hari: z.number().int().min(1).max(365),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context);
    if (data.user_id === context.userId) {
      throw new Error("Tidak dapat mengubah peran akun Anda sendiri.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Jangan menurunkan super_admin lain menjadi sementara.
    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id);
    if ((existing ?? []).some((r) => r.role === "super_admin")) {
      throw new Error(
        "Akun tersebut adalah super admin dan tidak dapat dijadikan admin sementara.",
      );
    }

    const expiresAt = new Date(Date.now() + data.hari * 86400000).toISOString();
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: data.user_id, role: "admin_sementara", expires_at: expiresAt },
        { onConflict: "user_id,role" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, expires_at: expiresAt };
  });

// Cabut peran admin_sementara dari sebuah akun.
export const cabutAdminSementara = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", "admin_sementara");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
