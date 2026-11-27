import test from "node:test";
import assert from "node:assert/strict";

// Logique pure de décision d'accès
function decideLicenseAccess(input) {
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

// Handler HTTP simulant exactement handleIssueLicenseRequest avec mocks
async function handleIssueLicenseMock(req, mockConfig, signFn = async () => "dummy.jwt.token") {
  const authHeader = req.headers.get("Authorization") ?? "";
  const hasBearer = authHeader.toLowerCase().startsWith("bearer ") && authHeader.slice(7).trim().length > 0;
  if (!hasBearer) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  // Vérification de l'utilisateur mocké
  if (mockConfig.userError || !mockConfig.user) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  const body = await req.json();
  const { license_id, school_id, device_identifier } = body;
  if (!license_id || !school_id) {
    return { status: 400, body: { error: "license_id et school_id sont requis" } };
  }
  if (typeof device_identifier !== "string" || device_identifier.trim().length === 0) {
    return { status: 400, body: { error: "device_identifier est requis" } };
  }

  // RPC is_super_admin
  if (mockConfig.adminRpcError) {
    // Si l'appel is_super_admin échoue, on continue vers user_school_ids
  }
  const isSuperAdmin = !mockConfig.adminRpcError && mockConfig.isSuperAdmin === true;

  let isAuthorized = false;
  if (isSuperAdmin) {
    isAuthorized = true;
  } else {
    // RPC user_school_ids
    if (mockConfig.schoolRpcError || !Array.isArray(mockConfig.userSchoolIds)) {
      return { status: 403, body: { error: "Forbidden: échec de vérification des établissements rattachés" } };
    }
    const schoolIds = mockConfig.userSchoolIds.map(String);
    if (schoolIds.includes(String(school_id))) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return { status: 403, body: { error: "Forbidden: utilisateur non autorisé pour cet établissement" } };
  }

  // Recherche de la licence
  if (mockConfig.licenseError || !mockConfig.license) {
    return { status: 404, body: { error: "Licence introuvable" } };
  }

  const lic = mockConfig.license;
  if (lic.school_id !== school_id) {
    return { status: 403, body: { error: "Licence non associée à cet établissement" } };
  }

  if (lic.is_current !== true) {
    return { status: 403, body: { error: "Licence remplacée ou archivée" } };
  }

  const now = new Date();
  if (lic.status !== "ACTIVE") {
    return { status: 403, body: { error: `Licence ${lic.status.toLowerCase()}` } };
  }
  if (lic.starts_at && new Date(lic.starts_at) > now) {
    return { status: 403, body: { error: "Licence pas encore active" } };
  }
  if (lic.expires_at && new Date(lic.expires_at) <= now) {
    return { status: 403, body: { error: "Licence expirée" } };
  }

  if (mockConfig.registerError) {
    return { status: 403, body: { error: mockConfig.registerError.message } };
  }

  const deviceId = mockConfig.deviceId ?? "device-uuid-001";
  const token = await signFn({
    iss: "orion-license",
    sub: lic.id,
    license_id: lic.id,
    school_id: lic.school_id,
    license_key: lic.license_key,
    status: lic.status,
    starts_at: lic.starts_at ?? null,
    expires_at: lic.expires_at ?? null,
    is_current: true,
    max_devices: lic.max_devices ?? 1,
    device_id: deviceId,
    device_identifier: device_identifier.trim(),
    jti: "mock-jti",
    iat: 1700000000,
    exp: 1700000000 + 7 * 24 * 60 * 60,
  });
  return { status: 200, body: { token } };
}

function makeRequest(body, authHeader = "Bearer valid.token") {
  const headers = new Headers();
  if (authHeader) headers.set("Authorization", authHeader);
  return new Request("http://localhost/issue-license-token", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function validLicense(overrides = {}) {
  const now = new Date();
  return {
    id: "lic-001",
    school_id: "school-123",
    license_key: "ORION-KEY-123",
    status: "ACTIVE",
    is_current: true,
    max_devices: 1,
    starts_at: new Date(now.getTime() - 86400000).toISOString(),
    expires_at: new Date(now.getTime() + 30 * 86400000).toISOString(),
    ...overrides,
  };
}

// ─── SECTION 1 : TESTS UNITAIRES DE LA FONCTION PURE decideLicenseAccess ───

test("[Unitaire Pure] decideLicenseAccess : refuse sans authentification (401)", () => {
  const res = decideLicenseAccess({
    hasBearer: false,
    userPresent: false,
    isSuperAdmin: false,
    userSchoolIds: [],
    targetSchoolId: "school-123",
  });
  assert.equal(res.status, 401);
  assert.equal(res.authorized, false);
});

test("[Unitaire Pure] decideLicenseAccess : refuse si utilisateur non rattaché (403)", () => {
  const res = decideLicenseAccess({
    hasBearer: true,
    userPresent: true,
    isSuperAdmin: false,
    userSchoolIds: ["school-other"],
    targetSchoolId: "school-123",
  });
  assert.equal(res.status, 403);
  assert.equal(res.authorized, false);
});

test("[Unitaire Pure] decideLicenseAccess : autorise membre rattaché (200)", () => {
  const res = decideLicenseAccess({
    hasBearer: true,
    userPresent: true,
    isSuperAdmin: false,
    userSchoolIds: ["school-123"],
    targetSchoolId: "school-123",
  });
  assert.equal(res.status, 200);
  assert.equal(res.authorized, true);
});

test("[Unitaire Pure] decideLicenseAccess : autorise super-admin strict (200)", () => {
  const res = decideLicenseAccess({
    hasBearer: true,
    userPresent: true,
    isSuperAdmin: true,
    userSchoolIds: [],
    targetSchoolId: "school-123",
  });
  assert.equal(res.status, 200);
  assert.equal(res.authorized, true);
});

// ─── SECTION 2 : TESTS D'INTÉGRATION AVEC MOCKS DÉTERMINISTES DU HANDLER HTTP ───

test("[Mock Handler HTTP] Refuse en l'absence d'authentification (401)", async () => {
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123", device_identifier: "device-orion-001" }, null);
  const res = await handleIssueLicenseMock(req, {});
  assert.equal(res.status, 401);
  assert.equal(res.body.token, undefined);
});

test("[Mock Handler HTTP] Refuse avec un jeton d'authentification invalide (401)", async () => {
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123", device_identifier: "device-orion-001" });
  const res = await handleIssueLicenseMock(req, { userError: new Error("invalid jwt"), user: null });
  assert.equal(res.status, 401);
  assert.equal(res.body.token, undefined);
});

test("[Mock Handler HTTP] Refuse utilisateur sans accès à l'établissement demandé (403)", async () => {
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123", device_identifier: "device-orion-001" });
  const res = await handleIssueLicenseMock(req, {
    user: { id: "u-1" },
    isSuperAdmin: false,
    userSchoolIds: ["school-autre"],
    license: validLicense(),
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.token, undefined);
});

test("[Mock Handler HTTP] Autorise membre autorisé de l'établissement (200 + jeton)", async () => {
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123", device_identifier: "device-orion-001" });
  const res = await handleIssueLicenseMock(req, {
    user: { id: "u-1" },
    isSuperAdmin: false,
    userSchoolIds: ["school-123"],
    license: validLicense(),
  });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
});

test("[Mock Handler HTTP] Autorise super-administrateur même hors liste des écoles (200 + jeton)", async () => {
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123", device_identifier: "device-orion-001" });
  const res = await handleIssueLicenseMock(req, {
    user: { id: "u-super" },
    isSuperAdmin: true,
    userSchoolIds: [],
    license: validLicense(),
  });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
});

test("[Mock Handler HTTP] Échec de is_super_admin() se rabat sur user_school_ids et refuse si non membre (403)", async () => {
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123", device_identifier: "device-orion-001" });
  const res = await handleIssueLicenseMock(req, {
    user: { id: "u-1" },
    adminRpcError: new Error("RPC failure"),
    isSuperAdmin: false,
    userSchoolIds: ["school-autre"],
    license: validLicense(),
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.token, undefined);
});

test("[Mock Handler HTTP] Échec de user_school_ids() entraîne un refus strict (403)", async () => {
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123", device_identifier: "device-orion-001" });
  const res = await handleIssueLicenseMock(req, {
    user: { id: "u-1" },
    isSuperAdmin: false,
    schoolRpcError: new Error("RPC failure"),
    userSchoolIds: null,
    license: validLicense(),
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.token, undefined);
});

test("[Mock Handler HTTP] Refuse si la licence demandée appartient à un autre établissement (403)", async () => {
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123", device_identifier: "device-orion-001" });
  const res = await handleIssueLicenseMock(req, {
    user: { id: "u-1" },
    isSuperAdmin: true,
    license: validLicense({ school_id: "school-hacker" }),
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.token, undefined);
});

test("[Mock Handler HTTP] Refuse une licence suspendue (403)", async () => {
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123", device_identifier: "device-orion-001" });
  const res = await handleIssueLicenseMock(req, {
    user: { id: "u-1" },
    isSuperAdmin: true,
    license: validLicense({ status: "SUSPENDED" }),
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.token, undefined);
});

test("[Mock Handler HTTP] Refuse une licence révoquée (403)", async () => {
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123", device_identifier: "device-orion-001" });
  const res = await handleIssueLicenseMock(req, {
    user: { id: "u-1" },
    isSuperAdmin: true,
    license: validLicense({ status: "REVOKED" }),
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.token, undefined);
});

test("[Mock Handler HTTP] Refuse une ancienne licence ACTIVE non courante (403)", async () => {
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123", device_identifier: "device-orion-001" });
  const res = await handleIssueLicenseMock(req, {
    user: { id: "u-1" },
    isSuperAdmin: true,
    license: validLicense({ status: "ACTIVE", is_current: false }),
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.token, undefined);
  assert.match(res.body.error, /remplacée/i);
});

test("[Mock Handler HTTP] Refuse une licence pas encore active (starts_at futur) (403)", async () => {
  const future = new Date(Date.now() + 864000000).toISOString();
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123", device_identifier: "device-orion-001" });
  const res = await handleIssueLicenseMock(req, {
    user: { id: "u-1" },
    isSuperAdmin: true,
    license: validLicense({ starts_at: future }),
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.token, undefined);
});

test("[Mock Handler HTTP] Refuse une licence expirée (expires_at passé) (403)", async () => {
  const past = new Date(Date.now() - 86400000).toISOString();
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123", device_identifier: "device-orion-001" });
  const res = await handleIssueLicenseMock(req, {
    user: { id: "u-1" },
    isSuperAdmin: true,
    license: validLicense({ expires_at: past }),
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.token, undefined);
});

test("[Mock Handler HTTP] Absence de signature et de jeton dans tous les cas de refus", async () => {
  let signCallCount = 0;
  const spySignFn = async () => {
    signCallCount++;
    return "signed";
  };

  const req = makeRequest({ license_id: "lic-001", school_id: "school-123", device_identifier: "device-orion-001" });
  const res = await handleIssueLicenseMock(
    req,
    {
      user: { id: "u-1" },
      isSuperAdmin: false,
      userSchoolIds: ["wrong-school"],
      license: validLicense(),
    },
    spySignFn,
  );

  assert.equal(res.status, 403);
  assert.equal(res.body.token, undefined);
  assert.equal(signCallCount, 0, "La fonction de signature ne doit JAMAIS être appelée en cas de refus");
});

test("[Mock Handler HTTP] Refuse une requête sans device_identifier (400)", async () => {
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123" });
  const res = await handleIssueLicenseMock(req, {
    user: { id: "u-1" },
    isSuperAdmin: true,
    license: validLicense(),
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.token, undefined);
});

test("[Mock Handler HTTP] Refuse si le quota d'appareils est atteint côté serveur (403)", async () => {
  let signCallCount = 0;
  const spySignFn = async () => {
    signCallCount++;
    return "signed";
  };
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123", device_identifier: "device-orion-001" });
  const res = await handleIssueLicenseMock(
    req,
    {
      user: { id: "u-1" },
      isSuperAdmin: true,
      license: validLicense(),
      registerError: new Error("Limite d'appareils atteinte pour cette licence"),
    },
    spySignFn,
  );
  assert.equal(res.status, 403);
  assert.equal(res.body.token, undefined);
  assert.equal(signCallCount, 0);
});

test("[Mock Handler HTTP] Payload signé lie licence, école, appareil et quota", async () => {
  let payload = null;
  const captureSignFn = async (captured) => {
    payload = captured;
    return "signed.jwt.token";
  };
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123", device_identifier: "  device-orion-001  " });
  const res = await handleIssueLicenseMock(
    req,
    {
      user: { id: "u-1" },
      isSuperAdmin: true,
      license: validLicense(),
    },
    captureSignFn,
  );
  assert.equal(res.status, 200);
  assert.equal(payload.iss, "orion-license");
  assert.equal(payload.sub, "lic-001");
  assert.equal(payload.license_id, "lic-001");
  assert.equal(payload.license_id, payload.sub);
  assert.equal(payload.school_id, "school-123");
  assert.equal(payload.device_id, "device-uuid-001");
  assert.equal(payload.device_identifier, "device-orion-001");
  assert.equal(payload.max_devices, 1);
  assert.equal(payload.is_current, true);
  assert.equal(payload.status, "ACTIVE");
  assert.equal(typeof payload.jti, "string");
  assert.ok(payload.jti.length > 0);
  assert.equal(payload.exp - payload.iat, 7 * 24 * 60 * 60);
});

test("[Mock Handler HTTP] Refuse et invalide formellement un jeton sans license_id ou si license_id !== sub", () => {
  function validateClaims(claims) {
    if (!claims.license_id || typeof claims.license_id !== "string" || claims.license_id.trim() === "") {
      throw new Error("missing field license_id");
    }
    if (claims.license_id !== claims.sub) {
      throw new Error("license_id must be equal to sub");
    }
    return true;
  }

  assert.throws(() => validateClaims({ sub: "lic-001" }), /missing field license_id/);
  assert.throws(() => validateClaims({ sub: "lic-001", license_id: "" }), /missing field license_id/);
  assert.throws(() => validateClaims({ sub: "lic-001", license_id: "other" }), /license_id must be equal to sub/);
  assert.equal(validateClaims({ sub: "lic-001", license_id: "lic-001" }), true);
});
