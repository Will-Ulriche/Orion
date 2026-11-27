export interface CachedLicenseRef {
  id?: string;
  school_id?: string;
  is_current?: boolean;
}

export interface LicenseLocalInvalidation {
  clearCache: boolean;
  clearLastOk: boolean;
  clearToken: boolean;
}

export function decideLicenseLocalInvalidation(
  cached: CachedLicenseRef | null,
  licenseId: string,
  schoolId: string,
  wasCurrent: boolean
): LicenseLocalInvalidation {
  const matches = cached != null && (cached.id === licenseId || cached.school_id === schoolId);
  const unrelatedCached = cached != null && !matches;
  const currentAffected = wasCurrent || cached?.is_current === true;

  return {
    clearCache: matches,
    clearLastOk: matches,
    clearToken: !unrelatedCached && currentAffected,
  };
}
