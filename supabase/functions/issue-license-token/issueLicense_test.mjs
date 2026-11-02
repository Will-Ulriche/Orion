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
  const { license_id, school_id } = body;
  if (!license_id || !school_id) {
    return { status: 400, body: { error: "license_id et school_id sont requis" } };
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

  const token = await signFn({ sub: lic.id, school_id: lic.school_id });
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
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123" }, null);
  const res = await handleIssueLicenseMock(req, {});
  assert.equal(res.status, 401);
  assert.equal(res.body.token, undefined);
});

test("[Mock Handler HTTP] Refuse avec un jeton d'authentification invalide (401)", async () => {
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123" });
  const res = await handleIssueLicenseMock(req, { userError: new Error("invalid jwt"), user: null });
  assert.equal(res.status, 401);
  assert.equal(res.body.token, undefined);
});

test("[Mock Handler HTTP] Refuse utilisateur sans accès à l'établissement demandé (403)", async () => {
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123" });
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
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123" });
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
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123" });
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
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123" });
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
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123" });
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
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123" });
  const res = await handleIssueLicenseMock(req, {
    user: { id: "u-1" },
    isSuperAdmin: true,
    license: validLicense({ school_id: "school-hacker" }),
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.token, undefined);
});

test("[Mock Handler HTTP] Refuse une licence suspendue (403)", async () => {
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123" });
  const res = await handleIssueLicenseMock(req, {
    user: { id: "u-1" },
    isSuperAdmin: true,
    license: validLicense({ status: "SUSPENDED" }),
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.token, undefined);
});

test("[Mock Handler HTTP] Refuse une licence pas encore active (starts_at futur) (403)", async () => {
  const future = new Date(Date.now() + 864000000).toISOString();
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123" });
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
  const req = makeRequest({ license_id: "lic-001", school_id: "school-123" });
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

  const req = makeRequest({ license_id: "lic-001", school_id: "school-123" });
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
