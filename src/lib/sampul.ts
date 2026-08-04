import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Kembalikan string mentah apa adanya untuk URL/data/blob; jika berupa path
// bucket 'sampul' (publik), pakai URL publik agar sampul tampil untuk semua
// pengunjung katalog tanpa perlu akun.
export function isExternal(raw: string): boolean {
  return /^(https?:|data:|blob:)/i.test(raw);
}

export function publicSampulUrl(path: string): string | null {
  if (!path) return null;
  if (isExternal(path)) return path;
  const { data } = supabase.storage.from("sampul").getPublicUrl(path);
  return data?.publicUrl ?? null;
}

// Dipertahankan untuk kompatibilitas pemanggil lama.
export async function signSampul(path: string): Promise<string | null> {
  return publicSampulUrl(path);
}

export function useSampul(raw: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() =>
    raw ? publicSampulUrl(raw) : null,
  );
  useEffect(() => {
    setUrl(raw ? publicSampulUrl(raw) : null);
  }, [raw]);
  return url;
}
