import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandHeader } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const AUTH_URL = "https://rak-cerdas-fisip.lovable.app/auth";
const AUTH_TITLE = "Masuk — Perpus FISIP ULM";
const AUTH_DESC = "Halaman masuk sistem peminjaman buku Perpustakaan FISIP ULM untuk mahasiswa dan petugas.";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: AUTH_TITLE },
      { name: "description", content: AUTH_DESC },
      { property: "og:title", content: AUTH_TITLE },
      { property: "og:description", content: AUTH_DESC },
      { property: "og:url", content: AUTH_URL },
      { name: "twitter:title", content: AUTH_TITLE },
      { name: "twitter:description", content: AUTH_DESC },
      { name: "robots", content: "noindex,follow" },
    ],
    links: [{ rel: "canonical", href: AUTH_URL }],
  }),
});

function AuthPage() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
  }, [navigate]);


  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-secondary/40 to-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <BrandHeader />
        <Card className="border-primary/10 shadow-lg">
          <CardContent className="pt-6">
            <LoginForm />
            <p className="mt-4 text-xs text-muted-foreground">
              Akun dibuatkan oleh petugas perpustakaan. Hubungi petugas jika Anda belum memiliki akun atau lupa sandi.
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:underline">← Kembali ke beranda Perpustakaan FISIP ULM</Link>
        </p>
      </div>
    </main>
  );
}

function PasswordInput({ value, onChange, id, autoComplete }: { value: string; onChange: (v: string) => void; id: string; autoComplete?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
        aria-label={show ? "Sembunyikan sandi" : "Lihat sandi"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function LoginForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Login bisa gagal karena jaringan/service worker basi ("Failed to fetch").
    // Coba ulang sekali sebelum menampilkan pesan agar tidak mengganggu petugas.
    let error = (await supabase.auth.signInWithPassword({ email, password })).error;
    if (error && /failed to fetch|network|load failed/i.test(error.message)) {
      await new Promise((r) => setTimeout(r, 800));
      error = (await supabase.auth.signInWithPassword({ email, password })).error;
    }
    setLoading(false);
    if (error) {
      const pesan = /failed to fetch|network|load failed/i.test(error.message)
        ? "Gagal menghubungi server. Periksa koneksi internet lalu muat ulang halaman (Ctrl+Shift+R)."
        : error.message === "Invalid login credentials"
          ? "Email atau sandi salah."
          : error.message;
      toast.error(pesan);
      return;
    }
    toast.success("Berhasil masuk.");
    navigate({ to: "/app" });
  }


  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="login-email">Email</Label>
        <Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-pass">Sandi</Label>
        <PasswordInput id="login-pass" value={password} onChange={setPassword} autoComplete="current-password" />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Masuk
      </Button>
    </form>
  );
}
