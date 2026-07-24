import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandHeader } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";
import { BookOpen, ScanLine, ShieldCheck } from "lucide-react";

const PAGE_URL = "https://rak-cerdas-fisip.lovable.app/";
const PAGE_IMG = "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/ffe8b974-8c2a-47d2-86d0-c598e144da9e/id-preview-7d49e030--8d716ddb-2516-4ad4-8c7a-d1bfdc57be35.lovable.app-1784672728957.png";
const PAGE_TITLE = "Peminjaman Buku Perpus FISIP ULM — Katalog & Layanan Mahasiswa";
const PAGE_DESC = "Beranda layanan peminjaman buku Perpustakaan FISIP Universitas Lambung Mangkurat: pencarian katalog, ajukan pinjaman, dan pantau status via barcode.";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESC },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESC },
      { property: "og:url", content: PAGE_URL },
      { property: "og:image", content: PAGE_IMG },
      { name: "twitter:title", content: PAGE_TITLE },
      { name: "twitter:description", content: PAGE_DESC },
      { name: "twitter:image", content: PAGE_IMG },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
  }),
});

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
  }, [navigate]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-secondary/40 to-background">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-10 px-6 py-16">
        <BrandHeader subtitle="Peminjaman Buku Perpustakaan FISIP" />

        <div className="max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Pinjam buku perpustakaan lebih mudah & cepat
          </h2>
          <p className="mt-3 text-muted-foreground">
            Ajukan peminjaman, pantau status, dan kembalikan dengan pindai barcode. Terintegrasi
            untuk mahasiswa dan admin perpustakaan FISIP ULM.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Masuk / Daftar</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/katalog">Lihat Katalog</Link>
            </Button>
          </div>
        </div>

        <div className="grid w-full gap-4 sm:grid-cols-3">
          {[
            {
              icon: BookOpen,
              title: "Katalog Lengkap",
              desc: "Cari buku berdasar judul, pengarang, atau kategori.",
            },
            {
              icon: ScanLine,
              title: "Scan Barcode",
              desc: "Persetujuan dan pengembalian cepat via scanner atau kamera.",
            },
            {
              icon: ShieldCheck,
              title: "Aman & Terkelola",
              desc: "Peran & izin diatur ketat sesuai kebijakan perpustakaan.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-5 shadow-sm">
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
