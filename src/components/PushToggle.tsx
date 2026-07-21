import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  aktifkanNotifikasi,
  matikanNotifikasi,
  pushDidukung,
  getVapidPublicKey,
  statusLangganan,
} from "@/lib/push";

/**
 * Tombol untuk mengaktifkan / mematikan notifikasi Web Push. Tersembunyi bila
 * browser tak mendukung atau VAPID public key belum dikonfigurasi.
 */
export function PushToggle() {
  const [siap, setSiap] = useState(false);
  const [berlangganan, setBerlangganan] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pushDidukung() || !getVapidPublicKey()) return;
    statusLangganan()
      .then((s) => {
        setSiap(true);
        setBerlangganan(s.berlangganan && s.izin === "granted");
      })
      .catch(() => undefined);
  }, []);

  if (!siap) return null;

  async function toggle() {
    setLoading(true);
    try {
      if (berlangganan) {
        await matikanNotifikasi();
        setBerlangganan(false);
        toast.success("Notifikasi dimatikan.");
      } else {
        await aktifkanNotifikasi();
        setBerlangganan(true);
        toast.success("Notifikasi aktif. Anda akan diberi tahu soal pinjaman & reservasi.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengubah notifikasi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={toggle} disabled={loading} title="Notifikasi push">
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : berlangganan ? (
        <Bell className="h-4 w-4" />
      ) : (
        <BellOff className="h-4 w-4" />
      )}
      <span className="ml-2 hidden sm:inline">
        {berlangganan ? "Notifikasi aktif" : "Aktifkan notifikasi"}
      </span>
    </Button>
  );
}
