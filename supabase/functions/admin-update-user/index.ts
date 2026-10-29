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

    const { user_id, password, user_metadata } = await req.json();
    if (!user_id || typeof user_id !== "string") {
      return jsonResponse({ error: "user_id requis" }, 400);
    }

    const update: { password?: string; user_metadata?: Record<string, unknown> } = {};
    if (typeof password === "string" && password.length > 0) {
      update.password = password;
    }
    // (ORI-SEC-002) : Ne jamais stocker de mot de passe en clair dans user_metadata
    if (user_metadata && typeof user_metadata === "object") {
      const sanitized = { ...(user_metadata as Record<string, unknown>) };
      delete sanitized.initial_password;
      delete sanitized.password;
      if (Object.keys(sanitized).length > 0) {
        update.user_metadata = sanitized;
      }
    }

    if (!update.password && !update.user_metadata) {
      return jsonResponse({ error: "Aucune opération autorisée" }, 400);
    }

    const { data, error } = await auth.adminClient.auth.admin.updateUserById(
      user_id,
      update,
    );

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse(data);
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
