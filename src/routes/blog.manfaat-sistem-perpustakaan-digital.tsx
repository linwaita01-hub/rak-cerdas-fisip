import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandHeader } from "@/components/BrandHeader";

const CANONICAL = "https://rak-cerdas-fisip.lovable.app/blog/manfaat-sistem-perpustakaan-digital";
const TITLE =
  "Manfaat Library Management System untuk Perpustakaan Kampus | FISIP ULM";
const DESCRIPTION =
  "Panduan lengkap manfaat library management system modern: pemantauan real-time, pemindaian barcode Code128, reservasi otomatis, dan efisiensi riset akademik di perpustakaan FISIP UNLAM.";

export const Route = createFileRoute("/blog/manfaat-sistem-perpustakaan-digital")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "library management system, sistem perpustakaan digital, manajemen perpustakaan kampus, barcode perpustakaan, reservasi buku online, perpustakaan FISIP ULM",
      },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
          description: DESCRIPTION,
          inLanguage: "id-ID",
          author: {
            "@type": "Organization",
            name: "Perpustakaan FISIP Universitas Lambung Mangkurat",
          },
          publisher: {
            "@type": "Organization",
            name: "FISIP UNLAM",
          },
          mainEntityOfPage: CANONICAL,
          datePublished: "2026-07-27",
          dateModified: "2026-07-27",
        }),
      },
    ],
  }),
  component: ArtikelManfaatSistem,
});

function ArtikelManfaatSistem() {
  return (
    <div className="min-h-screen bg-background">
      <BrandHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <nav className="mb-6 text-sm text-muted-foreground">
          <Link to="/" className="hover:underline">
            Beranda
          </Link>{" "}
          / <span>Blog</span> / <span>Manfaat Library Management System</span>
        </nav>

        <article className="prose prose-neutral max-w-none dark:prose-invert">
          <h1 className="text-3xl font-bold tracking-tight">
            Manfaat Library Management System Modern untuk Perpustakaan Kampus
          </h1>
          <p className="text-muted-foreground">
            Panduan lengkap bagaimana <strong>library management system</strong>{" "}
            berbasis web dan barcode meningkatkan efisiensi riset akademik,
            akurasi inventaris, dan pengalaman mahasiswa — dengan contoh
            implementasi nyata di Perpustakaan FISIP Universitas Lambung
            Mangkurat.
          </p>

          <h2>Apa itu library management system?</h2>
          <p>
            Library management system (LMS) adalah perangkat lunak yang
            mengelola seluruh siklus hidup koleksi perpustakaan: pengadaan,
            katalogisasi, sirkulasi (peminjaman/pengembalian), reservasi,
            denda, hingga pelaporan. LMS modern berbasis web menggantikan
            pencatatan manual sehingga data buku, eksemplar, dan transaksi
            tersinkronisasi secara real-time bagi petugas maupun mahasiswa.
          </p>

          <h2>7 manfaat utama untuk perpustakaan kampus</h2>
          <ol>
            <li>
              <strong>Pemantauan status real-time.</strong> Petugas dan
              mahasiswa langsung tahu apakah eksemplar tertentu tersedia,
              dipinjam, dipesan, atau sedang diperbaiki tanpa menunggu update
              manual.
            </li>
            <li>
              <strong>Pemindaian barcode Code128.</strong> Setiap eksemplar
              memiliki barcode unik yang dapat dipindai menggunakan scanner
              USB (keyboard-wedge) atau kamera HP, mempercepat proses pinjam
              dan pengembalian hingga beberapa detik per transaksi.
            </li>
            <li>
              <strong>Reservasi &amp; antrian otomatis.</strong> Ketika buku
              populer sedang dipinjam, mahasiswa dapat memesan lebih dulu.
              Sistem otomatis memberitahu ketika buku kembali dan menetapkan
              batas ambil (mis. 48 jam) agar antrian bergerak adil.
            </li>
            <li>
              <strong>Perhitungan denda otomatis.</strong> Tarif harian, masa
              tenggang, dan batas maksimum dihitung server-side sehingga
              tidak ada perselisihan angka di meja sirkulasi.
            </li>
            <li>
              <strong>Audit trail &amp; undo.</strong> Riwayat perubahan
              metadata buku disimpan sehingga kesalahan edit dapat dikembalikan
              dengan satu klik — penting untuk katalog yang dikelola banyak
              petugas.
            </li>
            <li>
              <strong>Impor/ekspor Excel.</strong> Migrasi katalog lama atau
              pelaporan ke pimpinan fakultas cukup dengan file{" "}
              <code>.xlsx</code>, termasuk deteksi header otomatis dan
              resolusi duplikat.
            </li>
            <li>
              <strong>Aksesibilitas PWA.</strong> Aplikasi dapat dipasang di
              HP mahasiswa, bekerja offline sebagian, dan memberi notifikasi
              push saat buku reservasi telah tersedia.
            </li>
          </ol>

          <h2>Studi kasus: Perpustakaan FISIP UNLAM</h2>
          <p>
            Sistem <em>Peminjaman Buku Perpus UNLAM FISIP</em> dibangun
            sebagai PWA responsif dengan Row-Level Security ketat. Beberapa
            fitur khas yang menjawab masalah nyata perpustakaan kampus:
          </p>
          <ul>
            <li>
              <strong>Alur konfirmasi peminjaman dua-langkah.</strong> Petugas
              memindai barcode di meja, mahasiswa mengonfirmasi lewat aplikasi
              — menghilangkan risiko pinjam atas nama orang lain.
            </li>
            <li>
              <strong>Cetak label barcode massal.</strong> Petugas dapat
              memilih banyak eksemplar sekaligus lalu mencetak label Code128
              siap tempel.
            </li>
            <li>
              <strong>Peran berjenjang.</strong> Super admin, admin, admin
              sementara, dan mahasiswa memiliki hak akses berbeda, dikelola
              melalui tabel <code>user_roles</code> dan fungsi{" "}
              <code>has_role()</code>.
            </li>
            <li>
              <strong>Tempat sampah &amp; auto-purge 60 hari.</strong> Data
              yang dihapus dapat dipulihkan sebelum benar-benar hilang
              permanen.
            </li>
          </ul>

          <h2>Bagaimana barcode scanning meningkatkan efisiensi riset?</h2>
          <p>
            Mahasiswa yang sedang menyusun skripsi biasanya meminjam banyak
            referensi dalam waktu singkat. Dengan barcode scanning, transaksi
            di meja sirkulasi turun dari &gt;60 detik (pencatatan manual)
            menjadi &lt;10 detik per eksemplar. Kombinasi dengan status
            real-time berarti mahasiswa dapat mengecek ketersediaan sebelum
            datang ke perpustakaan, menghemat waktu perjalanan dan mempercepat
            iterasi riset.
          </p>

          <h2>Checklist memilih library management system</h2>
          <ul>
            <li>Mendukung banyak eksemplar per judul buku.</li>
            <li>
              Mendukung barcode standar (Code128/EAN) dan scanner USB maupun
              kamera.
            </li>
            <li>Row-Level Security atau setara agar data mahasiswa aman.</li>
            <li>Impor/ekspor Excel dan audit trail bawaan.</li>
            <li>Progressive Web App agar tidak perlu instal manual.</li>
            <li>Notifikasi push untuk reservasi dan pengingat jatuh tempo.</li>
          </ul>

          <h2>Kesimpulan</h2>
          <p>
            Menggunakan library management system modern bukan sekadar
            digitalisasi katalog — melainkan meningkatkan akurasi inventaris,
            keadilan antrian, dan produktivitas riset akademik. Sistem
            Perpustakaan FISIP UNLAM menunjukkan bahwa fitur seperti barcode
            scanning, status monitoring real-time, dan reservasi otomatis
            dapat diterapkan tanpa infrastruktur mahal.
          </p>

          <div className="mt-8 rounded-lg border bg-muted/40 p-4">
            <p className="mb-2 font-medium">Coba sistemnya</p>
            <p className="text-sm text-muted-foreground">
              Mahasiswa dan petugas FISIP ULM dapat masuk melalui halaman{" "}
              <Link to="/auth" className="text-primary underline">
                autentikasi
              </Link>{" "}
              atau kembali ke{" "}
              <Link to="/" className="text-primary underline">
                beranda
              </Link>
              .
            </p>
          </div>
        </article>
      </main>
    </div>
  );
}
