import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { tambahMahasiswa } from "@/lib/perpus.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComp } from "@/components/ui/calendar";
import { Loader2, Plus, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PRODI = [
  "Ilmu Pemerintahan",
  "Ilmu Administrasi Publik",
  "Ilmu Administrasi Bisnis",
  "Ilmu Komunikasi",
  "Sosiologi",
  "Antropologi",
  "Geografi",
];

export type MahasiswaBaru = {
  id: string;
  nama: string;
  nim: string;
  prodi: string;
  email: string;
};

function fmtTgl(d: Date | undefined) {
  if (!d) return "";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(d);
}

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
  const [tempatLahir, setTempatLahir] = useState("");
  const [tanggalLahir, setTanggalLahir] = useState<Date | undefined>();
  const [alamat, setAlamat] = useState("");
  const [noTelp, setNoTelp] = useState("");
  const [busy, setBusy] = useState(false);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (nama.trim().length < 3) return toast.error("Nama minimal 3 karakter.");
    if (!/^\d{6,15}$/.test(nim)) return toast.error("NIM harus 6–15 digit angka.");
    if (!prodi) return toast.error("Pilih program studi.");
    setBusy(true);
    try {
      const m = (await tambah({
        data: {
          nama: nama.trim(),
          nim,
          prodi,
          tempat_lahir: tempatLahir.trim() || null,
          tanggal_lahir: tanggalLahir ? tanggalLahir.toISOString().slice(0, 10) : null,
          alamat: alamat.trim() || null,
          no_telp: noTelp.trim() || null,
        },
      })) as MahasiswaBaru;
      toast.success(`Data mahasiswa ${m.nama} berhasil ditambahkan.`);
      qc.invalidateQueries({ queryKey: ["mhs-list"] });
      onCreated?.(m);
      setOpen(false);
      setNama("");
      setNim("");
      setProdi("");
      setTempatLahir("");
      setTanggalLahir(undefined);
      setAlamat("");
      setNoTelp("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menambahkan mahasiswa.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Plus className="mr-1 h-4 w-4" /> Tambah mahasiswa
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tambah data mahasiswa</DialogTitle>
          <DialogDescription>
            Wajib: nama, NIM, prodi. Field lainnya opsional.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={simpan} className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="tm-nama" className="text-xs">Nama lengkap *</Label>
            <Input id="tm-nama" value={nama} onChange={(e) => setNama(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tm-nim" className="text-xs">NIM *</Label>
            <Input
              id="tm-nim"
              inputMode="numeric"
              value={nim}
              onChange={(e) => setNim(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tm-prodi" className="text-xs">Program studi *</Label>
            <select
              id="tm-prodi"
              value={prodi}
              onChange={(e) => setProdi(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              required
            >
              <option value="">-- Pilih program studi --</option>
              {PRODI.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tm-tempat" className="text-xs">Tempat lahir</Label>
            <Input id="tm-tempat" value={tempatLahir} onChange={(e) => setTempatLahir(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tanggal lahir</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !tanggalLahir && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {tanggalLahir ? fmtTgl(tanggalLahir) : "Pilih tanggal"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComp
                  mode="single"
                  selected={tanggalLahir}
                  onSelect={setTanggalLahir}
                  captionLayout="dropdown"
                  fromYear={1950}
                  toYear={new Date().getFullYear()}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="tm-alamat" className="text-xs">Alamat</Label>
            <Textarea id="tm-alamat" value={alamat} onChange={(e) => setAlamat(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="tm-telp" className="text-xs">No. Telepon</Label>
            <Input
              id="tm-telp"
              inputMode="tel"
              value={noTelp}
              onChange={(e) => setNoTelp(e.target.value)}
              placeholder="08xx"
            />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan mahasiswa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
