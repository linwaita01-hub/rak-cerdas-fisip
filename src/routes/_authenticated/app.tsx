import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandHeader } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, LogOut, BookOpen, ClipboardList, ScanLine, Users } from "lucide-react";
import { toast } from "sonner";

type Profile = {
  id: string;
  email: string | null;
  nama: string | null;
  nim: string | null;
  prodi: string | null;
  is_profile_completed: boolean;
};

type Role = "super_admin" | "admin" | "admin_sementara" | "mahasiswa";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppHome,
  head: () => ({ meta: [{ title: "Dasbor — Perpus FISIP ULM" }] }),
});

function AppHome() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
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

  useEffect(() => {
    if (!loading && profile && !profile.is_profile_completed && role === "mahasiswa") {
      navigate({ to: "/lengkapi-profil" });
    }
  }, [loading, profile, role, navigate]);

  async function onLogout() {
    await supabase.auth.signOut();
    toast.success("Berhasil keluar.");
    navigate({ to: "/auth" });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const isStaff = role === "super_admin" || role === "admin" || role === "admin_sementara";

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/30 to-background">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <BrandHeader />
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="mr-2 h-4 w-4" /> Keluar
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Halo, {profile?.nama ?? "Pengguna"} 👋</h2>
            <p className="text-sm text-muted-foreground">{profile?.email}</p>
          </div>
          <Badge variant="secondary" className="capitalize">{role?.replace("_", " ")}</Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isStaff ? (
            <>
              <FeatureCard icon={BookOpen} title="Kelola Buku & Eksemplar" desc="Tambah, ubah, cetak label barcode." to="/app" comingSoon />
              <FeatureCard icon={ClipboardList} title="Antrian Peminjaman" desc="Setujui pengajuan mahasiswa." to="/app" comingSoon />
              <FeatureCard icon={ScanLine} title="Scan Peminjaman / Kembali" desc="Scanner USB atau kamera HP." to="/app" comingSoon />
              <FeatureCard icon={Users} title="Kelola Pengguna" desc="Peran admin & mahasiswa." to="/app" comingSoon />
            </>
          ) : (
            <>
              <FeatureCard icon={BookOpen} title="Cari & Pinjam Buku" desc="Telusuri katalog perpustakaan FISIP." to="/app" comingSoon />
              <FeatureCard icon={ClipboardList} title="Peminjaman Saya" desc="Status pengajuan & jatuh tempo." to="/app" comingSoon />
              <FeatureCard icon={Users} title="Profil Saya" desc="NIM, program studi, dan kontak." to="/lengkapi-profil" />
            </>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          PART 1 — Fondasi & Auth selesai. Fitur katalog & peminjaman akan aktif pada PART berikutnya.
        </p>
      </main>
    </div>
  );
}

function FeatureCard({
  icon: Icon, title, desc, to, comingSoon,
}: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string; to: string; comingSoon?: boolean }) {
  return (
    <Card className="transition hover:border-primary/40 hover:shadow-md">
      <CardHeader>
        <div className="flex items-start justify-between">
          <Icon className="h-6 w-6 text-primary" />
          {comingSoon && <Badge variant="outline" className="text-[10px]">Segera</Badge>}
        </div>
        <CardTitle className="mt-3 text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{desc}</p>
        {!comingSoon && (
          <Button asChild size="sm" variant="link" className="mt-2 h-auto p-0">
            <Link to={to}>Buka →</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
