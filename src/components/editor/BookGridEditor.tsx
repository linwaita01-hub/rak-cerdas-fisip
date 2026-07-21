import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  DataSheetGrid,
  keyColumn,
  textColumn,
  intColumn,
  type Column,
  type DataSheetGridRef,
} from "react-datasheet-grid";
import "react-datasheet-grid/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { eksporBukuKeExcel } from "@/lib/excel-import";
import { simpanEditorBuku } from "@/lib/editor-buku.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Save, Download, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

type Row = {
  _rowId: string;
  id: string | null;
  updated_at: string | null;
  kode_buku: string | null;
  judul: string | null;
  pengarang: string | null;
  penerbit: string | null;
  tahun_terbit: number | null;
  isbn: string | null;
  kategori: string | null;
  lokasi_rak: string | null;
  deskripsi: string | null;
  jumlah_eksemplar: number | null;
};

type RawEksemplar = { status: string | null; deleted_at: string | null };
type RawBuku = {
  id: string;
  kode_buku: string | null;
  judul: string | null;
  pengarang: string | null;
  penerbit: string | null;
  tahun_terbit: number | null;
  isbn: string | null;
  kategori: string | null;
  lokasi_rak: string | null;
  deskripsi: string | null;
  updated_at: string | null;
  eksemplar: RawEksemplar[] | null;
};

const FIELDS = [
  "kode_buku",
  "judul",
  "pengarang",
  "penerbit",
  "tahun_terbit",
  "isbn",
  "kategori",
  "lokasi_rak",
  "deskripsi",
  "jumlah_eksemplar",
] as const;

const SELECT_COLS =
  "id,kode_buku,judul,pengarang,penerbit,tahun_terbit,isbn,kategori,lokasi_rak,deskripsi,updated_at,eksemplar(status,deleted_at)";

const KOLOM_LABEL: Record<string, string> = {
  kode_buku: "Kode buku",
  judul: "Judul",
  pengarang: "Pengarang",
  penerbit: "Penerbit",
  tahun_terbit: "Tahun terbit",
  isbn: "ISBN",
  kategori: "Kategori",
  lokasi_rak: "Lokasi rak",
  deskripsi: "Deskripsi",
  jumlah_eksemplar: "Jumlah eksemplar",
};

function newRow(): Row {
  return {
    _rowId: crypto.randomUUID(),
    id: null,
    updated_at: null,
    kode_buku: "",
    judul: "",
    pengarang: "",
    penerbit: "",
    tahun_terbit: null,
    isbn: "",
    kategori: "",
    lokasi_rak: "",
    deskripsi: "",
    jumlah_eksemplar: 0,
  };
}

export function BookGridEditor() {
  const { isStaff, loading } = useMe();
  const simpan = useServerFn(simpanEditorBuku);
  const gridRef = useRef<DataSheetGridRef>(null);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortCol, setSortCol] = useState("judul");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterCol, setFilterCol] = useState<string>("");
  const [filterVal, setFilterVal] = useState("");

  const [rows, setRows] = useState<Row[]>([]);
  const [original, setOriginal] = useState<Map<string, Row>>(new Map());
  const [selRange, setSelRange] = useState<{ min: number; max: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const [bulkCol, setBulkCol] = useState("kategori");
  const [bulkVal, setBulkVal] = useState("");

  const q = useQuery({
    queryKey: ["editor-buku", page, pageSize, search, sortCol, sortDir, filterCol, filterVal],
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      let query = supabase
        .from("buku")
        .select(SELECT_COLS, { count: "exact" })
        .is("deleted_at", null);

      if (search.trim()) {
        const s = search.trim().replace(/[%,]/g, "");
        query = query.or(
          `judul.ilike.%${s}%,pengarang.ilike.%${s}%,kode_buku.ilike.%${s}%,isbn.ilike.%${s}%,kategori.ilike.%${s}%`,
        );
      }
      if (filterCol && filterVal.trim()) {
        const v = filterVal.trim();
        if (filterCol === "tahun_terbit") query = query.eq("tahun_terbit", Number(v) || 0);
        else query = query.ilike(filterCol, `%${v.replace(/[%,]/g, "")}%`);
      }
      query = query.order(sortCol, { ascending: sortDir === "asc" }).range(from, to);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as RawBuku[], total: count ?? 0 };
    },
  });

  // Muat ulang state grid setiap data halaman berubah.
  useEffect(() => {
    if (!q.data) return;
    const mapped: Row[] = q.data.rows.map((b) => ({
      _rowId: b.id,
      id: b.id,
      updated_at: b.updated_at,
      kode_buku: b.kode_buku,
      judul: b.judul,
      pengarang: b.pengarang,
      penerbit: b.penerbit,
      tahun_terbit: b.tahun_terbit,
      isbn: b.isbn,
      kategori: b.kategori,
      lokasi_rak: b.lokasi_rak,
      deskripsi: b.deskripsi,
      jumlah_eksemplar: (b.eksemplar ?? []).filter((e) => !e.deleted_at).length,
    }));
    setRows(mapped);
    setOriginal(new Map(mapped.map((r) => [r.id as string, { ...r }])));
  }, [q.data]);

  const isDirty = useCallback(
    (r: Row) => {
      if (!r.id) return !!(r.kode_buku?.trim() && r.judul?.trim());
      const o = original.get(r.id);
      if (!o) return true;
      return FIELDS.some((f) => (r[f] ?? null) !== (o[f] ?? null));
    },
    [original],
  );

  const dirtyCount = useMemo(() => rows.filter(isDirty).length, [rows, isDirty]);
  const deletedIds = useMemo(() => {
    const present = new Set(rows.map((r) => r.id).filter(Boolean));
    return [...original.keys()].filter((id) => !present.has(id));
  }, [rows, original]);
  const hasChanges = dirtyCount > 0 || deletedIds.length > 0;

  const columns: Column<Row>[] = useMemo(
    () => [
      {
        ...keyColumn<Row, "kode_buku">("kode_buku", textColumn),
        title: "Kode buku",
        minWidth: 130,
      },
      { ...keyColumn<Row, "judul">("judul", textColumn), title: "Judul", minWidth: 240, grow: 2 },
      {
        ...keyColumn<Row, "pengarang">("pengarang", textColumn),
        title: "Pengarang",
        minWidth: 160,
      },
      { ...keyColumn<Row, "penerbit">("penerbit", textColumn), title: "Penerbit", minWidth: 150 },
      {
        ...keyColumn<Row, "tahun_terbit">("tahun_terbit", intColumn),
        title: "Tahun",
        minWidth: 90,
      },
      { ...keyColumn<Row, "isbn">("isbn", textColumn), title: "ISBN", minWidth: 130 },
      { ...keyColumn<Row, "kategori">("kategori", textColumn), title: "Kategori", minWidth: 140 },
      {
        ...keyColumn<Row, "lokasi_rak">("lokasi_rak", textColumn),
        title: "Lokasi rak",
        minWidth: 120,
      },
      {
        ...keyColumn<Row, "deskripsi">("deskripsi", textColumn),
        title: "Deskripsi",
        minWidth: 200,
      },
      {
        ...keyColumn<Row, "jumlah_eksemplar">("jumlah_eksemplar", intColumn),
        title: "Jml eksemplar",
        minWidth: 110,
      },
    ],
    [],
  );

  function guarded(action: () => void) {
    if (hasChanges && !confirm("Ada perubahan yang belum disimpan. Buang perubahan?")) return;
    action();
  }

  async function onSave() {
    // Validasi baris kotor
    const dirty = rows.filter(isDirty);
    const invalid = dirty.filter((r) => !(r.kode_buku?.trim() && r.judul?.trim()));
    if (invalid.length) {
      toast.error(`${invalid.length} baris tidak lengkap (kode buku & judul wajib).`);
      return;
    }
    if (!hasChanges) {
      toast.info("Tidak ada perubahan untuk disimpan.");
      return;
    }
    setSaving(true);
    try {
      const payloadRows = dirty.map((r) => ({
        _rowId: r._rowId,
        id: r.id ?? undefined,
        updated_at: r.updated_at ?? undefined,
        kode_buku: r.kode_buku!.trim(),
        judul: r.judul!.trim(),
        pengarang: r.pengarang || null,
        penerbit: r.penerbit || null,
        tahun_terbit: r.tahun_terbit ?? null,
        isbn: r.isbn || null,
        kategori: r.kategori || null,
        lokasi_rak: r.lokasi_rak || null,
        deskripsi: r.deskripsi || null,
        jumlah_eksemplar: r.jumlah_eksemplar ?? null,
      }));
      const res = await simpan({ data: { rows: payloadRows, deleteIds: deletedIds } });
      const bagian: string[] = [];
      if (res.dibuat) bagian.push(`${res.dibuat} dibuat`);
      if (res.diperbarui) bagian.push(`${res.diperbarui} diperbarui`);
      if (res.dihapus) bagian.push(`${res.dihapus} dihapus`);
      if (res.eksemplarDibuat) bagian.push(`+${res.eksemplarDibuat} eksemplar`);
      if (res.eksemplarDihapus) bagian.push(`-${res.eksemplarDihapus} eksemplar`);
      toast.success(`Tersimpan: ${bagian.join(", ") || "tanpa perubahan"}.`);
      if (res.konflik.length) {
        toast.warning(
          `${res.konflik.length} baris bentrok (diubah orang lain): ${res.konflik
            .map((k) => k.kode_buku)
            .join(", ")}. Data dimuat ulang.`,
        );
      }
      if (res.galat.length) {
        toast.error(`${res.galat.length} baris gagal: ${res.galat.map((g) => g.pesan).join("; ")}`);
      }
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  function applyBulk() {
    if (!bulkCol) return;
    const range = selRange ?? (rows.length ? { min: 0, max: rows.length - 1 } : null);
    if (!range) return;
    const isInt = bulkCol === "tahun_terbit" || bulkCol === "jumlah_eksemplar";
    const value: string | number | null = isInt
      ? bulkVal === ""
        ? null
        : Number(bulkVal)
      : bulkVal;
    setRows((prev) =>
      prev.map((r, i) =>
        i >= range.min && i <= range.max ? ({ ...r, [bulkCol]: value } as Row) : r,
      ),
    );
    toast.success(`Terapkan "${KOLOM_LABEL[bulkCol]}" ke ${range.max - range.min + 1} baris.`);
  }

  async function onExport() {
    const id = toast.loading("Menyiapkan berkas .xlsx…");
    try {
      const all: (RawBuku & { eksemplar: RawEksemplar[] })[] = [];
      const CHUNK = 1000;
      for (let start = 0; start < 20000; start += CHUNK) {
        let query = supabase
          .from("buku")
          .select(SELECT_COLS)
          .is("deleted_at", null)
          .order(sortCol, { ascending: sortDir === "asc" })
          .range(start, start + CHUNK - 1);
        if (search.trim()) {
          const s = search.trim().replace(/[%,]/g, "");
          query = query.or(
            `judul.ilike.%${s}%,pengarang.ilike.%${s}%,kode_buku.ilike.%${s}%,isbn.ilike.%${s}%,kategori.ilike.%${s}%`,
          );
        }
        if (filterCol && filterVal.trim()) {
          const v = filterVal.trim();
          if (filterCol === "tahun_terbit") query = query.eq("tahun_terbit", Number(v) || 0);
          else query = query.ilike(filterCol, `%${v.replace(/[%,]/g, "")}%`);
        }
        const { data, error } = await query;
        if (error) throw error;
        const batch = ((data ?? []) as unknown as RawBuku[]).map((b) => ({
          ...b,
          eksemplar: (b.eksemplar ?? []).filter((e) => !e.deleted_at),
        }));
        all.push(...batch);
        if (batch.length < CHUNK) break;
      }
      eksporBukuKeExcel(all, `buku-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`Terunduh ${all.length} buku.`, { id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengekspor.", { id });
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!isStaff) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Halaman ini hanya untuk petugas perpustakaan.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/app">Kembali ke dasbor</Link>
        </Button>
      </div>
    );
  }

  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/app">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Dasbor
            </Link>
          </Button>
          <h1 className="text-lg font-semibold">Editor Buku (mirip Excel)</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="mr-2 h-4 w-4" />
            Unduh .xlsx
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving || !hasChanges}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Simpan{hasChanges ? ` (${dirtyCount + deletedIds.length})` : ""}
          </Button>
        </div>
      </div>

      {/* Toolbar: cari, filter per kolom, urutkan */}
      <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            guarded(() => {
              setPage(0);
              setSearch(searchInput);
            });
          }}
        >
          <div className="space-y-1">
            <Label className="text-xs">Cari</Label>
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Judul / pengarang / kode / ISBN…"
              className="h-9 w-56"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm">
            Cari
          </Button>
        </form>

        <div className="space-y-1">
          <Label className="text-xs">Filter kolom</Label>
          <div className="flex items-center gap-1">
            <Select
              value={filterCol || "none"}
              onValueChange={(v) => guarded(() => setFilterCol(v === "none" ? "" : v))}
            >
              <SelectTrigger className="h-9 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— tidak ada —</SelectItem>
                {Object.entries(KOLOM_LABEL)
                  .filter(([k]) => k !== "deskripsi")
                  .map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Input
              value={filterVal}
              onChange={(e) => setFilterVal(e.target.value)}
              onBlur={() => guarded(() => setPage(0))}
              disabled={!filterCol}
              placeholder="berisi…"
              className="h-9 w-32"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Urutkan</Label>
          <div className="flex items-center gap-1">
            <Select value={sortCol} onValueChange={(v) => guarded(() => setSortCol(v))}>
              <SelectTrigger className="h-9 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(KOLOM_LABEL)
                  .filter(([k]) => k !== "deskripsi")
                  .map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => guarded(() => setSortDir((d) => (d === "asc" ? "desc" : "asc")))}
            >
              {sortDir === "asc" ? "A→Z" : "Z→A"}
            </Button>
          </div>
        </div>
      </div>

      {/* Bulk edit */}
      <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
        <span className="text-sm font-medium">Bulk edit</span>
        <Select value={bulkCol} onValueChange={setBulkCol}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(KOLOM_LABEL)
              .filter(([k]) => k !== "kode_buku")
              .map(([k, l]) => (
                <SelectItem key={k} value={k}>
                  {l}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Input
          value={bulkVal}
          onChange={(e) => setBulkVal(e.target.value)}
          placeholder="nilai baru"
          className="h-9 w-40"
        />
        <Button variant="outline" size="sm" onClick={applyBulk}>
          Terapkan ke {selRange ? selRange.max - selRange.min + 1 : rows.length} baris
        </Button>
        <span className="text-xs text-muted-foreground">
          {selRange ? "baris terpilih" : "semua baris di halaman ini"}
        </span>
      </div>

      {/* Grid */}
      <div className="rounded-md border">
        <DataSheetGrid<Row>
          ref={gridRef}
          value={rows}
          onChange={(v) => setRows(v)}
          columns={columns}
          rowKey="_rowId"
          createRow={newRow}
          duplicateRow={({ rowData }) => ({
            ...rowData,
            _rowId: crypto.randomUUID(),
            id: null,
            updated_at: null,
          })}
          onSelectionChange={({ selection }) =>
            setSelRange(selection ? { min: selection.min.row, max: selection.max.row } : null)
          }
          height={560}
          rowClassName={({ rowData }) => (isDirty(rowData) ? "dsg-row-dirty" : undefined)}
        />
      </div>
      <style>{`.dsg-row-dirty .dsg-cell { background: color-mix(in srgb, var(--primary) 8%, transparent); }`}</style>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Baris per halaman</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) =>
              guarded(() => {
                setPageSize(Number(v));
                setPage(0);
              })
            }
          >
            <SelectTrigger className="h-8 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[50, 100, 200, 500].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setRows((r) => [...r, newRow()])}>
            <Plus className="mr-1 h-4 w-4" />
            Tambah baris
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            {total} buku · Halaman {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page === 0}
            onClick={() => guarded(() => setPage((p) => Math.max(0, p - 1)))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page + 1 >= totalPages}
            onClick={() => guarded(() => setPage((p) => p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {q.isError && (
        <p className="text-sm text-destructive">Gagal memuat data: {(q.error as Error).message}</p>
      )}
    </div>
  );
}
