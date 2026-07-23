import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { RoleWatcher } from "@/components/RoleWatcher";
import { KonfirmasiPinjamWatcher } from "@/components/KonfirmasiPinjamWatcher";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <>
      <RoleWatcher />
      <KonfirmasiPinjamWatcher />
      <Outlet />
    </>
  );
}
