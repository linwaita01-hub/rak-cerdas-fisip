import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { seedDemoAccounts } from "@/lib/demo-seed.functions";
import { BrandHeader } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [{ title: "Masuk — Perpus FISIP ULM" }],
  }),
});

// Seed akun demo sekali secara DIAM-DIAM (kredensial TIDAK ditampilkan di web).
let demoSeeded = false;

function AuthPage() {
  const navigate = useNavigate();
  const seedDemo = useServerFn(seedDemoAccounts);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
  }, [navigate]);
  useEffect(() => {
    if (demoSeeded) return;
    demoSeeded = true;
    // Pastikan akun demo tersedia tanpa menampilkan email/sandi di UI.
    seedDemo({}).catch(() => {});
  }, [seedDemo]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-secondary/40 to-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <BrandHeader />
        <Card className="border-primary/10 shadow-lg">
          <CardContent className="pt-6">
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="login">Masuk</TabsTrigger>
                <TabsTrigger value="register">Daftar</TabsTrigger>
                <TabsTrigger value="forgot">Lupa</TabsTrigger>
              </TabsList>
              <TabsContent value="login"><LoginForm /></TabsContent>
              <TabsContent value="register"><RegisterForm /></TabsContent>
              <TabsContent value="forgot"><ForgotForm /></TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:underline">← Kembali ke beranda</Link>
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message === "Invalid login credentials" ? "Email atau sandi salah." : error.message);
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

function RegisterForm() {
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Konfirmasi sandi tidak sama.");
      return;
    }
    if (password.length < 8) {
      toast.error("Sandi minimal 8 karakter.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        data: { nama },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Pendaftaran berhasil. Cek email untuk verifikasi sebelum masuk.");
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="reg-nama">Nama lengkap</Label>
        <Input id="reg-nama" value={nama} onChange={(e) => setNama(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-email">Email</Label>
        <Input id="reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-pass">Sandi (min. 8 karakter)</Label>
        <PasswordInput id="reg-pass" value={password} onChange={setPassword} autoComplete="new-password" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-conf">Konfirmasi sandi</Label>
        <PasswordInput id="reg-conf" value={confirm} onChange={setConfirm} autoComplete="new-password" />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Daftar sebagai mahasiswa
      </Button>
      <p className="text-xs text-muted-foreground">
        Verifikasi email diperlukan. Anda akan diminta melengkapi NIM & program studi setelah masuk.
      </p>
    </form>
  );
}

function ForgotForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Tautan reset sandi telah dikirim ke email Anda.");
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fp-email">Email terdaftar</Label>
        <Input id="fp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Kirim tautan reset
      </Button>
    </form>
  );
}
