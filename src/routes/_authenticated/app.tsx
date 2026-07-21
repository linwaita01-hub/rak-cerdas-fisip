import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { BrandHeader } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { StaffDashboard } from "@/components/dashboard/StaffDashboard";
import { MahasiswaDashboard } from "@/components/dashboard/MahasiswaDashboard";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppHome,
  head: () => ({ meta: [{ title: "Dasbor — Perpus FISIP ULM" }] }),
});

function AppHome() {
  const navigate = useNavigate();
  const { profile, role, isStaff, loading } = useMe();

  useEffect(() => {
    if (!loading && profile && !profile.is_profile_completed && role === "mahasiswa") {
      navigate({ to: "/lengkapi-profil" });
    }
  }, [loading, profile, role, navigate]);

  async function onLogout() {
    await supabase.auth.signOut();
    toast.success("Berhasil keluar.");
    navigate({ to: "/auth" });
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/30 to-background">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/app"><BrandHeader /></Link>
          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{profile?.nama ?? profile?.email}</p>
              <Badge variant="secondary" className="capitalize text-[10px]">{role?.replace("_", " ")}</Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut className="mr-2 h-4 w-4" /> Keluar
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {isStaff ? <StaffDashboard /> : <MahasiswaDashboard profile={profile} />}
      </main>
    </div>
  );
}
