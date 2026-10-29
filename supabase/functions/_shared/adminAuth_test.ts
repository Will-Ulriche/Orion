import {
  decideAdminAccess,
  isAllowedCreateRole,
} from "./adminAuth.ts";

Deno.test("refuse une opération admin sans jeton", () => {
  const denied = decideAdminAccess({
    hasBearer: false,
    userPresent: false,
    isSuperAdmin: false,
  });
  if (denied.status !== 401) {
    throw new Error(`attendu 401, reçu ${denied.status}`);
  }
});

Deno.test("refuse un utilisateur authentifié non super-admin", () => {
  const denied = decideAdminAccess({
    hasBearer: true,
    userPresent: true,
    isSuperAdmin: false,
  });
  if (denied.status !== 403) {
    throw new Error(`attendu 403, reçu ${denied.status}`);
  }
});

Deno.test("autorise uniquement un super-admin authentifié", () => {
  const allowed = decideAdminAccess({
    hasBearer: true,
    userPresent: true,
    isSuperAdmin: true,
  });
  if (allowed.status !== 200) {
    throw new Error(`attendu 200, reçu ${allowed.status}`);
  }
});

Deno.test("interdit la création d'un rôle SUPER_ADMIN via l'API admin", () => {
  if (isAllowedCreateRole("SUPER_ADMIN")) {
    throw new Error("SUPER_ADMIN ne doit pas être créable via cette API");
  }
  if (!isAllowedCreateRole("DIRECTION")) {
    throw new Error("DIRECTION doit rester autorisé");
  }
});
