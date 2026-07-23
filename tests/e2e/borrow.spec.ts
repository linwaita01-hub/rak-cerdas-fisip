import { test } from "@playwright/test";
import {
  login,
  ADMIN,
  MAHASISWA,
  getToken,
  seedBook,
  cleanupE2E,
  eksemplarStatus,
  peminjamanStatus,
  eksemplarIdByBarcode,
  profilIdByEmail,
  buatMenunggu,
  callRpc,
  rpcAda,
  expect,
} from "./helpers";

const DUMMY_ID = "00000000-0000-0000-0000-000000000000";

test.describe("Alur pinjam di meja (model baru)", () => {
  let token: string;
  test.beforeAll(async () => {
    token = await getToken(ADMIN.email, ADMIN.password);
    await cleanupE2E(token);
  });
  test.afterAll(async () => {
    await cleanupE2E(token);
  });

  test("admin scan + pilih mahasiswa → menunggu konfirmasi + eksemplar dipesan", async ({
    page,
  }) => {
    const { bukuId, barcode, judul } = await seedBook(token);

    await login(page, ADMIN.email, ADMIN.password);
    // Tab Transaksi default; kartu "Pinjam di meja" muncul pertama.
    const scan = page.getByPlaceholder(/Scan \/ ketik barcode buku/);
    await scan.fill(barcode);
    await scan.press("Enter");
    await expect(page.getByText(judul).first()).toBeVisible();

    // Cari & pilih mahasiswa demo.
    await page.getByPlaceholder(/Cari nama \/ NIM \/ email/).fill("Mahasiswa Demo");
    await page
      .getByRole("button", { name: /Mahasiswa Demo/ })
      .first()
      .click();

    await page.getByRole("button", { name: /Kirim permintaan konfirmasi/ }).click();
    await expect(page.getByText(/Permintaan dikirim/i)).toBeVisible();

    await expect.poll(async () => peminjamanStatus(token, bukuId)).toBe("menunggu");
    expect(await eksemplarStatus(token, barcode)).toBe("dipesan");
  });

  test("mahasiswa konfirmasi (RPC) → dipinjam → kembalikan → tersedia", async ({ page }) => {
    const mhsToken = await getToken(MAHASISWA.email, MAHASISWA.password);
    const ada = await rpcAda(mhsToken, "konfirmasi_peminjaman", { _id: DUMMY_ID });
    test.skip(
      !ada,
      "RPC konfirmasi_peminjaman belum ada di DB — terapkan migrasi 20260721130000 via Lovable, lalu jalankan lagi.",
    );

    const { bukuId, barcode } = await seedBook(token);
    const eksemplarId = await eksemplarIdByBarcode(token, barcode);
    const userId = await profilIdByEmail(token, MAHASISWA.email);
    expect(eksemplarId && userId).toBeTruthy();
    const pinjamId = await buatMenunggu(token, {
      bukuId,
      eksemplarId: eksemplarId!,
      userId: userId!,
    });

    // Mahasiswa mengonfirmasi lewat RPC (yang dipakai dialog konfirmasi).
    const r = await callRpc(mhsToken, "konfirmasi_peminjaman", { _id: pinjamId });
    expect(r.status).toBeLessThan(300);
    await expect.poll(async () => peminjamanStatus(token, bukuId)).toBe("dipinjam");
    expect(await eksemplarStatus(token, barcode)).toBe("dipinjam");

    // Admin mengembalikan via scan.
    await login(page, ADMIN.email, ADMIN.password);
    const kembali = page.getByPlaceholder(/Scan barcode eksemplar untuk pengembalian/);
    await kembali.fill(barcode);
    await kembali.press("Enter");
    await expect(page.getByText(/dikembalikan/i)).toBeVisible();

    await expect.poll(async () => eksemplarStatus(token, barcode)).toBe("tersedia");
    expect(await peminjamanStatus(token, bukuId)).toBe("dikembalikan");
  });
});
