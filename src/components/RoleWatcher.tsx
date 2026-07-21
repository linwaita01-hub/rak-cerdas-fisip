import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchMyRole, ROLE_PRIORITY, type Role } from "@/hooks/useMe";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

const rank = (r: Role | null) => (r ? ROLE_PRIORITY.indexOf(r) : 99);
const labelRole = (r: Role | null) => (r ? r.replace("_", " ") : "-");

/**
 * Memantau perubahan peran akun saat ini via Supabase Realtime (tabel
 * user_roles). Saat peran BERUBAH:
 *  - Jika hak NAIK (mis. mahasiswa → admin), akses baru TIDAK langsung
 *    diberikan: pengguna wajib re-autentikasi (masukkan sandi) lebih dulu.
 *  - Jika hak turun/berubah lateral, UI langsung diperbarui (invalidasi useMe).
 *
 * Catatan: butuh tabel user_roles ada di publication supabase_realtime
 * (lihat migrasi 20260721120200_realtime_user_roles.sql).
 */
export function RoleWatcher() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const lastRole = useRef<Role | null>(null);
  const [pending, setPending] = useState<{ from: Role | null; to: Role | null } | null>(null);

  // Inisialisasi peran terakhir yang diketahui.
  useEffect(() => {
    if (!user) {
      lastRole.current = null;
      return;
    }
    fetchMyRole(user.id).then((r) => {
      lastRole.current = r;
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`user-roles-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${user.id}` },
        async () => {
          const newRole = await fetchMyRole(user.id);
          const prev = lastRole.current;
          if (rank(newRole) === rank(prev)) return;

          if (rank(newRole) < rank(prev)) {
            // Hak NAIK → wajib re-autentikasi sebelum akses diberikan.
            setPending({ from: prev, to: newRole });
            // sengaja belum invalidasi ["me"] dan belum update lastRole
          } else {
            // Hak TURUN / lateral → terapkan segera.
            lastRole.current = newRole;
            qc.invalidateQueries({ queryKey: ["me"] });
            toast.info(`Peran akun Anda diubah menjadi "${labelRole(newRole)}".`);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  async function applyReauth() {
    lastRole.current = pending?.to ?? null;
    setPending(null);
    await qc.invalidateQueries();
    toast.success("Terverifikasi. Hak akses baru aktif.");
  }

  async function cancelElevation() {
    setPending(null);
    await supabase.auth.signOut();
    toast.message("Anda keluar. Masuk kembali untuk menggunakan hak akses baru.");
    window.location.href = "/auth";
  }

  if (!pending) return null;
  return (
    <ReauthDialog
      email={user?.email ?? ""}
      to={pending.to}
      onSuccess={applyReauth}
      onCancel={cancelElevation}
    />
  );
}

function ReauthDialog({
  email,
  to,
  onSuccess,
  onCancel,
}: {
  email: string;
  to: Role | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error("Sandi salah. Coba lagi.");
      return;
    }
    onSuccess();
  }

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            Verifikasi diperlukan
          </DialogTitle>
          <DialogDescription>
            Hak akses akun Anda dinaikkan menjadi{" "}
            <span className="font-medium text-foreground">{labelRole(to)}</span>. Demi keamanan,
            masukkan sandi untuk mengaktifkan akses baru.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reauth-pass">Sandi</Label>
            <Input
              id="reauth-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Keluar
            </Button>
            <Button type="submit" disabled={loading || !password}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verifikasi & lanjutkan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
