import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BrandHeader } from "@/components/BrandHeader";
import { BukuDetail } from "@/components/katalog/BukuDetail";
import { SELECT_KATALOG, fotoUrl, ketersediaan, type BukuKatalog } from "@/lib/katalog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, BookOpen, Loader2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/katalog")({
  ssr: false,
  component: KatalogPage,
  head: () => ({ meta: [{ title: "Katalog Buku — Perpus FISIP ULM" }] }),
});

function KatalogPage() {
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<BukuKatalog | null>(null);

  const q = useQuery({
    queryKey: ["katalog-publik", search],
    queryFn: async () => {
      let query = supabase
        .from("buku")
        .select(SELECT_KATALOG)
        .is("deleted_at", null)
        .order("judul")
        .limit(120);
      if (search.trim()) {
        const s = search.trim().replace(/[%,]/g, "");
        query = query.or(
          `judul.ilike.%${s}%,pengarang.ilike.%${s}%,kode_buku.ilike.%${s}%,isbn.ilike.%${s}%,kategori.ilike.%${s}%`,
        );
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as BukuKatalog[];
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/30 to-background">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/">
            <BrandHeader />
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth">Masuk</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">Katalog Buku</h1>
            <p className="text-sm text-muted-foreground">
              Telusuri koleksi Perpustakaan FISIP ULM. Klik buku untuk detail lengkap.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Beranda
            </Link>
          </Button>
        </div>

        <div className="relative mb-4 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari judul / pengarang / kode / ISBN…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {q.isLoading && <Loader2 className="h-6 w-6 animate-spin text-primary" />}
        {q.isError && (
          <p className="text-sm text-destructive">
            Gagal memuat katalog: {(q.error as Error).message}
          </p>
        )}
        {q.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">Tidak ada buku ditemukan.</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {q.data?.map((b) => {
            const { tersedia, total } = ketersediaan(b);
            const foto = fotoUrl(b);
            return (
              <Card key={b.id} className="overflow-hidden transition hover:shadow-md">
                <CardContent className="flex gap-3 p-3">
                  <div className="flex h-24 w-16 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
                    {foto ? (
                      <img src={foto} alt={b.judul ?? ""} className="h-full w-full object-cover" />
                    ) : (
                      <BookOpen className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-medium">{b.judul ?? "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">{b.pengarang ?? "—"}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {b.kode_buku ?? ""}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge
                        variant={tersedia > 0 ? "default" : "destructive"}
                        className="text-[10px]"
                      >
                        {tersedia > 0 ? `🟩 ${tersedia}/${total}` : "🟥 Kosong"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2"
                        onClick={() => setDetail(b)}
                      >
                        Detail
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-auto">
          <DialogHeader>
            <DialogTitle>{detail?.judul ?? "Detail buku"}</DialogTitle>
          </DialogHeader>
          {detail && <BukuDetail buku={detail} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
