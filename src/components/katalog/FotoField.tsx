import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Clipboard, X, Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Menyelesaikan nilai sampul menjadi URL yang bisa dirender.
function resolveSrc(raw: string): string | null {
  if (!raw) return null;
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  return supabase.storage.from("sampul").getPublicUrl(raw).data.publicUrl;
}

/**
 * Input foto sampul buku: unggah file, tempel gambar dari clipboard (Ctrl+V
 * di kotak atau tombol), seret & lepas, atau isi URL. Gambar diunggah ke bucket
 * Storage 'sampul'; yang disimpan ke DB adalah path-nya (sampul_path).
 */
export function FotoField({
  value,
  onChange,
  kodeBuku,
}: {
  value: string;
  onChange: (v: string) => void;
  kodeBuku?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const src = resolveSrc(value);

  async function unggah(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Berkas harus berupa gambar.");
      return;
    }
    setUploading(true);
    try {
      const ext = (file.type.split("/")[1] || "png").split("+")[0];
      const safeKode = (kodeBuku || "buku").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 40);
      const path = `${safeKode}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("sampul")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      onChange(path);
      toast.success("Foto terunggah.");
    } catch (e) {
      toast.error(
        e instanceof Error
          ? `Gagal mengunggah: ${e.message} (pastikan bucket 'sampul' sudah dibuat).`
          : "Gagal mengunggah foto.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function tempelDariClipboard() {
    try {
      const nav = navigator as Navigator & {
        clipboard?: { read?: () => Promise<ClipboardItem[]> };
      };
      if (!nav.clipboard?.read) {
        toast.error("Browser tak mendukung tombol tempel. Klik kotak lalu tekan Ctrl+V.");
        return;
      }
      const items = await nav.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await it.getType(type);
          await unggah(new File([blob], `tempel.${type.split("/")[1]}`, { type }));
          return;
        }
      }
      toast.error("Tidak ada gambar di clipboard.");
    } catch {
      toast.error("Gagal membaca clipboard.");
    }
  }

  return (
    <div
      className="rounded-md border border-dashed p-3 focus-within:ring-1 focus-within:ring-ring"
      tabIndex={0}
      onPaste={(e) => {
        const f = Array.from(e.clipboardData?.files ?? [])[0];
        if (f) {
          e.preventDefault();
          void unggah(f);
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) void unggah(f);
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-24 w-16 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
          {src ? (
            <img src={src} alt="Sampul" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void unggah(f);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Unggah file
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={tempelDariClipboard}
            >
              <Clipboard className="mr-2 h-4 w-4" />
              Tempel gambar
            </Button>
            {value && (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
                <X className="mr-1 h-4 w-4" />
                Hapus
              </Button>
            )}
          </div>
          <Input
            placeholder="atau tempel URL gambar…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Seret &amp; lepas gambar, tempel (Ctrl+V) di kotak ini, unggah berkas, atau isi URL.
          </p>
        </div>
      </div>
    </div>
  );
}
