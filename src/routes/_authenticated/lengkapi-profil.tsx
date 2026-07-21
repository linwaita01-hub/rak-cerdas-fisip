import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandHeader } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/lengkapi-profil")({
  component: LengkapiProfil,
  head: () => ({ meta: [{ title: "Lengkapi Profil — Perpus FISIP ULM" }] }),
});

const PRODI = [
  "Ilmu Pemerintahan",
  "Ilmu Administrasi Publik",
  "Ilmu Administrasi Bisnis",
  "Ilmu Komunikasi",
  "Sosiologi",
  "Hubungan Internasional",
];

function LengkapiProfil() {
  const navigate = useNavigate();
  const [nama, setNama] = useState("");
  const [nim, setNim] = useState("");
  const [prodi, setProdi] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (data) {
        setNama(data.nama ?? "");
        setNim(data.nim ?? "");
        setProdi(data.prodi ?? "");
      }
      setLoading(false);
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (nama.trim().length < 3) return toast.error("Nama minimal 3 karakter.");
    if (!/^\d{6,15}$/.test(nim)) return toast.error("NIM harus 6–15 digit angka.");
    if (!prodi) return toast.error("Pilih program studi.");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("profiles").update({
      nama: nama.trim(), nim, prodi, is_profile_completed: true,
    }).eq("id", u.user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profil tersimpan.");
    navigate({ to: "/app" });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-secondary/40 to-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <BrandHeader subtitle="Lengkapi profil mahasiswa" />
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nama">Nama lengkap</Label>
                <Input id="nama" value={nama} onChange={(e) => setNama(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nim">NIM</Label>
                <Input id="nim" inputMode="numeric" value={nim} onChange={(e) => setNim(e.target.value.replace(/\D/g, ""))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prodi">Program Studi</Label>
                <select
                  id="prodi"
                  value={prodi}
                  onChange={(e) => setProdi(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  required
                >
                  <option value="">-- Pilih program studi --</option>
                  {PRODI.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan & lanjutkan
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
