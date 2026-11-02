/**
 * issue-license-token (LIC-01E)
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
 *  1. Appelant authentifié via son Bearer token Supabase (401 si absent ou invalide).
 *  2. Traitement rigoureux des RPC is_super_admin() et user_school_ids() :
 *     - Vérification de type stricte (isSuperAdmin === true).
 *     - Toute erreur RPC, réponse nulle ou format inattendu entraîne un refus (fail-closed).
 *     - Si non super-admin, school_id doit appartenir strictement aux user_school_ids() (403).
 *  3. Paramètres requis license_id et school_id fournis (400 si manquants).
 *  4. Licence existante en base (table licenses) (404 si introuvable).
 *  5. school_id de la licence correspondant exactement à l'établissement demandé (403).
 *  6. Statut == 'ACTIVE' (403 si suspendue, révoquée ou inactive).
 *  7. starts_at absent ou déjà atteint (<= now) (403 si future).
 *  8. expires_at absent ou non dépassé (> now) (403 si expirée).
 *  9. Durée du jeton strictement limitée à 7 jours maximum (exp = iat + 7j),
 *     ou à la date d'expiration de la licence si celle-ci expire plus tôt.
 * 10. Aucune signature ni émission de jeton en cas de refus ou d'erreur.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";

/** Décision d'autorisation pure — testable sans réseau */
export function decideLicenseAccess(input: {
  hasBearer: boolean;
  userPresent: boolean;
  isSuperAdmin: boolean;
  userSchoolIds: string[];
  targetSchoolId: string;
}): { authorized: boolean; status: 200 | 401 | 403; error?: string } {
  if (!input.hasBearer || !input.userPresent) {
    return { authorized: false, status: 401, error: "Unauthorized" };
  }
  const isSchoolAllowed =
    input.isSuperAdmin === true ||
    (Array.isArray(input.userSchoolIds) &&
      input.userSchoolIds.map(String).includes(String(input.targetSchoolId)));

  if (!isSchoolAllowed) {
    return {
      authorized: false,
      status: 403,
      error: "Forbidden: utilisateur non autorisé pour cet établissement",
    };
  }
  return { authorized: true, status: 200 };
}

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

export async function signRS256(payload: object, privateKeyPem: string): Promise<string> {
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

export interface IssueLicenseDeps {
  url?: string;
  anonKey?: string;
  serviceKey?: string;
  privateKeyPem?: string;
  createClients?: (authHeader: string, url: string, anonKey: string, serviceKey: string) => {
    userClient: any;
    adminClient: any;
  };
  signFn?: (payload: object, pem: string) => Promise<string>;
}

/** Handler principal découpé et injectable pour tests avec mocks complets */
export async function handleIssueLicenseRequest(
  req: Request,
  deps?: IssueLicenseDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Authentification : vérification stricte du Bearer token
    const authHeader = req.headers.get("Authorization") ?? "";
    const hasBearer = authHeader.toLowerCase().startsWith("bearer ") &&
      authHeader.slice(7).trim().length > 0;

    if (!hasBearer) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Récupération des variables d'environnement
    const url = deps?.url ?? Deno.env.get("SUPABASE_URL");
    const anonKey = deps?.anonKey ?? Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = deps?.serviceKey ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const privateKeyPem = deps?.privateKeyPem ?? Deno.env.get("ORION_LICENSE_PRIVATE_KEY_PEM");

    if (!url || !anonKey || !serviceKey) {
      return jsonResponse({ error: "Server misconfigured: Supabase credentials missing" }, 500);
    }

    if (!privateKeyPem || !privateKeyPem.includes("PRIVATE KEY")) {
      return jsonResponse({
        error: "Server misconfigured: ORION_LICENSE_PRIVATE_KEY_PEM absent ou non configuré dans les secrets Supabase",
      }, 500);
    }

    // Instanciation des clients Supabase
    let userClient: any;
    let adminClient: any;
    if (deps?.createClients) {
      const clients = deps.createClients(authHeader, url, anonKey, serviceKey);
      userClient = clients.userClient;
      adminClient = clients.adminClient;
    } else {
      userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      adminClient = createClient(url, serviceKey);
    }

    // 2. Vérification de l'utilisateur avec son propre JWT
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData || !userData.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // 3. Extraction et validation des paramètres
    let body: { license_id?: string; school_id?: string };
    try {
      body = await req.json();
    } catch (_) {
      return jsonResponse({ error: "Corps de requête JSON invalide" }, 400);
    }

    const { license_id, school_id } = body;
    if (!license_id || !school_id || typeof license_id !== "string" || typeof school_id !== "string") {
      return jsonResponse({ error: "license_id et school_id sont requis" }, 400);
    }

    // 4. Contrôle d'autorisation strict : vérification fail-closed des RPCs
    const { data: isSuperAdminRaw, error: adminErr } = await userClient.rpc("is_super_admin");

    // Typage strict : isSuperAdmin doit être expressément le booléen true
    const isSuperAdmin = !adminErr && typeof isSuperAdminRaw === "boolean" && isSuperAdminRaw === true;

    let isAuthorized = false;

    if (isSuperAdmin) {
      isAuthorized = true;
    } else {
      // Non super-admin : vérification de l'appartenance à l'établissement demandé
      const { data: userSchoolIdsRaw, error: schoolErr } = await userClient.rpc("user_school_ids");

      // Traitement fail-closed : si erreur RPC, null ou format inattendu -> refus
      if (schoolErr || !Array.isArray(userSchoolIdsRaw)) {
        return jsonResponse(
          { error: "Forbidden: échec de vérification des établissements rattachés" },
          403,
        );
      }

      const schoolIdsList: string[] = userSchoolIdsRaw.map((s: any) =>
        typeof s === "object" && s !== null ? String(s.school_id ?? s) : String(s)
      );

      if (schoolIdsList.includes(String(school_id))) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return jsonResponse(
        { error: "Forbidden: utilisateur non autorisé pour cet établissement" },
        403,
      );
    }

    // 5. Vérifier la licence en base (via adminClient)
    const { data: lic, error: licErr } = await adminClient
      .from("licenses")
      .select("id, school_id, license_key, status, starts_at, expires_at")
      .eq("id", license_id)
      .maybeSingle();

    if (licErr || !lic) {
      return jsonResponse({ error: "Licence introuvable" }, 404);
    }

    // 6. Cohérence établissement
    if (lic.school_id !== school_id) {
      return jsonResponse({ error: "Licence non associée à cet établissement" }, 403);
    }

    // 7. Statut et dates de validité
    const now = new Date();
    if (lic.status !== "ACTIVE") {
      return jsonResponse({ error: `Licence ${String(lic.status).toLowerCase()}` }, 403);
    }
    if (lic.starts_at && new Date(lic.starts_at) > now) {
      return jsonResponse({ error: "Licence pas encore active (date de début non atteinte)" }, 403);
    }
    if (lic.expires_at && new Date(lic.expires_at) <= now) {
      return jsonResponse({ error: "Licence expirée" }, 403);
    }

    // 8. Calcul de la durée de grâce du jeton (maximum 7 jours imposé par le serveur)
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

    // 9. Signature du jeton RS256
    // Ni la clé privée ni le jeton complet ne sont affichés dans les logs
    const sign = deps?.signFn ?? signRS256;
    const token = await sign(
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
    console.error("[issue-license-token] Erreur serveur:", err?.message || "Erreur inconnue");
    return jsonResponse({ error: "Erreur interne lors de l'émission du jeton" }, 500);
  }
}

// Serveur Deno en production
if (typeof Deno !== "undefined" && typeof (Deno as any).serve === "function") {
  (Deno as any).serve((req: Request) => handleIssueLicenseRequest(req));
}
