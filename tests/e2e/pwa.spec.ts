import { test, expect } from "@playwright/test";

test.describe("PWA / installability (PART 4)", () => {
  test("manifest termuat & service worker terdaftar", async ({ page }) => {
    await page.goto("/");

    // Link manifest ada di <head>.
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );

    // Manifest valid + berisi ikon 192 & 512.
    const manifest = await page.evaluate(async () => {
      const r = await fetch("/manifest.webmanifest");
      return { status: r.status, json: await r.json() };
    });
    expect(manifest.status).toBe(200);
    expect(manifest.json.name).toContain("Perpus FISIP ULM");
    expect(manifest.json.display).toBe("standalone");
    const sizes = manifest.json.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");

    // Service worker teregistrasi & aktif.
    const swActive = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      return !!reg && (!!reg.active || !!reg.installing || !!reg.waiting);
    });
    expect(swActive).toBe(true);

    // Ikon dapat diakses.
    const icon = await page.evaluate(async () => (await fetch("/icon-512.png")).status);
    expect(icon).toBe(200);
  });
});
