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
  expect,
} from "./helpers";

test.describe("Alur peminjaman end-to-end", () => {
  let token: string;
  test.beforeAll(async () => {
    token = await getToken(ADMIN.email, ADMIN.password);
    await cleanupE2E(token);
  });
  test.afterAll(async () => {
    await cleanupE2E(token);
  });

  test("mahasiswa ajukan → admin setujui → dipinjam → kembalikan → tersedia", async ({
    browser,
  }) => {
    const { bukuId, barcode, judul } = await seedBook(token);

    // --- Mahasiswa mengajukan pinjam ---
    const mCtx = await browser.newContext();
    const mPage = await mCtx.newPage();
    await login(mPage, MAHASISWA.email, MAHASISWA.password);
    await mPage.getByPlaceholder(/Cari judul \/ pengarang/).fill(judul);
    const ajukan = mPage.getByRole("button", { name: "Ajukan pinjam" });
    await expect(ajukan).toBeEnabled();
    await ajukan.click();
    await expect(mPage.getByText(/Pengajuan dikirim/i)).toBeVisible();
    await mCtx.close();

    expect(await peminjamanStatus(token, bukuId)).toBe("menunggu");

    // --- Admin menyetujui via scan barcode ---
    const aCtx = await browser.newContext();
    const aPage = await aCtx.newPage();
    await login(aPage, ADMIN.email, ADMIN.password);
    await expect(aPage.getByText(judul).first()).toBeVisible();
    await aPage
      .getByRole("button", { name: /Setujui/ })
      .first()
      .click();
    const dialog = aPage.getByRole("dialog");
    const scan = dialog.getByRole("textbox").first();
    await scan.fill(barcode);
    await scan.press("Enter");
    await expect(aPage.getByText(/disetujui/i)).toBeVisible();

    await expect.poll(async () => peminjamanStatus(token, bukuId)).toBe("dipinjam");
    expect(await eksemplarStatus(token, barcode)).toBe("dipinjam");

    // --- Admin mengembalikan via scan barcode ---
    const kembali = aPage.getByPlaceholder(/Scan barcode eksemplar untuk pengembalian/);
    await kembali.fill(barcode);
    await kembali.press("Enter");
    await expect(aPage.getByText(/dikembalikan/i)).toBeVisible();

    await expect.poll(async () => eksemplarStatus(token, barcode)).toBe("tersedia");
    expect(await peminjamanStatus(token, bukuId)).toBe("dikembalikan");
    await aCtx.close();
  });
});
