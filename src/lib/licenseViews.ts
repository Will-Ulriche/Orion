export type LicenseView = 'current' | 'blocked' | 'archive';

export interface LicenseViewRecord {
  is_current: boolean;
  status: string;
}

export const LICENSE_VIEWS: ReadonlyArray<{ id: LicenseView; label: string }> = [
  { id: 'current', label: 'Licences courantes' },
  { id: 'blocked', label: 'Suspendues / révoquées' },
  { id: 'archive', label: 'Historique archivé' },
];

export function classifyLicenseView(license: LicenseViewRecord): LicenseView {
  if (license.is_current !== true) return 'archive';
  if (license.status === 'SUSPENDED' || license.status === 'REVOKED' || license.status === 'EXPIRED') {
    return 'blocked';
  }
  return 'current';
}

export function groupLicensesByView<T extends LicenseViewRecord>(
  licenses: T[]
): Record<LicenseView, T[]> {
  const groups: Record<LicenseView, T[]> = { current: [], blocked: [], archive: [] };
  for (const license of licenses) {
    groups[classifyLicenseView(license)].push(license);
  }
  return groups;
}

export function filterLicensesByView<T extends LicenseViewRecord>(
  licenses: T[],
  view: LicenseView
): T[] {
  return licenses.filter((license) => classifyLicenseView(license) === view);
}
