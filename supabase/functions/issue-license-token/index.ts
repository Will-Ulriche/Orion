/**
 * issue-license-token (LIC-01C)
 * ─────────────────────────────────────────────────────────────
 * Émet un JWT de preuve de licence signé en RS256 pour le mode hors ligne.
 *
 * Sécurité des clés :
 *  - La clé privée RSA est conservée EXCLUSIVEMENT dans les secrets Supabase
 *    (secret ORION_LICENSE_PRIVATE_KEY_PEM).
 *  - Aucune clé privée ni SUPABASE_JWT_SECRET n'est distribuée dans Orion.
 *  - L'application Tauri vérifie la signature à l'aide de sa clé publique RSA
 *    intégrée (RS256).
 *
 * Validations effectuées avant signature :
 *  1. Appelant authentifié via son Bearer token Supabase.
 *  2. Licence existante en base (table licenses).
 *  3. school_id de la licence correspondant exactement à l'établissement demandé.
 *  4. Statut == 'ACTIVE'.
 *  5. starts_at absent ou déjà atteint (<= now).
 *  6. expires_at absent ou non dépassé (> now).
 *  7. Durée du jeton strictement limitée à 7 jours maximum (exp = iat + 7j),
 *     ou à la date d'expiration de la licence si celle-ci expire plus tôt.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN[ A-Z0-9_-]+-----/g, "")
    .replace(/-----END[ A-Z0-9_-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function signRS256(payload: object, privateKeyPem: string): Promise<string> {
  const enc = new TextEncoder();
  const header = base64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const body = base64url(enc.encode(JSON.stringify(payload)));
  const data = `${header}.${body}`;

  const keyBuffer = pemToPkcs8(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    enc.encode(data),
  );

  return `${data}.${base64url(sig)}`;
}

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

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    // Clé privée RSA dédiée à Orion (conservée exclusivement côté serveur)
    const privateKeyPem = Deno.env.get("ORION_LICENSE_PRIVATE_KEY_PEM");

    if (!url || !anonKey || !serviceKey) {
      return jsonResponse({ error: "Server misconfigured: Supabase credentials missing" }, 500);
    }

    if (!privateKeyPem || !privateKeyPem.includes("PRIVATE KEY")) {
      return jsonResponse({
        error: "Server misconfigured: ORION_LICENSE_PRIVATE_KEY_PEM absent ou non configuré dans les secrets Supabase",
      }, 500);
    }

    // Vérifier que l'utilisateur est authentifié
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // 2. Paramètres de la demande
    const { license_id, school_id } = await req.json() as {
      license_id?: string;
      school_id?: string;
    };

    if (!license_id || !school_id) {
      return jsonResponse({ error: "license_id et school_id sont requis" }, 400);
    }

    // 3. Vérifier la licence en base (via service_role)
    const adminClient = createClient(url, serviceKey);
    const { data: lic, error: licErr } = await adminClient
      .from("licenses")
      .select("id, school_id, license_key, status, starts_at, expires_at")
      .eq("id", license_id)
      .maybeSingle();

    if (licErr || !lic) {
      return jsonResponse({ error: "Licence introuvable" }, 404);
    }

    // 4. Vérifier que la licence appartient bien à l'établissement demandé
    if (lic.school_id !== school_id) {
      return jsonResponse({ error: "Licence non associée à cet établissement" }, 403);
    }

    // 5. Valider le statut actif et les dates de validité
    const now = new Date();
    if (lic.status !== "ACTIVE") {
      return jsonResponse({ error: `Licence ${lic.status.toLowerCase()}` }, 403);
    }
    if (lic.starts_at && new Date(lic.starts_at) > now) {
      return jsonResponse({ error: "Licence pas encore active (date de début non atteinte)" }, 403);
    }
    if (lic.expires_at && new Date(lic.expires_at) <= now) {
      return jsonResponse({ error: "Licence expirée" }, 403);
    }

    // 6. Calcul de la durée de grâce du jeton (maximum 7 jours imposé par le serveur)
    const MAX_GRACE_SECONDS = 7 * 24 * 60 * 60;
    const iat = Math.floor(now.getTime() / 1000);
    let exp = iat + MAX_GRACE_SECONDS;

    // Si la licence expire avant les 7 jours de grâce, le jeton ne peut pas dépasser cette expiration
    if (lic.expires_at) {
      const licExpSec = Math.floor(new Date(lic.expires_at).getTime() / 1000);
      if (licExpSec < exp) {
        exp = licExpSec;
      }
    }

    // 7. Signature du jeton RS256
    const token = await signRS256(
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
      privateKeyPem,
    );

    return jsonResponse({ token });
  } catch (err: any) {
    console.error("[issue-license-token]", err);
    return jsonResponse({ error: err?.message || "Erreur interne" }, 500);
  }
});
