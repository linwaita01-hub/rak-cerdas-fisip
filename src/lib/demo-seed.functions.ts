import { createServerFn } from "@tanstack/react-start";

type DemoAccount = {
  email: string;
  password: string;
  role: "admin" | "mahasiswa";
  nama: string;
  nim?: string;
  prodi?: string;
};

const DEMO: DemoAccount[] = [
  { email: "admin.demo@fisip.ulm.ac.id", password: "AdminDemo#2026", role: "admin", nama: "Admin Demo Perpustakaan" },
  { email: "mahasiswa.demo@fisip.ulm.ac.id", password: "MhsDemo#2026", role: "mahasiswa", nama: "Mahasiswa Demo", nim: "2110000001", prodi: "Ilmu Pemerintahan" },
];

export const seedDemoAccounts = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const results: { email: string; created: boolean }[] = [];

  for (const acc of DEMO) {
    // Cari user existing
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users.find((u) => u.email?.toLowerCase() === acc.email.toLowerCase());
    let userId = existing?.id;

    if (!existing) {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: acc.email,
        password: acc.password,
        email_confirm: true,
        user_metadata: { nama: acc.nama },
      });
      if (error) throw new Error(`Gagal membuat ${acc.email}: ${error.message}`);
      userId = data.user?.id;
    }
    if (!userId) continue;

    // Update profil
    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email: acc.email,
      nama: acc.nama,
      nim: acc.nim ?? null,
      prodi: acc.prodi ?? null,
      is_profile_completed: true,
    });

    // Set role (hapus role lain, tambahkan yang sesuai)
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: acc.role });

    results.push({ email: acc.email, created: !existing });
  }

  // Jangan pernah kirim password ke klien.
  return {
    ok: true,
    accounts: DEMO.map((d) => ({ email: d.email, role: d.role })),
    results,
  };
});
