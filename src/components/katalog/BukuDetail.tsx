import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";
import { KOLOM_KATALOG, metaSisa, fotoUrl, ketersediaan, type BukuKatalog } from "@/lib/katalog";

/** Menampilkan SELURUH informasi buku (kolom sheet-7-tina) + pratinjau foto. */
export function BukuDetail({ buku }: { buku: BukuKatalog }) {
  const foto = fotoUrl(buku);
  const { tersedia, total } = ketersediaan(buku);
  const baris = KOLOM_KATALOG.map((k) => ({ label: k.label, value: k.get(buku) })).filter(
    (r) => r.value != null && r.value !== "",
  );
  const sisa = metaSisa(buku);

  return (
    <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
      <div>
        <div className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-md border bg-muted">
          {foto ? (
            <img
              src={foto}
              alt={buku.judul ?? "Sampul buku"}
              className="h-full w-full object-cover"
            />
          ) : (
            <BookOpen className="h-10 w-10 text-muted-foreground" />
          )}
        </div>
        <div className="mt-2">
          <Badge variant={tersedia > 0 ? "default" : "destructive"}>
            {tersedia}/{total} tersedia
          </Badge>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm">
        {baris.map((r) => (
          <div key={r.label} className="grid grid-cols-[128px_1fr] gap-2 border-b py-1">
            <dt className="text-xs font-medium text-muted-foreground">{r.label}</dt>
            <dd className="break-words">{r.value}</dd>
          </div>
        ))}
        {sisa.map((r) => (
          <div key={r.key} className="grid grid-cols-[128px_1fr] gap-2 border-b py-1">
            <dt className="text-xs font-medium text-muted-foreground">{r.key}</dt>
            <dd className="break-words">{r.value}</dd>
          </div>
        ))}
        {baris.length === 0 && sisa.length === 0 && (
          <p className="text-sm text-muted-foreground">Tidak ada data.</p>
        )}
      </dl>
    </div>
  );
}
