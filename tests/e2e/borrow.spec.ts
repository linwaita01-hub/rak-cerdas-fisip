import { test } from "@playwright/test";
import {
  login,
  ADMIN,
  getToken,
  seedBook,
  cleanupE2E,
  eksemplarStatus,
  peminjamanStatus,
  expect,
} from "./helpers";

test.describe("Alur pinjam di meja (model langsung aktif)", () => {
  let token: string;
  test.beforeAll(async () => {
    token = await getToken(ADMIN.email, ADMIN.password);
    await cleanupE2E(token);
  });
  test.afterAll(async () => {
    await cleanupE2E(token);
  });

  test("admin scan + pilih mahasiswa → dipinjam + eksemplar dipinjam", async ({ page }) => {
    const { bukuId, barcode, judul } = await seedBook(token);

    await login(page, ADMIN.email, ADMIN.password);
    // Kartu "Pinjam di meja" muncul pertama di tab Transaksi (default).
    const scan = page.getByPlaceholder(/Scan \/ ketik barcode buku/);
    await scan.fill(barcode);
    await scan.press("Enter");
    await expect(page.getByText(judul).first()).toBeVisible();

    // Cari & pilih mahasiswa terdaftar apa saja (nama tidak dispesifikasi
    // — biarkan admin memilih baris pertama hasil pencarian).
    await page.getByPlaceholder(/Cari nama \/ NIM \/ email/).fill("a");
    const kandidat = page.getByRole("button").filter({ hasText: /·/ }).first();
    await expect(kandidat).toBeVisible();
    await kandidat.click();

    await page.getByRole("button", { name: /Catat peminjaman/ }).click();
    await expect(page.getByText(/Peminjaman dicatat/i)).toBeVisible();

    // Langsung aktif — tanpa fase menunggu.
    await expect.poll(async () => peminjamanStatus(token, bukuId)).toBe("dipinjam");
    expect(await eksemplarStatus(token, barcode)).toBe("dipinjam");
  });
});
