import { test } from "@playwright/test";
import {
  login,
  gotoHydrated,
  waitHydrated,
  ADMIN,
  getToken,
  bukuByKode,
  cleanupE2E,
  expect,
} from "./helpers";

test.describe("Editor Buku mirip Excel (PART 5)", () => {
  let token: string;
  test.beforeAll(async () => {
    token = await getToken(ADMIN.email, ADMIN.password);
    await cleanupE2E(token);
  });
  test.afterAll(async () => {
    await cleanupE2E(token);
  });

  test("tambah baris, edit sel, simpan, muat ulang → perubahan tersimpan", async ({ page }) => {
    const kode = `E2E-${Date.now()}`;
    const judul = `E2E Editor ${kode}`;

    await login(page, ADMIN.email, ADMIN.password);
    await gotoHydrated(page, "/editor-buku");
    await expect(page.getByRole("heading", { name: /Editor Buku/ })).toBeVisible();

    // Tambah satu baris lalu edit dua sel (double-click → ketik → Enter).
    await page.getByRole("button", { name: /Tambah baris/ }).click();
    const dataCells = page.locator(".dsg-cell:not(.dsg-cell-header):not(.dsg-cell-gutter)");
    await dataCells.first().dblclick();
    await page.keyboard.type(kode);
    await page.keyboard.press("Enter");
    await dataCells.nth(1).dblclick();
    await page.keyboard.type(judul);
    await page.keyboard.press("Enter");

    await page.getByRole("button", { name: /^Simpan/ }).click();
    await expect(page.getByText(/Tersimpan/i)).toBeVisible();

    // Persistensi di DB.
    const row = await bukuByKode(token, kode);
    expect(row?.judul).toBe(judul);

    // Muat ulang UI → cari → baris muncul kembali dengan nilai tersimpan.
    await page.reload();
    await waitHydrated(page);
    await expect(page.getByRole("heading", { name: /Editor Buku/ })).toBeVisible();
    await page.getByPlaceholder(/Judul \/ pengarang/).fill(kode);
    await page.getByRole("button", { name: "Cari", exact: true }).click();
    await expect
      .poll(
        async () =>
          page.evaluate(
            (k) =>
              [...document.querySelectorAll(".dsg-input")].some(
                (i) => (i as HTMLInputElement).value === k,
              ),
            kode,
          ),
        { timeout: 15_000 },
      )
      .toBe(true);
  });
});
