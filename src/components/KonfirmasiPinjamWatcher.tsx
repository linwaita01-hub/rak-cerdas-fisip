import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { KONFIRMASI_DETIK } from "@/lib/pinjam";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Pending = {
  id: string;
  tanggal_pengajuan: string;
  durasi_hari: number | null;
  buku: { judul: string | null; kode_buku: string | null } | null;
};

/**
 * Memantau permintaan peminjaman "di meja" untuk mahasiswa saat ini. Saat admin
 * memindai buku & memilih mahasiswa, muncul baris peminjaman berstatus
 * 'menunggu' → dialog konfirmasi tampil di sini (realtime) dengan hitung mundur.
 *  - "Ya, benar saya"  → rpc konfirmasi_peminjaman → dipinjam.
 *  - "Bukan saya" / waktu habis → rpc batalkan_peminjaman_meja → dibatalkan.
 */
export function KonfirmasiPinjamWatcher() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [pending, setPending] = useState<Pending | null>(null);
  const [sisa, setSisa] = useState(KONFIRMASI_DETIK);
  const [busy, setBusy] = useState(false);
  const acting = useRef(false);

  const muat = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("peminjaman")
      .select("id, tanggal_pengajuan, durasi_hari, buku:buku_id(judul, kode_buku)")
      .eq("user_id", user.id)
      .eq("status", "menunggu")
      .order("tanggal_pengajuan", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) {
      setPending(null);
      return;
    }
    const lewat = (Date.now() - new Date(data.tanggal_pengajuan).getTime()) / 1000;
    if (lewat >= KONFIRMASI_DETIK) {
      setPending(null);
      return;
    }
    setPending(data as unknown as Pending);
    setSisa(Math.max(1, Math.ceil(KONFIRMASI_DETIK - lewat)));
  }, [user]);

  // Muat awal + langganan realtime perubahan peminjaman milik user.
  useEffect(() => {
    if (!user) return;
    muat();
    const ch = supabase
      .channel(`konfirmasi-pinjam-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "peminjaman", filter: `user_id=eq.${user.id}` },
        () => muat(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, muat]);

  const batalkan = useCallback(
    async (alasan: string, diam = false) => {
      if (!pending || acting.current) return;
      acting.current = true;
      setBusy(true);
      try {
        await supabase.rpc("batalkan_peminjaman_meja", { _id: pending.id, _alasan: alasan });
        if (!diam) toast.message("Permintaan peminjaman dibatalkan.");
      } catch {
        /* diabaikan */
      } finally {
        setPending(null);
        setBusy(false);
        acting.current = false;
        qc.invalidateQueries({ queryKey: ["pinjaman-saya"] });
      }
    },
    [pending, qc],
  );

  // Hitung mundur; habis → batal otomatis.
  useEffect(() => {
    if (!pending) return;
    setSisa(() => {
      const lewat = (Date.now() - new Date(pending.tanggal_pengajuan).getTime()) / 1000;
      return Math.max(0, Math.ceil(KONFIRMASI_DETIK - lewat));
    });
    const t = setInterval(() => {
      const lewat = (Date.now() - new Date(pending.tanggal_pengajuan).getTime()) / 1000;
      const s = Math.max(0, Math.ceil(KONFIRMASI_DETIK - lewat));
      setSisa(s);
      if (s <= 0) {
        clearInterval(t);
        batalkan("Kedaluwarsa: tidak dikonfirmasi", true);
      }
    }, 500);
    return () => clearInterval(t);
  }, [pending, batalkan]);

  async function konfirmasi() {
    if (!pending || acting.current) return;
    acting.current = true;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("konfirmasi_peminjaman", { _id: pending.id });
      if (error) throw new Error(error.message);
      toast.success("Peminjaman dikonfirmasi. Selamat membaca!");
      setPending(null);
      qc.invalidateQueries({ queryKey: ["pinjaman-saya"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengonfirmasi.");
    } finally {
      setBusy(false);
      acting.current = false;
    }
  }

  if (!pending) return null;

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Konfirmasi peminjaman
          </DialogTitle>
          <DialogDescription>
            Petugas mengajukan peminjaman buku ini atas nama Anda. Benar Anda yang meminjam?
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 p-3">
          <p className="font-medium">{pending.buku?.judul ?? "Buku"}</p>
          <p className="text-xs text-muted-foreground">
            Kode: {pending.buku?.kode_buku ?? "—"} · Durasi {pending.durasi_hari ?? 7} hari
          </p>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Batal otomatis dalam <span className="font-semibold text-foreground">{sisa}</span> detik
        </p>

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => batalkan("Ditolak mahasiswa")}>
            Bukan saya
          </Button>
          <Button disabled={busy} onClick={konfirmasi}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ya, benar saya
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
