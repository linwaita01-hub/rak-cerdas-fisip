import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Plus,
  Printer,
  Trash2,
  Search,
  RefreshCw,
  Table2,
  Clock,
  BookOpen,
  ScanLine,
  Send,
} from "lucide-react";
import { KONFIRMASI_DETIK } from "@/lib/pinjam";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ExportBukuButton,
  ImportBukuButton,
  HistoryButton,
  TabSampah,
} from "@/components/dashboard/InventoryTools";
import { toast } from "sonner";
import { Barcode } from "@/components/Barcode";
import { BarcodeScannerInput } from "@/components/BarcodeScannerInput";
import { fmtIDR, fmtWITA, useMe } from "@/hooks/useMe";
import { AdminSementaraPanel } from "@/components/dashboard/AdminSementaraPanel";
import {
  mulaiPeminjamanMeja,
  kembalikanBarcode,
  bayarDenda,
  bebaskanDenda,
  simpanBuku,
  hapusBuku,
  tambahEksemplar,
  hapusEksemplar,
  ubahStatusEksemplar,
  simpanPengaturan,
  jalankanSweepTerlambat,
} from "@/lib/perpus.functions";

export function StaffDashboard() {
  const { role } = useMe();
  const isSuperAdmin = role === "super_admin";
  return (
    <Tabs defaultValue="transaksi" className="w-full">
      <TabsList className={`grid w-full ${isSuperAdmin ? "grid-cols-6" : "grid-cols-5"} sm:w-auto`}>
        <TabsTrigger value="transaksi">Transaksi</TabsTrigger>
        <TabsTrigger value="inventaris">Inventaris</TabsTrigger>
        <TabsTrigger value="mahasiswa">Mahasiswa</TabsTrigger>
        <TabsTrigger value="sampah">Sampah</TabsTrigger>
        <TabsTrigger value="pengaturan">Pengaturan</TabsTrigger>
        {isSuperAdmin && <TabsTrigger value="super">Super Admin</TabsTrigger>}
      </TabsList>
      <TabsContent value="transaksi" className="mt-4">
        <TabTransaksi />
      </TabsContent>
      <TabsContent value="inventaris" className="mt-4">
        <TabInventaris />
      </TabsContent>
      <TabsContent value="mahasiswa" className="mt-4">
        <TabMahasiswa />
      </TabsContent>
      <TabsContent value="sampah" className="mt-4">
        <TabSampah />
      </TabsContent>
      <TabsContent value="pengaturan" className="mt-4">
        <TabPengaturan />
      </TabsContent>
      {isSuperAdmin && (
        <TabsContent value="super" className="mt-4">
          <AdminSementaraPanel />
        </TabsContent>
      )}
    </Tabs>
  );
}

// ============= TAB TRANSAKSI =============
function TabTransaksi() {
  const qc = useQueryClient();
  const kembalikan = useServerFn(kembalikanBarcode);
  const bayar = useServerFn(bayarDenda);
  const bebaskan = useServerFn(bebaskanDenda);
  const sweep = useServerFn(jalankanSweepTerlambat);

  // Realtime refresh
  useEffect(() => {
    const ch = supabase
      .channel("staff-transaksi")
      .on("postgres_changes", { event: "*", schema: "public", table: "peminjaman" }, () => {
        qc.invalidateQueries({ queryKey: ["menunggu-konfirmasi"] });
        qc.invalidateQueries({ queryKey: ["pinjaman-aktif"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "denda" }, () => {
        qc.invalidateQueries({ queryKey: ["denda-list"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const menunggu = useQuery({
    queryKey: ["menunggu-konfirmasi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("peminjaman")
        .select("*, buku:buku_id(id,judul,kode_buku), profil:user_id(id,nama,nim,prodi)")
        .eq("status", "menunggu")
        .order("tanggal_pengajuan", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const aktif = useQuery({
    queryKey: ["pinjaman-aktif"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("peminjaman")
        .select(
          "*, buku:buku_id(id,judul), eksemplar:eksemplar_id(id,kode_eksemplar,barcode_value), profil:user_id(id,nama,nim)",
        )
        .in("status", ["dipinjam", "terlambat"])
        .order("tanggal_jatuh_tempo", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const dendaList = useQuery({
    queryKey: ["denda-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("denda")
        .select("*, peminjaman:peminjaman_id(id, buku:buku_id(judul), profil:user_id(nama,nim))")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <PinjamMejaCard />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Pengembalian (scan barcode)</CardTitle>
        </CardHeader>
        <CardContent>
          <BarcodeScannerInput
            placeholder="Scan barcode eksemplar untuk pengembalian…"
            onScan={async (code) => {
              try {
                const res = await kembalikan({ data: { barcode: code } });
                toast.success(
                  res.denda
                    ? `Kembali. Denda: ${fmtIDR(Number(res.denda.jumlah))}`
                    : "Buku dikembalikan.",
                );
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Gagal.");
              }
            }}
          />
          <div className="mt-4 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const r = await sweep({});
                toast.success(
                  `Sweep selesai. ${r.diperiksa} pinjaman diperiksa, ${r.reservasi_kadaluarsa} reservasi kadaluarsa.`,
                );
                qc.invalidateQueries();
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Cek keterlambatan
            </Button>
          </div>
        </CardContent>
      </Card>

      <MenungguKonfirmasiCard
        rows={(menunggu.data ?? []) as unknown as MenungguRow[]}
        loading={menunggu.isLoading}
      />

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">
            Peminjaman aktif & terlambat ({aktif.data?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mahasiswa</TableHead>
                <TableHead>Buku</TableHead>
                <TableHead>Eksemplar</TableHead>
                <TableHead>Jatuh tempo</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aktif.data?.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm">
                    {p.profil?.nama}{" "}
                    <span className="text-muted-foreground">({p.profil?.nim})</span>
                  </TableCell>
                  <TableCell className="text-sm">{p.buku?.judul}</TableCell>
                  <TableCell className="font-mono text-xs">{p.eksemplar?.kode_eksemplar}</TableCell>
                  <TableCell className="text-sm">{fmtWITA(p.tanggal_jatuh_tempo)}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "terlambat" ? "destructive" : "secondary"}>
                      {p.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!aktif.data?.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    Tidak ada peminjaman aktif.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Denda</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mahasiswa</TableHead>
                <TableHead>Buku</TableHead>
                <TableHead>Jumlah</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Dihitung</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dendaList.data?.map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell className="text-sm">{d.peminjaman?.profil?.nama}</TableCell>
                  <TableCell className="text-sm">{d.peminjaman?.buku?.judul}</TableCell>
                  <TableCell>{fmtIDR(Number(d.jumlah))}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        d.status === "belum_bayar"
                          ? "destructive"
                          : d.status === "lunas"
                            ? "default"
                            : "outline"
                      }
                    >
                      {d.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{fmtWITA(d.tanggal_dihitung)}</TableCell>
                  <TableCell className="text-right">
                    {d.status === "belum_bayar" && (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              await bayar({ data: { id: d.id } });
                              toast.success("Ditandai lunas.");
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Gagal.");
                            }
                          }}
                        >
                          Lunas
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              await bebaskan({ data: { id: d.id } });
                              toast.success("Dibebaskan.");
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Gagal.");
                            }
                          }}
                        >
                          Bebaskan
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!dendaList.data?.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Belum ada denda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Kartu: Pinjam di meja (scan → pilih mahasiswa → kirim konfirmasi) ----
function PinjamMejaCard() {
  const qc = useQueryClient();
  const mulai = useServerFn(mulaiPeminjamanMeja);
  const [barcode, setBarcode] = useState("");
  const [buku, setBuku] = useState<{ judul: string; kode: string; status: string } | null>(null);
  const [cari, setCari] = useState("");
  const [terpilih, setTerpilih] = useState<{
    id: string;
    nama: string | null;
    nim: string | null;
  } | null>(null);
  const [durasi, setDurasi] = useState(7);
  const [busy, setBusy] = useState(false);

  async function onScan(code: string) {
    setBarcode(code);
    const { data } = await supabase
      .from("eksemplar")
      .select("status, buku:buku_id(judul, kode_buku)")
      .eq("barcode_value", code)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) {
      setBuku(null);
      toast.error("Barcode eksemplar tidak dikenali.");
      return;
    }
    const b = data.buku as unknown as { judul: string | null; kode_buku: string | null } | null;
    setBuku({ judul: b?.judul ?? "—", kode: b?.kode_buku ?? "—", status: data.status });
  }

  const hasil = useQuery({
    queryKey: ["cari-peminjam", cari],
    enabled: cari.trim().length >= 2,
    queryFn: async () => {
      const s = cari.trim().replace(/[%,]/g, "");
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nama, nim, prodi")
        .or(`nama.ilike.%${s}%,nim.ilike.%${s}%,email.ilike.%${s}%`)
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function kirim() {
    if (!barcode || !terpilih) return;
    setBusy(true);
    try {
      const r = await mulai({ data: { barcode, user_id: terpilih.id, durasi_hari: durasi } });
      toast.success(`Permintaan dikirim ke ${r.nama ?? "mahasiswa"} untuk dikonfirmasi.`);
      setBarcode("");
      setBuku(null);
      setCari("");
      setTerpilih(null);
      qc.invalidateQueries({ queryKey: ["menunggu-konfirmasi"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanLine className="h-4 w-4" />
          Pinjam di meja
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">1. Scan barcode eksemplar</Label>
          <BarcodeScannerInput autoFocus placeholder="Scan / ketik barcode buku…" onScan={onScan} />
          {buku && (
            <div className="mt-1 flex items-center gap-2 rounded-md border bg-muted/40 p-2 text-sm">
              <BookOpen className="h-4 w-4 text-primary" />
              <span className="font-medium">{buku.judul}</span>
              <span className="text-xs text-muted-foreground">({buku.kode})</span>
              <Badge
                variant={buku.status === "tersedia" ? "default" : "destructive"}
                className="ml-auto"
              >
                {buku.status}
              </Badge>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">2. Pilih mahasiswa peminjam</Label>
          {terpilih ? (
            <div className="flex items-center justify-between rounded-md border p-2 text-sm">
              <span>
                <span className="font-medium">{terpilih.nama ?? "—"}</span>{" "}
                <span className="text-muted-foreground">({terpilih.nim ?? "—"})</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => setTerpilih(null)}>
                Ganti
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={cari}
                  onChange={(e) => setCari(e.target.value)}
                  placeholder="Cari nama / NIM / email…"
                  className="pl-9"
                />
              </div>
              {cari.trim().length >= 2 && (
                <div className="mt-1 max-h-40 space-y-1 overflow-auto">
                  {hasil.isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
                  {hasil.data?.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setTerpilih({ id: u.id, nama: u.nama, nim: u.nim })}
                      className="flex w-full items-center justify-between rounded-md border p-2 text-left text-sm hover:bg-accent"
                    >
                      <span className="font-medium">{u.nama ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">
                        {u.nim ?? "—"} · {u.prodi ?? "—"}
                      </span>
                    </button>
                  ))}
                  {!hasil.isFetching && !hasil.data?.length && (
                    <p className="text-sm text-muted-foreground">Tidak ada mahasiswa cocok.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-end gap-2">
          <div className="w-28 space-y-1">
            <Label className="text-xs">Durasi (hari)</Label>
            <Input
              type="number"
              min={1}
              max={60}
              value={durasi}
              onChange={(e) => setDurasi(Number(e.target.value) || 7)}
            />
          </div>
          <Button className="flex-1" disabled={busy || !barcode || !terpilih} onClick={kirim}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Kirim permintaan konfirmasi
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Mahasiswa terpilih akan diminta mengonfirmasi di perangkatnya (batal otomatis dalam{" "}
          {KONFIRMASI_DETIK} detik).
        </p>
      </CardContent>
    </Card>
  );
}

// ---- Kartu: Menunggu konfirmasi mahasiswa (dengan hitung mundur) ----
type MenungguRow = {
  id: string;
  tanggal_pengajuan: string;
  buku: { judul: string | null } | null;
  profil: { nama: string | null; nim: string | null } | null;
};

function MenungguKonfirmasiCard({ rows, loading }: { rows: MenungguRow[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Menunggu konfirmasi ({rows.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {!loading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Tidak ada permintaan menunggu.</p>
        )}
        {rows.map((p) => (
          <KonfirmasiRow key={p.id} p={p} />
        ))}
      </CardContent>
    </Card>
  );
}

function KonfirmasiRow({ p }: { p: MenungguRow }) {
  const [sisa, setSisa] = useState(KONFIRMASI_DETIK);
  const dibatalkan = useRef(false);

  useEffect(() => {
    const hitung = () => {
      const lewat = (Date.now() - new Date(p.tanggal_pengajuan).getTime()) / 1000;
      return Math.max(0, Math.ceil(KONFIRMASI_DETIK - lewat));
    };
    setSisa(hitung());
    const t = setInterval(() => {
      const s = hitung();
      setSisa(s);
      if (s <= 0 && !dibatalkan.current) {
        dibatalkan.current = true;
        (supabase.rpc as any)("batalkan_peminjaman_meja", {
            _id: p.id,
            _alasan: "Kedaluwarsa: tidak dikonfirmasi",
          })
          .then(() => undefined);
      }
    }, 500);
    return () => clearInterval(t);
  }, [p.id, p.tanggal_pengajuan]);

  async function batalManual() {
    dibatalkan.current = true;
    await (supabase.rpc as any)("batalkan_peminjaman_meja", { _id: p.id, _alasan: "Dibatalkan petugas" });
    toast.message("Permintaan dibatalkan.");
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
      <div className="text-sm">
        <p className="font-medium">{p.buku?.judul}</p>
        <p className="text-xs text-muted-foreground">
          {p.profil?.nama} · {p.profil?.nim}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={sisa > 0 ? "secondary" : "destructive"}>
          <Clock className="mr-1 h-3 w-3" />
          {sisa > 0 ? `${sisa}s` : "habis"}
        </Badge>
        <Button size="sm" variant="ghost" onClick={batalManual}>
          Batalkan
        </Button>
      </div>
    </div>
  );
}

// ============= TAB INVENTARIS =============
function TabInventaris() {
  const qc = useQueryClient();
  const simpan = useServerFn(simpanBuku);
  const hapus = useServerFn(hapusBuku);
  const tambahEks = useServerFn(tambahEksemplar);
  const hapusEks = useServerFn(hapusEksemplar);
  const ubahStatus = useServerFn(ubahStatusEksemplar);
  const [search, setSearch] = useState("");
  const [editBuku, setEditBuku] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const books = useQuery({
    queryKey: ["buku-list", search],
    queryFn: async () => {
      let q = supabase
        .from("buku")
        .select("*, eksemplar(id,kode_eksemplar,barcode_value,status)")
        .is("deleted_at", null)
        .order("judul");
      if (search)
        q = q.or(`judul.ilike.%${search}%,pengarang.ilike.%${search}%,kode_buku.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const allRows = books.data ?? [];
  const selectedRows = allRows.filter((b: any) => picked.has(b.id));
  const allChecked = allRows.length > 0 && picked.size === allRows.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari judul / pengarang / kode…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <ExportBukuButton selected={selectedRows} allRows={allRows} />
        <ImportBukuButton />
        <Button asChild variant="outline">
          <Link to="/editor-buku">
            <Table2 className="mr-2 h-4 w-4" />
            Editor mirip Excel
          </Link>
        </Button>
        <Button onClick={() => setEditBuku({})}>
          <Plus className="mr-2 h-4 w-4" />
          Buku baru
        </Button>
      </div>

      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <Checkbox
          checked={allChecked}
          onCheckedChange={(v) => {
            setPicked(v ? new Set(allRows.map((b: any) => b.id)) : new Set());
          }}
        />
        <span>Pilih Semua</span>
        {picked.size > 0 && <span className="text-muted-foreground">— {picked.size} dipilih</span>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {allRows.map((b: any) => {
          const tersedia = b.eksemplar?.filter((e: any) => e.status === "tersedia").length ?? 0;
          const total = b.eksemplar?.length ?? 0;
          const checked = picked.has(b.id);
          return (
            <Card key={b.id} className="transition hover:shadow-md">
              <CardHeader className="flex flex-row items-start gap-2 space-y-0">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => {
                    setPicked((prev) => {
                      const n = new Set(prev);
                      v ? n.add(b.id) : n.delete(b.id);
                      return n;
                    });
                  }}
                  className="mt-1"
                />
                <div className="flex-1">
                  <CardTitle className="line-clamp-2 text-base">{b.judul}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {b.pengarang ?? "—"} · {b.kode_buku}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{b.kategori ?? "Tanpa kategori"}</Badge>
                  <Badge variant={tersedia > 0 ? "default" : "destructive"}>
                    {tersedia}/{total} tersedia
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => setDetail(b)}>
                    Eksemplar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditBuku(b)}>
                    Ubah
                  </Button>
                  <HistoryButton bukuId={b.id} bukuJudul={b.judul} />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={async () => {
                      if (!confirm("Pindahkan buku ini ke tempat sampah?")) return;
                      try {
                        await hapus({ data: { id: b.id } });
                        toast.success("Dipindahkan ke tempat sampah.");
                        qc.invalidateQueries({ queryKey: ["buku-list"] });
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Gagal.");
                      }
                    }}
                  >
                    Hapus
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {allRows.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada buku.</p>}
      </div>

      {/* Dialog edit buku */}
      <Dialog open={!!editBuku} onOpenChange={(o) => !o && setEditBuku(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editBuku?.id ? "Ubah buku" : "Buku baru"}</DialogTitle>
          </DialogHeader>
          {editBuku && (
            <BukuForm
              initial={editBuku}
              onSubmit={async (v) => {
                try {
                  await simpan({ data: v });
                  toast.success("Tersimpan.");
                  setEditBuku(null);
                  qc.invalidateQueries({ queryKey: ["buku-list"] });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Gagal.");
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog kelola eksemplar */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Eksemplar — {detail?.judul}</DialogTitle>
          </DialogHeader>
          {detail && (
            <EksemplarPanel
              buku={detail}
              onAdd={async (jumlah, prefix) => {
                try {
                  const r = await tambahEks({ data: { buku_id: detail.id, jumlah, prefix } });
                  toast.success(`${r.added} eksemplar ditambahkan.`);
                  qc.invalidateQueries({ queryKey: ["buku-list"] });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Gagal.");
                }
              }}
              onDelete={async (id) => {
                if (!confirm("Hapus eksemplar ini?")) return;
                try {
                  await hapusEks({ data: { id } });
                  toast.success("Dihapus.");
                  qc.invalidateQueries({ queryKey: ["buku-list"] });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Gagal.");
                }
              }}
              onStatus={async (id, status) => {
                try {
                  await ubahStatus({ data: { id, status } });
                  toast.success("Status diperbarui.");
                  qc.invalidateQueries({ queryKey: ["buku-list"] });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Gagal.");
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BukuForm({ initial, onSubmit }: { initial: any; onSubmit: (v: any) => Promise<void> }) {
  const [v, setV] = useState({
    id: initial.id,
    kode_buku: initial.kode_buku ?? "",
    judul: initial.judul ?? "",
    pengarang: initial.pengarang ?? "",
    penerbit: initial.penerbit ?? "",
    tahun_terbit: initial.tahun_terbit ?? null,
    isbn: initial.isbn ?? "",
    kategori: initial.kategori ?? "",
    lokasi_rak: initial.lokasi_rak ?? "",
    deskripsi: initial.deskripsi ?? "",
  });
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSubmit({ ...v, tahun_terbit: v.tahun_terbit ? Number(v.tahun_terbit) : null });
        setSaving(false);
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <div className="space-y-1">
        <Label>Kode buku *</Label>
        <Input
          required
          value={v.kode_buku}
          onChange={(e) => setV({ ...v, kode_buku: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>Kategori</Label>
        <Input value={v.kategori} onChange={(e) => setV({ ...v, kategori: e.target.value })} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label>Judul *</Label>
        <Input required value={v.judul} onChange={(e) => setV({ ...v, judul: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>Pengarang</Label>
        <Input value={v.pengarang} onChange={(e) => setV({ ...v, pengarang: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>Penerbit</Label>
        <Input value={v.penerbit} onChange={(e) => setV({ ...v, penerbit: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>Tahun terbit</Label>
        <Input
          type="number"
          value={v.tahun_terbit ?? ""}
          onChange={(e) => setV({ ...v, tahun_terbit: e.target.value as any })}
        />
      </div>
      <div className="space-y-1">
        <Label>ISBN</Label>
        <Input value={v.isbn} onChange={(e) => setV({ ...v, isbn: e.target.value })} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label>Lokasi rak</Label>
        <Input value={v.lokasi_rak} onChange={(e) => setV({ ...v, lokasi_rak: e.target.value })} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label>Deskripsi</Label>
        <Textarea value={v.deskripsi} onChange={(e) => setV({ ...v, deskripsi: e.target.value })} />
      </div>
      <DialogFooter className="sm:col-span-2">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan
        </Button>
      </DialogFooter>
    </form>
  );
}

function EksemplarPanel({
  buku,
  onAdd,
  onDelete,
  onStatus,
}: {
  buku: any;
  onAdd: (n: number, p: string) => void;
  onDelete: (id: string) => void;
  onStatus: (id: string, s: any) => void;
}) {
  const [jumlah, setJumlah] = useState(1);
  const [prefix, setPrefix] = useState(buku.kode_buku);
  const [printing, setPrinting] = useState<any[] | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
        <div className="space-y-1">
          <Label>Prefix</Label>
          <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Jumlah</Label>
          <Input
            type="number"
            min={1}
            max={50}
            value={jumlah}
            onChange={(e) => setJumlah(Number(e.target.value) || 1)}
          />
        </div>
        <Button onClick={() => onAdd(jumlah, prefix)}>
          <Plus className="mr-2 h-4 w-4" />
          Tambah eksemplar
        </Button>
        <Button variant="outline" onClick={() => setPrinting(buku.eksemplar ?? [])}>
          <Printer className="mr-2 h-4 w-4" />
          Cetak semua label
        </Button>
      </div>

      <div className="max-h-[50vh] space-y-2 overflow-auto">
        {buku.eksemplar?.map((e: any) => (
          <div
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-2"
          >
            <div className="flex items-center gap-3">
              <Barcode value={e.barcode_value} height={40} />
              <div className="text-sm">
                <p className="font-mono">{e.kode_eksemplar}</p>
                <select
                  value={e.status}
                  onChange={(ev) => onStatus(e.id, ev.target.value)}
                  className="mt-1 rounded border bg-transparent px-1 py-0.5 text-xs"
                >
                  {["tersedia", "dipinjam", "dipesan", "hilang", "rusak"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Cetak label barcode eksemplar ${e.kode_eksemplar}`}
                onClick={() => setPrinting([e])}
              >
                <Printer className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Hapus eksemplar ${e.kode_eksemplar}`}
                className="text-destructive"
                onClick={() => onDelete(e.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        {!buku.eksemplar?.length && (
          <p className="text-sm text-muted-foreground">Belum ada eksemplar.</p>
        )}
      </div>

      {printing && <PrintLabels items={printing} buku={buku} onClose={() => setPrinting(null)} />}
    </div>
  );
}

function PrintLabels({ items, buku, onClose }: { items: any[]; buku: any; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => {
      window.print();
    }, 200);
    return () => clearTimeout(t);
  }, []);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl print:!static print:!max-w-none print:!border-0 print:!shadow-none">
        <DialogHeader className="print:hidden">
          <DialogTitle>Pratinjau cetak label</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
          {items.map((e) => (
            <div key={e.id} className="flex flex-col items-center rounded border p-2 text-center">
              <p className="text-[10px] font-medium">Perpus FISIP ULM</p>
              <p className="line-clamp-1 text-xs font-semibold">{buku.judul}</p>
              <Barcode value={e.barcode_value} height={50} />
              <p className="font-mono text-[10px]">{e.kode_eksemplar}</p>
            </div>
          ))}
        </div>
        <DialogFooter className="print:hidden">
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
          <Button onClick={() => window.print()}>Cetak</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============= TAB MAHASISWA =============
function TabMahasiswa() {
  const [search, setSearch] = useState("");
  const list = useQuery({
    queryKey: ["mhs-list", search],
    queryFn: async () => {
      let q = supabase.from("profiles").select("id, nama, nim, prodi, email").order("nama");
      if (search) q = q.or(`nama.ilike.%${search}%,nim.ilike.%${search}%,email.ilike.%${search}%`);
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Cari nama / NIM / email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>NIM</TableHead>
                <TableHead>Prodi</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Kelayakan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.map((m) => (
                <MahasiswaRow key={m.id} m={m} />
              ))}
              {!list.data?.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    Tidak ada mahasiswa.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function MahasiswaRow({ m }: { m: any }) {
  const q = useQuery({
    queryKey: ["kelayakan", m.id],
    queryFn: async () => {
      const { data } = await supabase.rpc("mahasiswa_layak_pinjam", { _user_id: m.id });
      return !!data;
    },
  });
  return (
    <TableRow>
      <TableCell>{m.nama ?? "—"}</TableCell>
      <TableCell className="font-mono text-xs">{m.nim ?? "—"}</TableCell>
      <TableCell className="text-sm">{m.prodi ?? "—"}</TableCell>
      <TableCell className="text-sm">{m.email ?? "—"}</TableCell>
      <TableCell>
        <Badge variant={q.data ? "default" : "destructive"}>{q.data ? "Layak" : "Diblokir"}</Badge>
      </TableCell>
    </TableRow>
  );
}

// ============= TAB PENGATURAN =============
function TabPengaturan() {
  const simpan = useServerFn(simpanPengaturan);
  const cfg = useQuery({
    queryKey: ["pengaturan"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pengaturan_denda")
        .select("*")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const [v, setV] = useState<any>(null);
  useEffect(() => {
    if (cfg.data && !v) setV(cfg.data);
  }, [cfg.data, v]);

  if (!v) return <Loader2 className="h-4 w-4 animate-spin" />;
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="text-base">Pengaturan denda & reservasi</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await simpan({
                data: {
                  tarif_per_hari: Number(v.tarif_per_hari),
                  grace_days: Number(v.grace_days),
                  max_denda: v.max_denda === "" || v.max_denda == null ? null : Number(v.max_denda),
                  batas_ambil_reservasi_jam: Number(v.batas_ambil_reservasi_jam),
                  purge_hari: Number(v.purge_hari ?? 60),
                },
              });
              toast.success("Tersimpan.");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Gagal.");
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-1">
            <Label>Tarif per hari (Rp)</Label>
            <Input
              type="number"
              min={0}
              value={v.tarif_per_hari}
              onChange={(e) => setV({ ...v, tarif_per_hari: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Grace period (hari)</Label>
            <Input
              type="number"
              min={0}
              value={v.grace_days}
              onChange={(e) => setV({ ...v, grace_days: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Maksimum denda (Rp, kosongkan = tanpa batas)</Label>
            <Input
              type="number"
              min={0}
              value={v.max_denda ?? ""}
              onChange={(e) => setV({ ...v, max_denda: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Batas ambil reservasi (jam)</Label>
            <Input
              type="number"
              min={1}
              value={v.batas_ambil_reservasi_jam}
              onChange={(e) => setV({ ...v, batas_ambil_reservasi_jam: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Retensi tempat sampah (hari) — auto-purge</Label>
            <Input
              type="number"
              min={1}
              value={v.purge_hari ?? 60}
              onChange={(e) => setV({ ...v, purge_hari: e.target.value })}
            />
          </div>
          <Button type="submit">Simpan</Button>
        </form>
      </CardContent>
    </Card>
  );
}
