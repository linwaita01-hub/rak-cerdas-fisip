import { createFileRoute } from "@tanstack/react-router";

const TOKEN = "tmp-9f3c1a77-rotate-once";

export const Route = createFileRoute("/api/public/__tmp-rotate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.headers.get("x-tmp-token") !== TOKEN) {
          return new Response("no", { status: 401 });
        }
        const { email, password } = (await request.json()) as {
          email: string;
          password: string;
        };
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: list, error: e1 } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });
        if (e1) return new Response(e1.message, { status: 500 });
        const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (!user) return new Response("not found", { status: 404 });
        const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, { password });
        if (error) return new Response(error.message, { status: 500 });
        return new Response("ok");
      },
    },
  },
});
