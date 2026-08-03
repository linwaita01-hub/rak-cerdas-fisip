import { useEffect } from "react";

/**
 * Mendaftarkan service worker (untuk cache/offline). TIDAK menampilkan prompt
 * "Pasang aplikasi" — banner install sengaja dihilangkan atas permintaan.
 * Aman untuk SSR: tidak merender apa pun.
 */
export function PwaManager() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker
        // updateViaCache: "none" mencegah service worker basi (penyebab umum
        // error "Failed to fetch" setelah aplikasi diperbarui).
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => {
          void reg.update();
          reg.addEventListener("updatefound", () => {
            const sw = reg.installing;
            if (!sw) return;
            sw.addEventListener("statechange", () => {
              if (sw.state === "installed" && navigator.serviceWorker.controller) {
                sw.postMessage("SKIP_WAITING");
              }
            });
          });
        })
        .catch(() => {
          /* registrasi gagal — aplikasi tetap berjalan online */
        });
    };

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
