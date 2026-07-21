import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Search, ShieldPlus, ShieldX, Clock } from "lucide-react";
import { toast } from "sonner";
import { fmtWITA } from "@/hooks/useMe";
import {
  daftarAdminSementara,
  angkatAdminSementara,
  cabutAdminSementara,
} from "@/lib/admin-roles.functions";

function sisaWaktu(expiresAt: string | null): { label: string; kadaluarsa: boolean } {
  if (!expiresAt) return { label: "tanpa batas", kadaluarsa: false };
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { label: "kedaluwarsa", kadaluarsa: true };
  const hari = Math.floor(ms / 86400000);
  const jam = Math.floor((ms % 86400000) / 3600000);
  return {
    label: hari > 0 ? `${hari} hari ${jam} jam lagi` : `${jam} jam lagi`,
    kadaluarsa: false,
  };
}

export function AdminSementaraPanel() {
  const qc = useQueryClient();
  const angkat = useServerFn(angkatAdminSementara);
  const cabut = useServerFn(cabutAdminSementara);
  const daftar = useServerFn(daftarAdminSementara);

  const [search, setSearch] = useState("");
  const [hari, setHari] = useState(30);
  const [busy, setBusy] = useState(false);

  const list = useQuery({
    queryKey: ["admin-sementara"],
    queryFn: async () => (await daftar({})) ?? [],
  });

  const hasil = useQuery({
    queryKey: ["cari-calon-admin", search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const s = search.trim().replace(/[%,]/g, "");
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nama, nim, email")
        .or(`nama.ilike.%${s}%,nim.ilike.%${s}%,email.ilike.%${s}%`)
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function onAngkat(userId: string, nama: string | null) {
    setBusy(true);
    try {
      const r = await angkat({ data: { user_id: userId, hari } });
      toast.success(`${nama ?? "Akun"} kini admin sementara s.d. ${fmtWITA(r.expires_at)}.`);
      setSearch("");
      qc.invalidateQueries({ queryKey: ["admin-sementara"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengangkat.");
    } finally {
      setBusy(false);
    }
  }

  async function onCabut(userId: string) {
    if (!confirm("Cabut peran admin sementara dari akun ini?")) return;
    try {
      await cabut({ data: { user_id: userId } });
      toast.success("Peran admin sementara dicabut.");
      qc.invalidateQueries({ queryKey: ["admin-sementara"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mencabut.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Angkat admin sementara</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Cari akun (nama / NIM / email)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Ketik minimal 2 huruf…"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-28 space-y-1">
              <Label className="text-xs">Durasi (hari)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={hari}
                onChange={(e) => setHari(Number(e.target.value) || 30)}
              />
            </div>
          </div>

          <div className="space-y-2">
            {hasil.isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
            {hasil.data?.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
              >
                <div className="text-sm">
                  <p className="font-medium">{u.nama ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {u.nim ?? "tanpa NIM"} · {u.email ?? "—"}
                  </p>
                </div>
                <Button size="sm" disabled={busy} onClick={() => onAngkat(u.id, u.nama)}>
                  <ShieldPlus className="mr-1 h-4 w-4" />
                  Angkat {hari} hari
                </Button>
              </div>
            ))}
            {search.trim().length >= 2 && !hasil.isFetching && !hasil.data?.length && (
              <p className="text-sm text-muted-foreground">Tidak ada akun cocok.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Admin sementara aktif ({list.data?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Akun</TableHead>
                  <TableHead>Kedaluwarsa</TableHead>
                  <TableHead>Sisa</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data?.map((a) => {
                  const sisa = sisaWaktu(a.expires_at);
                  return (
                    <TableRow key={a.user_id}>
                      <TableCell className="text-sm">
                        {a.profil.nama ?? "—"}
                        <span className="text-muted-foreground"> ({a.profil.nim ?? "—"})</span>
                      </TableCell>
                      <TableCell className="text-xs">{fmtWITA(a.expires_at)}</TableCell>
                      <TableCell>
                        <Badge variant={sisa.kadaluarsa ? "destructive" : "secondary"}>
                          <Clock className="mr-1 h-3 w-3" />
                          {sisa.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => onCabut(a.user_id)}>
                          <ShieldX className="mr-1 h-4 w-4" />
                          Cabut
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!list.data?.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      Belum ada admin sementara.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
