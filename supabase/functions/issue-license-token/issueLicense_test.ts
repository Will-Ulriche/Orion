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
