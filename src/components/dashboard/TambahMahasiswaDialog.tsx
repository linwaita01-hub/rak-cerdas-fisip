import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { tambahMahasiswa } from "@/lib/perpus.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

const PRODI = [
  "Ilmu Pemerintahan",
  "Ilmu Administrasi Publik",
  "Ilmu Administrasi Bisnis",
  "Ilmu Komunikasi",
  "Sosiologi",
  "Hubungan Internasional",
];

export type MahasiswaBaru = {
  id: string;
  nama: string;
  nim: string;
  prodi: string;
  email: string;
  sandi: string;
};

export function TambahMahasiswaDialog({
  onCreated,
}: {
  onCreated?: (m: MahasiswaBaru) => void;
}) {
  const tambah = useServerFn(tambahMahasiswa);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nama, setNama] = useState("");
  const [nim, setNim] = useState("");
  const [prodi, setProdi] = useState("");
  const [busy, setBusy] = useState(false);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (nama.trim().length < 3) return toast.error("Nama minimal 3 karakter.");
    if (!/^\d{6,15}$/.test(nim)) return toast.error("NIM harus 6–15 digit angka.");
    if (!prodi) return toast.error("Pilih program studi.");
    setBusy(true);
    try {
      const m = (await tambah({
        data: { nama: nama.trim(), nim, prodi },
      })) as MahasiswaBaru;
      toast.success(`Data mahasiswa ${m.nama} berhasil ditambahkan.`);
      qc.invalidateQueries({ queryKey: ["mhs-list"] });
      onCreated?.(m);
      setOpen(false);
      setNama("");
      setNim("");
      setProdi("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menambahkan mahasiswa.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="icon" variant="outline" aria-label="Tambah mahasiswa baru">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah data mahasiswa</DialogTitle>
          <DialogDescription>
            Tambahkan data mahasiswa untuk keperluan pencatatan peminjaman buku.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={simpan} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="tm-nama" className="text-xs">
              Nama lengkap
            </Label>
            <Input id="tm-nama" value={nama} onChange={(e) => setNama(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tm-nim" className="text-xs">
              NIM
            </Label>
            <Input
              id="tm-nim"
              inputMode="numeric"
              value={nim}
              onChange={(e) => setNim(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tm-prodi" className="text-xs">
              Program studi
            </Label>
            <select
              id="tm-prodi"
              value={prodi}
              onChange={(e) => setProdi(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              required
            >
              <option value="">-- Pilih program studi --</option>
              {PRODI.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan mahasiswa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
