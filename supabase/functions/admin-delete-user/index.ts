import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  jsonResponse,
  requireSuperAdmin,
} from "../_shared/adminAuth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const auth = await requireSuperAdmin(req);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status);
    }

    const { user_id } = await req.json();
    if (!user_id || typeof user_id !== "string") {
      return jsonResponse({ error: "user_id requis" }, 400);
    }
    if (user_id === auth.user.id) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { data, error } = await auth.adminClient.auth.admin.deleteUser(user_id);

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse(data ?? { status: "deleted" });
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
