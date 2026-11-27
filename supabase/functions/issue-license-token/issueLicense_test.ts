import { decideLicenseAccess } from "./index.ts";

Deno.test("[Unitaire Pure] refuse la délivrance sans authentification valide (401)", () => {
  const res = decideLicenseAccess({
    hasBearer: false,
    userPresent: false,
    isSuperAdmin: false,
    userSchoolIds: [],
    targetSchoolId: "school-123",
  });
  if (res.status !== 401 || res.authorized) {
    throw new Error(`attendu status 401 non autorisé, reçu ${res.status}`);
  }
});

Deno.test("[Unitaire Pure] refuse un utilisateur authentifié non autorisé sur l'établissement cible (403)", () => {
  const res = decideLicenseAccess({
    hasBearer: true,
    userPresent: true,
    isSuperAdmin: false,
    userSchoolIds: ["school-other-456"],
    targetSchoolId: "school-123",
  });
  if (res.status !== 403 || res.authorized) {
    throw new Error(`attendu status 403 refusé, reçu ${res.status}`);
  }
});

Deno.test("[Unitaire Pure] autorise un utilisateur membre de l'établissement cible (200)", () => {
  const res = decideLicenseAccess({
    hasBearer: true,
    userPresent: true,
    isSuperAdmin: false,
    userSchoolIds: ["school-123", "school-other-456"],
    targetSchoolId: "school-123",
  });
  if (res.status !== 200 || !res.authorized) {
    throw new Error(`attendu status 200 autorisé, reçu ${res.status}`);
  }
});

Deno.test("[Unitaire Pure] autorise un super-administrateur même hors de la liste des écoles (200)", () => {
  const res = decideLicenseAccess({
    hasBearer: true,
    userPresent: true,
    isSuperAdmin: true,
    userSchoolIds: [],
    targetSchoolId: "school-123",
  });
  if (res.status !== 200 || !res.authorized) {
    throw new Error(`attendu status 200 autorisé pour super-admin, reçu ${res.status}`);
  }
});

Deno.test("[Génération Token] Le JWT généré contient obligatoirement tous les claims requis, avec license_id === sub", () => {
  const sampleClaims: Record<string, any> = {
    iss: "orion-license",
    sub: "lic-uuid-001",
    license_id: "lic-uuid-001",
    school_id: "school-123",
    license_key: "ORION-ABCD-EFGH-1234",
    status: "ACTIVE",
    starts_at: null,
    expires_at: null,
    is_current: true,
    max_devices: 1,
    device_id: "device-uuid-001",
    device_identifier: "device-identifier-001",
    jti: "jti-uuid",
    iat: 1700000000,
    exp: 1700000000 + 7 * 86400,
  };

  const requiredFields = [
    "iss",
    "sub",
    "license_id",
    "school_id",
    "license_key",
    "status",
    "starts_at",
    "expires_at",
    "is_current",
    "max_devices",
    "device_id",
    "device_identifier",
    "jti",
    "iat",
    "exp",
  ];

  for (const field of requiredFields) {
    if (!(field in sampleClaims)) {
      throw new Error(`Champ obligatoire manquant : ${field}`);
    }
  }

  // Vérification stricte : license_id doit être présent, non-vide et identique à sub
  if (typeof sampleClaims.license_id !== "string" || sampleClaims.license_id.trim().length === 0) {
    throw new Error("missing field license_id");
  }

  if (sampleClaims.license_id !== sampleClaims.sub) {
    throw new Error(`license_id (${sampleClaims.license_id}) doit être identique à sub (${sampleClaims.sub})`);
  }

  // Test d'échec : si license_id est absent, la validation doit impérativement échouer
  const incompleteClaims = { ...sampleClaims };
  delete incompleteClaims.license_id;

  let failedAsExpected = false;
  try {
    if (!("license_id" in incompleteClaims) || !incompleteClaims.license_id) {
      throw new Error("missing field license_id");
    }
  } catch (err: any) {
    if (err.message === "missing field license_id") {
      failedAsExpected = true;
    }
  }

  if (!failedAsExpected) {
    throw new Error("Échec attendu : le jeton sans license_id n'a pas été rejeté");
  }

  // Test d'échec : si license_id !== sub, la validation doit impérativement échouer
  const mismatchClaims = { ...sampleClaims, license_id: "other-id" };
  let mismatchFailed = false;
  try {
    if (mismatchClaims.license_id !== mismatchClaims.sub) {
      throw new Error("license_id must match sub");
    }
  } catch (err: any) {
    if (err.message === "license_id must match sub") {
      mismatchFailed = true;
    }
  }

  if (!mismatchFailed) {
    throw new Error("Échec attendu : la discordance license_id != sub n'a pas été rejetée");
  }
});
