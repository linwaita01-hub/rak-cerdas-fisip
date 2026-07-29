import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Kembalikan string mentah apa adanya untuk URL/data/blob; jika berupa path
// bucket 'sampul' (privat), gunakan signed URL agar bisa dirender.
const cache = new Map<string, { url: string; exp: number }>();

export function isExternal(raw: string): boolean {
  return /^(https?:|data:|blob:)/i.test(raw);
}

export async function signSampul(path: string): Promise<string | null> {
  if (!path) return null;
  if (isExternal(path)) return path;
  const now = Date.now();
  const hit = cache.get(path);
  if (hit && hit.exp > now + 30_000) return hit.url;
  const { data, error } = await supabase.storage
    .from("sampul")
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, exp: now + 3600 * 1000 });
  return data.signedUrl;
}

export function useSampul(raw: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() =>
    raw && isExternal(raw) ? raw : null,
  );
  useEffect(() => {
    let alive = true;
    if (!raw) {
      setUrl(null);
      return;
    }
    if (isExternal(raw)) {
      setUrl(raw);
      return;
    }
    void signSampul(raw).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [raw]);
  return url;
}
