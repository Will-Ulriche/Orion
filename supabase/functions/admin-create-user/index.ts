import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  isAllowedCreateRole,
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

    const { email, password, email_confirm, user_metadata } = await req.json();
    const requestedRole = user_metadata?.role;
    if (!isAllowedCreateRole(requestedRole)) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    // (ORI-SEC-002) : Ne jamais stocker de mot de passe en clair dans user_metadata
    const sanitizedMetadata = user_metadata && typeof user_metadata === "object"
      ? { ...user_metadata }
      : {};
    delete sanitizedMetadata.initial_password;
    delete sanitizedMetadata.password;

    const { data, error } = await auth.adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: email_confirm ?? true,
      user_metadata: sanitizedMetadata,
    });

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse(data);
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
