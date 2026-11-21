export const SCHOOL_ADMIN_ROLES = ['DIRECTION', 'SECRETAIRE'] as const;
export const TEACHER_RECAP_ROLES = ['DIRECTION', 'PROFESSEUR'] as const;
export const SUPER_ADMIN_ROLES = ['SUPER_ADMIN'] as const;

export const ROUTE_ROLES = {
  '/super-admin': SUPER_ADMIN_ROLES,
  '/super-admin/ecoles': SUPER_ADMIN_ROLES,
  '/super-admin/comptes': SUPER_ADMIN_ROLES,
  '/super-admin/licences': SUPER_ADMIN_ROLES,
  '/super-admin/appareils': SUPER_ADMIN_ROLES,
  '/super-admin/stats': SUPER_ADMIN_ROLES,
  '/super-admin/export': SUPER_ADMIN_ROLES,
  '/students': ['DIRECTION', 'SECRETAIRE', 'COMPTABLE'],
  '/classes': SCHOOL_ADMIN_ROLES,
  '/prise-en-main': ['DIRECTION'],
  '/finances': ['DIRECTION', 'COMPTABLE'],
  '/personnel': ['DIRECTION'],
  '/security': ['DIRECTION'],
  '/settings': ['DIRECTION'],
  '/vie-scolaire': SCHOOL_ADMIN_ROLES,
  '/bibliotheque': SCHOOL_ADMIN_ROLES,
  '/archives': ['DIRECTION'],
  '/sync': ['DIRECTION'],
  '/pedagogie': ['DIRECTION', 'SECRETAIRE', 'PROFESSEUR'],
  '/recap-notes': TEACHER_RECAP_ROLES,
} as const;

export const AUTHENTICATED_ONLY_ROUTES = ['/', '/account'] as const;

export type AppRoute = keyof typeof ROUTE_ROLES;

export function normalizeRoles(roles: readonly unknown[]): string[] {
  const normalized: string[] = [];
  for (const role of roles) {
    if (typeof role !== 'string') continue;
    const value = role.trim().toUpperCase();
    if (value && !normalized.includes(value)) normalized.push(value);
  }
  return normalized;
}

export function hasAnyRole(
  roles: readonly unknown[],
  allowedRoles: readonly unknown[]
): boolean {
  const normalized = normalizeRoles(roles);
  const allowed = normalizeRoles(allowedRoles);
  return allowed.length > 0 && normalized.some((role) => allowed.includes(role));
}

export function canAccessRoute(
  roles: readonly unknown[],
  path: string
): boolean {
  if ((AUTHENTICATED_ONLY_ROUTES as readonly string[]).includes(path)) return true;
  const allowedRoles = ROUTE_ROLES[path as AppRoute];
  if (!allowedRoles) return false;
  return hasAnyRole(roles, allowedRoles);
}
