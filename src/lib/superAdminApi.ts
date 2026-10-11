import { supabase } from './supabaseClient';

// ─── Types ──────────────────────────────────────────────────

export interface School {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  website: string | null;
  currency: string | null;
  timezone: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SchoolInput {
  name: string;
  short_name: string | null;
  city: string | null;
  country: string | null;
  phone_primary: string | null;
  email: string | null;
  status: string;
}

export interface License {
  id: string;
  school_id: string;
  license_key: string;
  status: string;
  issued_at: string | null;
  starts_at: string | null;
  expires_at: string | null;
  max_devices: number | null;
  created_at: string;
  updated_at: string;
  schools: { name: string; short_name: string | null } | null;
}

export interface LicenseInput {
  school_id: string;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
  max_devices: number;
}

export interface Device {
  id: string;
  school_id: string;
  device_identifier: string;
  device_name: string | null;
  platform: string | null;
  status: string;
  last_seen_at: string | null;
  created_at: string;
  schools: { name: string; short_name: string | null } | null;
}

export const LICENSE_STATUSES = ['ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED'] as const;
export const SCHOOL_STATUSES = ['ACTIVE', 'SUSPENDED', 'CLOSED'] as const;

// ─── Helpers ────────────────────────────────────────────────

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Génère une clé de licence au format ORION-XXXX-XXXX-XXXX. */
export function generateLicenseKey(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  const seg = (i: number) => chars.slice(i, i + 4).join('');
  return `ORION-${seg(0)}-${seg(4)}-${seg(8)}`;
}

/** Numéro de téléphone par défaut selon le pays (indicatif simple). */
export function defaultCountry(): string {
  return 'Togo';
}

// ─── Établissements ─────────────────────────────────────────

export async function listSchools(): Promise<School[]> {
  const res = await supabase
    .from('schools')
    .select('*')
    .order('created_at', { ascending: false });
  return unwrap<School[]>(res);
}

export async function createSchool(input: SchoolInput): Promise<School> {
  const res = await supabase.from('schools').insert(input).select('*').single();
  return unwrap<School>(res);
}

export async function updateSchool(id: string, input: Partial<SchoolInput>): Promise<void> {
  const res = await supabase.from('schools').update({ ...input, updated_at: new Date().toISOString() }).eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

export async function setSchoolStatus(id: string, status: string): Promise<void> {
  const res = await supabase.from('schools').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

// ─── Licences ───────────────────────────────────────────────

export async function listLicenses(): Promise<License[]> {
  const res = await supabase
    .from('licenses')
    .select('*, schools(name, short_name)')
    .order('created_at', { ascending: false });
  return unwrap<License[]>(res);
}

export async function createLicense(input: LicenseInput): Promise<License> {
  const res = await supabase
    .from('licenses')
    .insert({
      school_id: input.school_id,
      license_key: generateLicenseKey(),
      status: input.status,
      starts_at: input.starts_at,
      expires_at: input.expires_at,
      max_devices: input.max_devices,
      issued_at: new Date().toISOString(),
    })
    .select('*, schools(name, short_name)')
    .single();
  return unwrap<License>(res);
}

export async function setLicenseStatus(id: string, status: string): Promise<void> {
  const res = await supabase.from('licenses').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

export async function updateLicense(id: string, patch: Partial<LicenseInput>): Promise<void> {
  const res = await supabase.from('licenses').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

// ─── Appareils ──────────────────────────────────────────────

export async function listDevices(): Promise<Device[]> {
  const res = await supabase
    .from('devices')
    .select('*, schools(name, short_name)')
    .order('created_at', { ascending: false });
  return unwrap<Device[]>(res);
}

// ─── Statistiques ───────────────────────────────────────────

export interface SuperAdminStats {
  schools: number;
  activeLicenses: number;
  devices: number;
  expiringSoon: number;
}

export async function getStats(): Promise<SuperAdminStats> {
  const [schools, licenses, devices] = await Promise.all([
    listSchools(),
    listLicenses(),
    listDevices(),
  ]);

  const now = Date.now();
  const in30Days = now + 30 * 24 * 60 * 60 * 1000;
  const expiringSoon = licenses.filter(
    (l) => l.status === 'ACTIVE' && l.expires_at && new Date(l.expires_at).getTime() <= in30Days
  ).length;

  return {
    schools: schools.length,
    activeLicenses: licenses.filter((l) => l.status === 'ACTIVE').length,
    devices: devices.length,
    expiringSoon,
  };
}
