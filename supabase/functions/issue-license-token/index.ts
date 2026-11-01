/**
 * issue-license-token
 * ─────────────────────────────────────────────────────────────
 * Émet un JWT de preuve de licence pour le mode hors ligne.
 *
 * Flux :
 *  1. L'application envoie son Bearer JWT utilisateur + { license_id, school_id }.
 *  2. La fonction vérifie que la licence existe, est ACTIVE, non expirée,
 *     et que son school_id correspond.
 *  3. Si tout est valide, elle signe un token HS256 (SUPABASE_JWT_SECRET)
 *     avec exp = now + 7 jours, contenant :
 *     { iss, sub (license_id), school_id, status, starts_at, expires_at }
 *  4. L'application stocke ce token localement et l'utilise hors ligne.
 *     La vérification hors ligne est effectuée côté Rust (commande
 *     verify_license_token) avec la même clé — jamais côté JS.
 *
 * Limites connues (documentées, non simulées) :
 *  - Une révocation survenant PENDANT la période de grâce (≤ 7 j) ne peut
 *    pas être appliquée instantanément sans connexion. Le token reste valide
 *    jusqu'à son expiration. La connexion en ligne suivante invalide le token.
 *  - La clé SUPABASE_JWT_SECRET est partagée avec les JWT utilisateur Supabase.
 *    Ce n'est pas idéal mais c'est le seul secret disponible sans nouvelle
 *    infrastructure. Pour un secret dédié, ajouter ORION_LICENSE_SECRET dans
 *    les secrets Supabase Edge Functions et dans le .env Tauri.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";

// ─── Helpers JWT HS256 (Web Crypto, disponible dans Deno Deploy) ───────────

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function signHS256(payload: object, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const header = base64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body   = base64url(enc.encode(JSON.stringify(payload)));
  const data   = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${base64url(sig)}`;
}

// ─── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Authentifier l'appelant via son Bearer JWT Supabase
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const url        = Deno.env.get("SUPABASE_URL");
    const anonKey    = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const jwtSecret  = Deno.env.get("SUPABASE_JWT_SECRET");

    if (!url || !anonKey || !serviceKey || !jwtSecret) {
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    // Vérifier que l'appelant est bien authentifié
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // 2. Lire le corps de la requête
    const { license_id, school_id } = await req.json() as {
      license_id?: string;
      school_id?: string;
    };

    if (!license_id || !school_id) {
      return jsonResponse({ error: "license_id et school_id sont requis" }, 400);
    }

    // 3. Vérifier la licence via le client service_role (contourne RLS)
    const adminClient = createClient(url, serviceKey);
    const { data: lic, error: licErr } = await adminClient
      .from("licenses")
      .select("id, school_id, license_key, status, starts_at, expires_at")
      .eq("id", license_id)
      .maybeSingle();

    if (licErr || !lic) {
      return jsonResponse({ error: "Licence introuvable" }, 404);
    }

    // 4. Valider le school_id
    if (lic.school_id !== school_id) {
      return jsonResponse({ error: "Licence non associée à cet établissement" }, 403);
    }

    // 5. Valider le statut et les dates
    const now = new Date();
    if (lic.status !== "ACTIVE") {
      return jsonResponse({ error: `Licence ${lic.status.toLowerCase()}` }, 403);
    }
    if (lic.starts_at && new Date(lic.starts_at) > now) {
      return jsonResponse({ error: "Licence pas encore active" }, 403);
    }
    if (lic.expires_at && new Date(lic.expires_at) <= now) {
      return jsonResponse({ error: "Licence expirée" }, 403);
    }

    // 6. Émettre le token (durée de grâce hors ligne = 7 jours)
    const GRACE_SECONDS = 7 * 24 * 60 * 60;
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + GRACE_SECONDS;

    const token = await signHS256(
      {
        iss: "orion-license",
        sub: lic.id,
        school_id: lic.school_id,
        license_key: lic.license_key,
        status: lic.status,
        starts_at: lic.starts_at ?? null,
        expires_at: lic.expires_at ?? null,
        iat,
        exp,
      },
      jwtSecret,
    );

    return jsonResponse({ token });
  } catch (err) {
    console.error("[issue-license-token]", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});

