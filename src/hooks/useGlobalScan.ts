import { useEffect, useRef } from "react";

/**
 * Menangkap hasil scanner barcode (HID keyboard-wedge) secara GLOBAL, walau
 * tidak ada kolom input yang difokuskan.
 *
 * Scanner "mengetik" karakter barcode sangat cepat lalu menekan Enter. Hook ini
 * mendeteksi burst ketikan cepat (jeda antar-tombol < maxIntervalMs) yang cukup
 * panjang dan diakhiri Enter → menganggapnya sebagai scan lalu memanggil onScan.
 *
 * Sengaja NONAKTIF saat fokus berada di input/textarea/elemen editable, agar:
 *  - tidak mengganggu ketikan manual (nama mahasiswa, durasi, dll.), dan
 *  - kolom scan khusus (BarcodeScannerInput) yang sedang fokus tetap yang menangani.
 */
export function useGlobalScan(
  onScan: (code: string) => void,
  opts?: { minLength?: number; maxIntervalMs?: number; enabled?: boolean },
) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const enabled = opts?.enabled ?? true;
  const minLength = opts?.minLength ?? 3;
  const maxInterval = opts?.maxIntervalMs ?? 60;

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    let buffer = "";
    let lastTime = 0;

    const isEditable = (el: Element | null): boolean => {
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (el as HTMLElement).isContentEditable === true
      );
    };

    const onKey = (e: KeyboardEvent) => {
      // Biarkan kolom teks yang fokus menangani sendiri.
      if (isEditable(document.activeElement)) {
        buffer = "";
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (e.key === "Enter") {
        if (buffer.length >= minLength) {
          const code = buffer;
          buffer = "";
          e.preventDefault();
          onScanRef.current(code);
        } else {
          buffer = "";
        }
        return;
      }

      // Hanya karakter tunggal (abaikan Shift, Tab, panah, dll.).
      if (e.key.length !== 1) return;
      const t = e.timeStamp;
      // Jeda terlalu lama → mulai sekuens baru (bukan scan berkelanjutan).
      if (buffer && t - lastTime > maxInterval) buffer = "";
      buffer += e.key;
      lastTime = t;
    };

    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [enabled, minLength, maxInterval]);
}
