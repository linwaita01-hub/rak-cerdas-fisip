import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DataSheetGrid, keyColumn, textColumn, intColumn, type Column } from "react-datasheet-grid";
import "react-datasheet-grid/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, History, RotateCcw, Plus, Download } from "lucide-react";
import { toast } from "sonner";
import { parseExcelFile, eksporBukuKeExcel, type SheetPreview } from "@/lib/excel-import";
import { parseImagesTina } from "@/lib/excel-images";
import { imporBukuMassal, kembalikanVersiBuku } from "@/lib/perpus.functions";
import { fmtWITA } from "@/hooks/useMe";

// Baris yang bisa diedit di grid pratinjau impor (kolom typed; `meta` menyimpan
// kolom ekstra dari file agar tidak hilang saat diimpor).
type EditRow = {
  kode_buku: string | null;
  judul: string | null;
  pengarang: string | null;
  penerbit: string | null;
  tahun_terbit: number | null;
  isbn: string | null;
  kategori: string | null;
  lokasi_rak: string | null;
  jumlah_eksemplar: number | null;
  meta?: Record<string, string>;
};

function barisBaru(): EditRow {
  return {
    kode_buku: "",
    judul: "",
    pengarang: null,
    penerbit: null,
    tahun_terbit: null,
    isbn: null,
    kategori: null,
    lokasi_rak: null,
    jumlah_eksemplar: 1,
  };
}

const imporColumns: Column<EditRow>[] = [
  {
    ...keyColumn<EditRow, "kode_buku">("kode_buku", textColumn),
    title: "Kode buku",
    minWidth: 130,
  },
  { ...keyColumn<EditRow, "judul">("judul", textColumn), title: "Judul", minWidth: 220, grow: 2 },
  {
    ...keyColumn<EditRow, "pengarang">("pengarang", textColumn),
    title: "Pengarang",
    minWidth: 150,
  },
  { ...keyColumn<EditRow, "penerbit">("penerbit", textColumn), title: "Penerbit", minWidth: 140 },
  {
    ...keyColumn<EditRow, "tahun_terbit">("tahun_terbit", intColumn),
    title: "Tahun",
    minWidth: 80,
  },
  { ...keyColumn<EditRow, "isbn">("isbn", textColumn), title: "ISBN", minWidth: 130 },
  { ...keyColumn<EditRow, "kategori">("kategori", textColumn), title: "Kategori", minWidth: 130 },
  {
    ...keyColumn<EditRow, "lokasi_rak">("lokasi_rak", textColumn),
    title: "Lokasi rak",
    minWidth: 120,
  },
  {
    ...keyColumn<EditRow, "jumlah_eksemplar">("jumlah_eksemplar", intColumn),
    title: "Jml eks",
    minWidth: 80,
  },
];

// ============= EKSPOR =============
export function ExportBukuButton({ selected, allRows }: { selected: any[]; allRows: any[] }) {
  const rows = selected.length ? selected : allRows;
  return (
    <Button
      variant="outline"
      onClick={() => {
        if (!rows.length) return toast.error("Tidak ada data.");
        eksporBukuKeExcel(rows, `buku-${new Date().toISOString().slice(0, 10)}.xlsx`);
        toast.success(`${rows.length} baris diekspor.`);
      }}
    >
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
  const [progress, setProgress] = useState("");
  const [editRows, setEditRows] = useState<EditRow[]>([]);
  // Foto tertanam dari file .xlsx dipetakan ke kode_buku (kolom unik).
  const [imagesByKode, setImagesByKode] = useState<Map<string, Blob>>(new Map());
  const impor = useServerFn(imporBukuMassal);
  const qc = useQueryClient();

  async function onFile(file: File) {
    setBusy(true);
    try {
      const { sheets } = await parseExcelFile(file);
      const good = sheets.filter((s) => s.rows.length > 0);
      if (!good.length) throw new Error("Tidak menemukan sheet berisi data buku.");

      // Coba parse gambar tertanam (hanya untuk sheet Tina; sheet lain diabaikan).
      let imgMap = new Map<string, Blob>();
      try {
        const images = await parseImagesTina(file);
        const sheetTina =
          good.find((s) => /FISIP\s+Lengkap\s*\(\s*Tina\s*\)/i.test(s.sheetName)) ?? good[0];
        for (const img of images) {
          const row = sheetTina.rows.find((r) => (r._row ?? 0) - 1 === img.rowIndex);
          if (row?.kode_buku) imgMap.set(row.kode_buku, img.blob);
        }
      } catch {
        imgMap = new Map();
      }
      setImagesByKode(imgMap);
      if (imgMap.size > 0) {
        toast.info(`${imgMap.size} foto tertanam terdeteksi — akan diunggah saat impor.`);
      }
      setSheets(good);
      setPickedSheet(good[0].sheetName);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membaca file.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Unggah gambar ke bucket 'sampul' dengan concurrency terbatas; kembalikan
  // path per kode_buku (yang berhasil). Yang gagal (mis. bucket belum dibuat)
  // dilewati diam-diam agar impor tetap berjalan.
  async function uploadImages(kodes: string[]): Promise<Map<string, string>> {
    const paths = new Map<string, string>();
    const tasks = kodes
      .map((k) => ({ k, blob: imagesByKode.get(k) }))
      .filter((x): x is { k: string; blob: Blob } => !!x.blob);
    if (tasks.length === 0) return paths;
    let gagal = 0;
    const worker = async () => {
      while (tasks.length) {
        const t = tasks.shift();
        if (!t) return;
        const ext = t.blob.type.includes("png") ? "png" : t.blob.type.includes("gif") ? "gif" : "jpg";
        const safe = t.k.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 40);
        const path = `${safe}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from("sampul")
          .upload(path, t.blob, { contentType: t.blob.type, upsert: true });
        if (error) gagal++;
        else paths.set(t.k, path);
      }
    };
    // Concurrency 6 upload sekaligus.
    await Promise.all(Array.from({ length: 6 }, () => worker()));
    if (gagal > 0) {
      toast.warning(`${gagal} foto gagal diunggah (bucket 'sampul' mungkin belum tersedia).`);
    }
    return paths;
  }

  const active = sheets?.find((s) => s.sheetName === pickedSheet);

  // Muat baris sheet aktif ke grid yang bisa diedit.
  useEffect(() => {
    if (!active) {
      setEditRows([]);
      return;
    }
    setEditRows(
      active.rows.map((r) => ({
        kode_buku: r.kode_buku ?? null,
        judul: r.judul ?? null,
        pengarang: r.pengarang ?? null,
        penerbit: r.penerbit ?? null,
        tahun_terbit: r.tahun_terbit ?? null,
        isbn: r.isbn ?? null,
        kategori: r.kategori ?? null,
        lokasi_rak: r.lokasi_rak ?? null,
        jumlah_eksemplar: r.jumlah_eksemplar ?? 1,
        meta: r.meta,
      })),
    );
  }, [active]);

  async function jalankan(mode: "skip" | "overwrite") {
    if (!active) return;
    setBusy(true);
    setProgress("Menyiapkan data…");
    try {
      const rowsBase = editRows
        .filter((r) => r.kode_buku && r.judul)
        .map((r) => ({
          kode_buku: r.kode_buku as string,
          judul: r.judul as string,
          pengarang: r.pengarang,
          penerbit: r.penerbit,
          tahun_terbit: r.tahun_terbit,
          isbn: r.isbn,
          kategori: r.kategori,
          lokasi_rak: r.lokasi_rak,
          jumlah_eksemplar: r.jumlah_eksemplar ?? 1,
          meta: r.meta,
        }));

      const kodes = rowsBase.map((r) => r.kode_buku);
      if (imagesByKode.size > 0) {
        setProgress(`Mengunggah ${imagesByKode.size} foto…`);
      }
      const paths = await uploadImages(kodes);
      const rowsClean = rowsBase.map((r) => ({ ...r, sampul_path: paths.get(r.kode_buku) ?? null }));

      let inserted = 0,
        updated = 0,
        skipped = 0,
        eks = 0;
      const totalBatches = Math.ceil(rowsClean.length / 500);
      for (let i = 0; i < rowsClean.length; i += 500) {
        const batchNum = Math.floor(i / 500) + 1;
        setProgress(`Mengimpor batch ${batchNum}/${totalBatches} (${i}/${rowsClean.length} baris)…`);
        const chunk = rowsClean.slice(i, i + 500);
        const r = await impor({ data: { mode, rows: chunk } });
        inserted += r.inserted;
        updated += r.updated;
        skipped += r.skipped;
        eks += r.eksemplarDibuat;
      }
      toast.success(
        `Impor selesai: +${inserted} baru, ~${updated} diperbarui, ${skipped} dilewati, ${eks} eksemplar dibuat.`,
      );
      setSheets(null);
      setAskDup(false);
      qc.invalidateQueries({ queryKey: ["buku-list"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal impor.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        Impor Excel
      </Button>

      <Dialog open={!!sheets} onOpenChange={(o) => !o && setSheets(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Pratinjau impor</DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Sheet:</span>
                <select
                  className="rounded border bg-transparent px-2 py-1 text-sm"
                  value={pickedSheet}
                  onChange={(e) => setPickedSheet(e.target.value)}
                >
                  {sheets!.map((s) => (
                    <option key={s.sheetName} value={s.sheetName}>
                      {s.sheetName} ({s.rows.length} baris
                      {s.errorCount ? `, ${s.errorCount} error` : ""})
                    </option>
                  ))}
                </select>
                <Badge variant="secondary">
                  Kolom terdeteksi: {Object.keys(active.columnMap).join(", ") || "—"}
                </Badge>
              </div>
              <div className="rounded border">
                <DataSheetGrid<EditRow>
                  value={editRows}
                  onChange={setEditRows}
                  columns={imporColumns}
                  createRow={barisBaru}
                  height={360}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {editRows.length} baris. Edit sel, tambah, atau hapus baris sebelum menyimpan.
                  Kolom lain dari file tetap tersimpan (meta).
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditRows((r) => [...r, barisBaru()])}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Tambah baris
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                if (!editRows.length) return toast.error("Tidak ada baris.");
                eksporBukuKeExcel(
                  editRows,
                  `impor-terbaru-${new Date().toISOString().slice(0, 10)}.xlsx`,
                );
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Unduh .xlsx
            </Button>
            <Button variant="outline" onClick={() => setSheets(null)}>
              Batal
            </Button>
            <Button onClick={() => setAskDup(true)} disabled={busy || !editRows.length}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Konfirmasi & Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal resolusi duplikat */}
      <Dialog open={askDup} onOpenChange={setAskDup}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Jika ada kode_buku yang sama…</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Pilih tindakan untuk baris yang <b>kode_buku</b>-nya sudah ada di database.
          </p>
          {progress && (
            <div className="flex items-center gap-2 rounded bg-muted px-3 py-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              {progress}
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => jalankan("skip")}
              disabled={busy}
              className="flex-1"
            >
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
      const { data, error } = await supabase
        .from("buku_history")
        .select("*")
        .eq("buku_id", bukuId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  async function kembalikan(historyId: string) {
    if (!confirm("Kembalikan buku ke versi ini?")) return;
    try {
      await kembalikanVersiBuku({ data: { history_id: historyId } });
    } catch (e) {
      return toast.error(e instanceof Error ? e.message : "Gagal memulihkan versi.");
    }
    toast.success("Versi dipulihkan.");
    qc.invalidateQueries({ queryKey: ["buku-list"] });
    qc.invalidateQueries({ queryKey: ["buku-history", bukuId] });
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <History className="mr-1 h-4 w-4" />
        Riwayat
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Riwayat perubahan — {bukuJudul}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-auto">
            {q.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {q.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">Belum ada perubahan.</p>
            )}
            {q.data?.map((h: any) => (
              <div key={h.id} className="rounded border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{fmtWITA(h.created_at)}</p>
                  <Button size="sm" variant="outline" onClick={() => kembalikan(h.id)}>
                    <RotateCcw className="mr-1 h-3 w-3" />
                    Kembalikan
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div>
                    <b>Judul:</b> {h.data_lama.judul}
                  </div>
                  <div>
                    <b>Kode:</b> {h.data_lama.kode_buku}
                  </div>
                  <div>
                    <b>Pengarang:</b> {h.data_lama.pengarang ?? "—"}
                  </div>
                  <div>
                    <b>Penerbit:</b> {h.data_lama.penerbit ?? "—"}
                  </div>
                  <div>
                    <b>Tahun:</b> {h.data_lama.tahun_terbit ?? "—"}
                  </div>
                  <div>
                    <b>ISBN:</b> {h.data_lama.isbn ?? "—"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
