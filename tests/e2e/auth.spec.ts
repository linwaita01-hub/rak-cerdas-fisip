import { test, expect } from "@playwright/test";
import { login, gotoHydrated, ADMIN, MAHASISWA } from "./helpers";

test.describe("Autentikasi & halaman masuk", () => {
  test("login admin sampai di dasbor admin", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    // Dasbor staf punya tab-tab ini.
    await expect(page.getByRole("tab", { name: "Transaksi" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Inventaris" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Pengaturan" })).toBeVisible();
  });

  test("login mahasiswa sampai di katalog", async ({ page }) => {
    await login(page, MAHASISWA.email, MAHASISWA.password);
    await expect(page.getByRole("tab", { name: "Katalog" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Pinjaman Saya" })).toBeVisible();
  });

  test("lupa sandi menampilkan konfirmasi tautan reset", async ({ page }) => {
    await gotoHydrated(page, "/auth");
    await page.getByRole("tab", { name: "Lupa" }).click();
    await page.locator("#fp-email").fill("mahasiswa.demo@fisip.ulm.ac.id");
    await page.getByRole("button", { name: /Kirim tautan reset/i }).click();
    await expect(page.getByText(/Tautan reset sandi telah dikirim/i)).toBeVisible();
  });

  test("tombol lihat sandi mengubah type input", async ({ page }) => {
    await gotoHydrated(page, "/auth");
    const pass = page.locator("#login-pass");
    await pass.fill("rahasia123");
    await expect(pass).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Lihat sandi" }).click();
    await expect(pass).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Sembunyikan sandi" }).click();
    await expect(pass).toHaveAttribute("type", "password");
  });

  test("kredensial demo TIDAK muncul di halaman login (regresi)", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.locator("body")).toBeVisible();
    const body = page.locator("body");
    await expect(body).not.toContainText("admin.demo@fisip.ulm.ac.id");
    await expect(body).not.toContainText("mahasiswa.demo@fisip.ulm.ac.id");
    await expect(body).not.toContainText("AdminDemo#2026");
    await expect(body).not.toContainText("MhsDemo#2026");
  });
});
