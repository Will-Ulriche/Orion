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

    let page = 1;
    let perPage = 100;
    try {
      const body = await req.json();
      if (body?.page) page = parseInt(String(body.page), 10) || 1;
      if (body?.perPage || body?.per_page) {
        perPage = parseInt(String(body.perPage ?? body.per_page), 10) || 100;
      }
    } catch {
      const url = new URL(req.url);
      page = parseInt(url.searchParams.get("page") || "1", 10) || 1;
      perPage = parseInt(url.searchParams.get("per_page") || "100", 10) || 100;
    }

    perPage = Math.min(Math.max(perPage, 1), 1000);

    const { data, error } = await auth.adminClient.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse(data);
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
