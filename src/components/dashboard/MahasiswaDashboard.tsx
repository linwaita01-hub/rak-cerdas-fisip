import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ajukanPeminjaman, buatReservasi, batalkanReservasi } from "@/lib/perpus.functions";
import { fmtIDR, fmtWITA, type Profile } from "@/hooks/useMe";

export function MahasiswaDashboard({ profile }: { profile: Profile | null }) {
  const kelayakan = useQuery({
    queryKey: ["kelayakan-saya", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("mahasiswa_layak_pinjam", { _user_id: profile!.id });
      return !!data;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Halo, {profile?.nama ?? "Mahasiswa"} 👋</h2>
          <p className="text-sm text-muted-foreground">{profile?.nim} · {profile?.prodi}</p>
        </div>
        <Badge variant={kelayakan.data ? "default" : "destructive"}>
          {kelayakan.data === undefined ? "Memeriksa…" : kelayakan.data ? "Layak meminjam" : "Diblokir (denda / terlambat)"}
        </Badge>
      </div>

      <Tabs defaultValue="katalog">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto">
          <TabsTrigger value="katalog">Katalog</TabsTrigger>
          <TabsTrigger value="saya">Pinjaman Saya</TabsTrigger>
        </TabsList>
        <TabsContent value="katalog" className="mt-4"><Katalog dapatPinjam={!!kelayakan.data} /></TabsContent>
        <TabsContent value="saya" className="mt-4"><PinjamanSaya /></TabsContent>
      </Tabs>
    </div>
  );
}

function Katalog({ dapatPinjam }: { dapatPinjam: boolean }) {
  const qc = useQueryClient();
  const ajukan = useServerFn(ajukanPeminjaman);
  const reservasi = useServerFn(buatReservasi);
  const [search, setSearch] = useState("");
  const [kategori, setKategori] = useState("");

  const q = useQuery({
    queryKey: ["katalog", search, kategori],
    queryFn: async () => {
      let query = supabase.from("buku")
        .select("id, judul, pengarang, kategori, kode_buku, penerbit, tahun_terbit, eksemplar(id,status)")
        .is("deleted_at", null).order("judul").limit(60);
      if (search) query = query.or(`judul.ilike.%${search}%,pengarang.ilike.%${search}%`);
      if (kategori) query = query.eq("kategori", kategori);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cari judul / pengarang…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Input placeholder="Kategori" value={kategori} onChange={(e) => setKategori(e.target.value)} className="w-40" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {q.data?.map((b: any) => {
          const tersedia = b.eksemplar?.filter((e: any) => e.status === "tersedia").length ?? 0;
          const bisaPinjam = tersedia > 0;
          return (
            <Card key={b.id}>
              <CardHeader>
                <div className="flex items-start gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  <div className="min-w-0 flex-1">
                    <CardTitle className="line-clamp-2 text-base">{b.judul}</CardTitle>
                    <p className="text-xs text-muted-foreground">{b.pengarang ?? "—"}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-1 text-xs">
                  {b.kategori && <Badge variant="secondary">{b.kategori}</Badge>}
                  <Badge variant={bisaPinjam ? "default" : "destructive"}>
                    {bisaPinjam ? "🟩 Tersedia" : "🟥 Kosong"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Kode: {b.kode_buku} · {b.penerbit ?? "—"} {b.tahun_terbit ? `(${b.tahun_terbit})` : ""}</p>
                <div className="flex gap-2 pt-1">
                  {bisaPinjam ? (
                    <Button size="sm" disabled={!dapatPinjam} onClick={async () => {
                      try { await ajukan({ data: { buku_id: b.id } }); toast.success("Pengajuan dikirim."); qc.invalidateQueries({ queryKey: ["pinjaman-saya"] }); }
                      catch (e) { toast.error(e instanceof Error ? e.message : "Gagal."); }
                    }}>Ajukan pinjam</Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled={!dapatPinjam} onClick={async () => {
                      try { await reservasi({ data: { buku_id: b.id } }); toast.success("Reservasi tercatat."); qc.invalidateQueries({ queryKey: ["reservasi-saya"] }); }
                      catch (e) { toast.error(e instanceof Error ? e.message : "Gagal."); }
                    }}>Reservasi</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {q.isLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
        {q.data?.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada buku ditemukan.</p>}
      </div>
    </div>
  );
}

function PinjamanSaya() {
  const qc = useQueryClient();
  const batal = useServerFn(batalkanReservasi);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel("mhs-pinjaman")
      .on("postgres_changes", { event: "*", schema: "public", table: "peminjaman" }, () => qc.invalidateQueries({ queryKey: ["pinjaman-saya"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "reservasi" }, () => qc.invalidateQueries({ queryKey: ["reservasi-saya"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "denda" }, () => qc.invalidateQueries({ queryKey: ["denda-saya"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const pinjaman = useQuery({
    queryKey: ["pinjaman-saya"],
    queryFn: async () => {
      const { data, error } = await supabase.from("peminjaman")
        .select("*, buku:buku_id(judul,kode_buku), eksemplar:eksemplar_id(kode_eksemplar)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const reservasi = useQuery({
    queryKey: ["reservasi-saya"],
    queryFn: async () => {
      const { data, error } = await supabase.from("reservasi")
        .select("*, buku:buku_id(judul,kode_buku)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const denda = useQuery({
    queryKey: ["denda-saya"],
    queryFn: async () => {
      const { data, error } = await supabase.from("denda")
        .select("*, peminjaman:peminjaman_id(buku:buku_id(judul))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const aktif = pinjaman.data?.filter((p: any) => ["menunggu", "disetujui", "dipinjam", "terlambat"].includes(p.status)) ?? [];
  const riwayat = pinjaman.data?.filter((p: any) => ["dikembalikan", "ditolak"].includes(p.status)) ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Peminjaman aktif ({aktif.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Buku</TableHead><TableHead>Status</TableHead><TableHead>Jatuh tempo</TableHead></TableRow></TableHeader>
            <TableBody>
              {aktif.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm">{p.buku?.judul}</TableCell>
                  <TableCell><Badge variant={p.status === "terlambat" ? "destructive" : "secondary"}>{p.status}</Badge></TableCell>
                  <TableCell className="text-xs">{fmtWITA(p.tanggal_jatuh_tempo)}</TableCell>
                </TableRow>
              ))}
              {!aktif.length && <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground">Tidak ada.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Reservasi ({reservasi.data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Buku</TableHead><TableHead>Status</TableHead><TableHead>Batas ambil</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {reservasi.data?.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.buku?.judul}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "tersedia" ? "default" : r.status === "menunggu" ? "secondary" : "outline"}>
                      {r.status}{r.status === "menunggu" ? ` (#${r.posisi_antrian})` : ""}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{fmtWITA(r.tanggal_kadaluarsa)}</TableCell>
                  <TableCell className="text-right">
                    {(r.status === "menunggu" || r.status === "tersedia") && (
                      <Button size="sm" variant="ghost" onClick={async () => {
                        try { await batal({ data: { id: r.id } }); toast.success("Dibatalkan."); qc.invalidateQueries({ queryKey: ["reservasi-saya"] }); }
                        catch (e) { toast.error(e instanceof Error ? e.message : "Gagal."); }
                      }}>Batal</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!reservasi.data?.length && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Belum ada reservasi.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Denda</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Buku</TableHead><TableHead>Jumlah</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {denda.data?.map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell className="text-sm">{d.peminjaman?.buku?.judul ?? "—"}</TableCell>
                  <TableCell>{fmtIDR(Number(d.jumlah))}</TableCell>
                  <TableCell><Badge variant={d.status === "belum_bayar" ? "destructive" : "default"}>{d.status}</Badge></TableCell>
                </TableRow>
              ))}
              {!denda.data?.length && <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground">Tidak ada denda.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Riwayat</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Buku</TableHead><TableHead>Status</TableHead><TableHead>Tanggal</TableHead></TableRow></TableHeader>
            <TableBody>
              {riwayat.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm">{p.buku?.judul}</TableCell>
                  <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                  <TableCell className="text-xs">{fmtWITA(p.tanggal_kembali ?? p.tanggal_pengajuan)}</TableCell>
                </TableRow>
              ))}
              {!riwayat.length && <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground">Belum ada riwayat.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
