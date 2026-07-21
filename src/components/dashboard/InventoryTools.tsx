import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, History, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { parseExcelFile, eksporBukuKeExcel, type SheetPreview } from "@/lib/excel-import";
import { imporBukuMassal } from "@/lib/perpus.functions";
import { fmtWITA } from "@/hooks/useMe";

// ============= EKSPOR =============
export function ExportBukuButton({ selected, allRows }: { selected: any[]; allRows: any[] }) {
  const rows = selected.length ? selected : allRows;
  return (
    <Button variant="outline" onClick={() => {
      if (!rows.length) return toast.error("Tidak ada data.");
      eksporBukuKeExcel(rows, `buku-${new Date().toISOString().slice(0,10)}.xlsx`);
      toast.success(`${rows.length} baris diekspor.`);
    }}>
      Unduh {selected.length ? `Terpilih (${selected.length})` : "Semua"}
    </Button>
  );
}

// ============= IMPOR =============
export function ImportBukuButton() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [sheets, setSheets] = useState<SheetPreview[] | null>(null);
  const [pickedSheet, setPickedSheet] = useState<string>("");
  const [askDup, setAskDup] = useState(false);
  const [busy, setBusy] = useState(false);
  const impor = useServerFn(imporBukuMassal);
  const qc = useQueryClient();

  async function onFile(file: File) {
    setBusy(true);
    try {
      const { sheets } = await parseExcelFile(file);
      const good = sheets.filter((s) => s.rows.length > 0);
      if (!good.length) throw new Error("Tidak menemukan sheet berisi data buku.");
      setSheets(good);
      setPickedSheet(good[0].sheetName);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal membaca file."); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  const active = sheets?.find((s) => s.sheetName === pickedSheet);

  async function jalankan(mode: "skip" | "overwrite") {
    if (!active) return;
    setBusy(true);
    try {
      const rowsClean = active.rows.filter((r) => !r._error).map(({ _sheet, _row, _error, ...rest }) => rest);
      // Kirim per-batch 500
      let inserted = 0, updated = 0, skipped = 0, eks = 0;
      for (let i = 0; i < rowsClean.length; i += 500) {
        const chunk = rowsClean.slice(i, i + 500);
        const r = await impor({ data: { mode, rows: chunk } });
        inserted += r.inserted; updated += r.updated; skipped += r.skipped; eks += r.eksemplarDibuat;
      }
      toast.success(`Impor selesai: +${inserted} baru, ~${updated} diperbarui, ${skipped} dilewati, ${eks} eksemplar dibuat.`);
      setSheets(null); setAskDup(false);
      qc.invalidateQueries({ queryKey: ["buku-list"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal impor."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
        Impor Excel
      </Button>

      <Dialog open={!!sheets} onOpenChange={(o) => !o && setSheets(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Pratinjau impor</DialogTitle></DialogHeader>
          {active && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Sheet:</span>
                <select className="rounded border bg-transparent px-2 py-1 text-sm"
                  value={pickedSheet} onChange={(e) => setPickedSheet(e.target.value)}>
                  {sheets!.map((s) => (
                    <option key={s.sheetName} value={s.sheetName}>
                      {s.sheetName} ({s.rows.length} baris{s.errorCount ? `, ${s.errorCount} error` : ""})
                    </option>
                  ))}
                </select>
                <Badge variant="secondary">
                  Kolom terdeteksi: {Object.keys(active.columnMap).join(", ") || "—"}
                </Badge>
              </div>
              <div className="max-h-[45vh] overflow-auto rounded border">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Baris</TableHead><TableHead>Kode</TableHead><TableHead>Judul</TableHead>
                    <TableHead>Pengarang</TableHead><TableHead>Tahun</TableHead><TableHead>Eks</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {active.rows.slice(0, 100).map((r, i) => (
                      <TableRow key={i} className={r._error ? "bg-destructive/10" : ""}>
                        <TableCell className="text-xs">{r._row}</TableCell>
                        <TableCell className="font-mono text-xs">{r.kode_buku}</TableCell>
                        <TableCell className="text-sm">{r.judul}</TableCell>
                        <TableCell className="text-xs">{r.pengarang ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.tahun_terbit ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.jumlah_eksemplar ?? 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {active.rows.length > 100 && <p className="text-xs text-muted-foreground">Menampilkan 100 dari {active.rows.length} baris.</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSheets(null)}>Batal</Button>
            <Button onClick={() => setAskDup(true)} disabled={busy || !active?.rows.length}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Konfirmasi & Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal resolusi duplikat */}
      <Dialog open={askDup} onOpenChange={setAskDup}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Jika ada kode_buku yang sama…</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Pilih tindakan untuk baris yang <b>kode_buku</b>-nya sudah ada di database.
          </p>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => jalankan("skip")} disabled={busy} className="flex-1">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Abaikan Duplikat
            </Button>
            <Button onClick={() => jalankan("overwrite")} disabled={busy} className="flex-1">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Timpa Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============= RIWAYAT / UNDO =============
export function HistoryButton({ bukuId, bukuJudul }: { bukuId: string; bukuJudul: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["buku-history", bukuId],
    queryFn: async () => {
      const { data, error } = await supabase.from("buku_history")
        .select("*").eq("buku_id", bukuId).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  async function kembalikan(historyId: string) {
    if (!confirm("Kembalikan buku ke versi ini?")) return;
    const { error } = await supabase.rpc("kembalikan_versi_buku", { _history_id: historyId });
    if (error) return toast.error(error.message);
    toast.success("Versi dipulihkan.");
    qc.invalidateQueries({ queryKey: ["buku-list"] });
    qc.invalidateQueries({ queryKey: ["buku-history", bukuId] });
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <History className="mr-1 h-4 w-4" />Riwayat
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Riwayat perubahan — {bukuJudul}</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-auto">
            {q.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {q.data?.length === 0 && <p className="text-sm text-muted-foreground">Belum ada perubahan.</p>}
            {q.data?.map((h: any) => (
              <div key={h.id} className="rounded border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{fmtWITA(h.created_at)}</p>
                  <Button size="sm" variant="outline" onClick={() => kembalikan(h.id)}>
                    <RotateCcw className="mr-1 h-3 w-3" />Kembalikan
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div><b>Judul:</b> {h.data_lama.judul}</div>
                  <div><b>Kode:</b> {h.data_lama.kode_buku}</div>
                  <div><b>Pengarang:</b> {h.data_lama.pengarang ?? "—"}</div>
                  <div><b>Penerbit:</b> {h.data_lama.penerbit ?? "—"}</div>
                  <div><b>Tahun:</b> {h.data_lama.tahun_terbit ?? "—"}</div>
                  <div><b>ISBN:</b> {h.data_lama.isbn ?? "—"}</div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============= TAB TEMPAT SAMPAH =============
export function TabSampah() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["buku-sampah"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buku")
        .select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const purge = useQuery({
    queryKey: ["purge-log"],
    queryFn: async () => {
      const { data } = await supabase.from("purge_log")
        .select("*").order("created_at", { ascending: false }).limit(10);
      return data ?? [];
    },
  });

  async function pulihkan(id: string) {
    const { error } = await supabase.rpc("pulihkan_buku", { _buku_id: id });
    if (error) return toast.error(error.message);
    toast.success("Dipulihkan.");
    qc.invalidateQueries({ queryKey: ["buku-sampah"] });
    qc.invalidateQueries({ queryKey: ["buku-list"] });
  }
  async function hapusPermanen(id: string) {
    if (!confirm("Hapus permanen? Tindakan ini tidak bisa dibatalkan.")) return;
    const { error } = await supabase.rpc("hapus_permanen_buku", { _buku_id: id });
    if (error) return toast.error(error.message);
    toast.success("Dihapus permanen.");
    qc.invalidateQueries({ queryKey: ["buku-sampah"] });
    qc.invalidateQueries({ queryKey: ["purge-log"] });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Tempat sampah ({q.data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Buku yang dihapus akan tersimpan di sini. Sistem menghapus permanen otomatis setelah batas retensi terlewati.
          </p>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Kode</TableHead><TableHead>Judul</TableHead>
              <TableHead>Dihapus pada</TableHead><TableHead className="text-right">Aksi</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {q.data?.map((b: any) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">{b.kode_buku}</TableCell>
                  <TableCell className="text-sm">{b.judul}</TableCell>
                  <TableCell className="text-xs">{fmtWITA(b.deleted_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => pulihkan(b.id)}>
                        <RotateCcw className="mr-1 h-3 w-3" />Pulihkan
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => hapusPermanen(b.id)}>
                        <Trash2 className="mr-1 h-3 w-3" />Hapus permanen
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!q.data?.length && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Kosong.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Log pembersihan otomatis</CardTitle></CardHeader>
        <CardContent>
          {purge.data?.length ? (
            <ul className="space-y-1 text-xs">
              {purge.data.map((l: any) => (
                <li key={l.id}>
                  {fmtWITA(l.created_at)} — {l.entitas}: <b>{l.jumlah}</b> baris
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Belum ada log.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
