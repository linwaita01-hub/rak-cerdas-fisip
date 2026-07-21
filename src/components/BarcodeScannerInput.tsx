import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, ScanLine } from "lucide-react";

type Props = {
  onScan: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

/**
 * Input scan barcode:
 * - Scanner USB (HID keyboard) mengetik ke input & tekan Enter → onScan
 * - Tombol kamera membuka html5-qrcode untuk memindai via kamera HP
 */
export function BarcodeScannerInput({ onScan, placeholder = "Scan atau ketik barcode…", autoFocus }: Props) {
  const [value, setValue] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function submit() {
    const v = value.trim();
    if (!v) return;
    onScan(v);
    setValue("");
    inputRef.current?.focus();
  }

  return (
    <div className="flex gap-2">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        placeholder={placeholder}
      />
      <Button type="button" onClick={submit} variant="secondary">
        <ScanLine className="mr-2 h-4 w-4" />Proses
      </Button>
      <Button type="button" onClick={() => setCameraOpen(true)} variant="outline" size="icon" aria-label="Buka kamera">
        <Camera className="h-4 w-4" />
      </Button>
      <CameraScanner
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onScan={(v) => { setCameraOpen(false); onScan(v); }}
      />
    </div>
  );
}

function CameraScanner({ open, onOpenChange, onScan }: { open: boolean; onOpenChange: (o: boolean) => void; onScan: (v: string) => void }) {
  const containerId = "cam-scanner-region";
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    let alive = true;
    if (!open) return;
    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (!alive) return;
      const el = document.getElementById(containerId);
      if (!el) return;
      const inst = new Html5Qrcode(containerId, { verbose: false });
      instanceRef.current = inst;
      try {
        await inst.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 120 } },
          (decoded) => {
            onScan(decoded);
            inst.stop().catch(() => {});
          },
          () => {},
        );
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      alive = false;
      const inst = instanceRef.current;
      if (inst) {
        try { inst.stop().then(() => inst.clear()).catch(() => {}); } catch { /* ignore */ }
        instanceRef.current = null;
      }
    };
  }, [open, onScan]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Pindai dengan kamera</DialogTitle></DialogHeader>
        <div id={containerId} className="w-full overflow-hidden rounded-md bg-black" />
        <p className="text-xs text-muted-foreground">Arahkan barcode ke kotak pindai. Izinkan akses kamera bila diminta.</p>
      </DialogContent>
    </Dialog>
  );
}
