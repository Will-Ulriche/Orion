import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const ALLOWED_CREATED_ROLES = [
  "DIRECTION",
  "ADMIN",
  "SECRETAIRE",
  "PROFESSEUR",
] as const;

export type AuthFailure = { ok: false; status: number; error: string };
export type AuthSuccess = {
  ok: true;
  user: User;
  userClient: SupabaseClient;
  adminClient: SupabaseClient;
};

/** Décision d'accès pure — testable sans réseau ni secrets. */
export function decideAdminAccess(input: {
  hasBearer: boolean;
  userPresent: boolean;
  isSuperAdmin: boolean;
}): { status: 200 } | { status: 401 | 403; error: string } {
  if (!input.hasBearer || !input.userPresent) {
    return { status: 401, error: "Unauthorized" };
  }
  if (!input.isSuperAdmin) {
    return { status: 403, error: "Forbidden" };
  }
  return { status: 200 };
}

export function isAllowedCreateRole(role: unknown): boolean {
  if (role == null || role === "") return true;
  return typeof role === "string" &&
    (ALLOWED_CREATED_ROLES as readonly string[]).includes(role);
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function requireSuperAdmin(req: Request): Promise<AuthSuccess | AuthFailure> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const hasBearer = authHeader.toLowerCase().startsWith("bearer ") &&
    authHeader.slice(7).trim().length > 0;

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !anonKey || !serviceKey) {
    return { ok: false, status: 500, error: "Server misconfigured" };
  }

  if (!hasBearer) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
  } = await userClient.auth.getUser();

  const { data: isSuperAdmin } = user
    ? await userClient.rpc("is_super_admin")
    : { data: false };

  const decision = decideAdminAccess({
    hasBearer,
    userPresent: Boolean(user),
    isSuperAdmin: Boolean(isSuperAdmin),
  });

  if (decision.status !== 200) {
    return { ok: false, status: decision.status, error: decision.error };
  }

  return {
    ok: true,
    user: user as User,
    userClient,
    adminClient: createClient(url, serviceKey),
  };
}
