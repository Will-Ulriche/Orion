import * as XLSX from 'xlsx';
import { listSchools, type School } from './superAdminApi';
import { supabase } from './supabaseClient';

// ─── Types ─────────────────────────────────────────────────────────

export interface AcademicYear {
  id: string;
  school_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  is_current: boolean;
}

export interface ExportFile {
  fileName: string;
  base64: string;
}

export interface ExportOptions {
  /** IDs des écoles à exporter. Vide = toutes les écoles. */
  schoolIds: string[];
  /** IDs des années à exporter. Vide = toutes les années. */
  yearIds: string[];
}

export interface ExportResult {
  files: ExportFile[];
  schoolsDone: number;
  yearsDone: number;
}

/** Contexte partagé pour la construction d'un classeur (jointures résolues). */
interface Ctx {
  school: School;
  year: AcademicYear | null;
  yearName: string;
  classes: any[];
  studentsByClass: Map<string, any[]>;
  subjects: any[];
  subjectsById: Map<string, any>;
  teachings: any[];
  teachingsById: Map<string, any>;
  periodsById: Map<string, any>;
  gradeTypesById: Map<string, any>;
  grades: any[];
  fees: any[];
  feesById: Map<string, any>;
  payments: any[];
  professors: any[];
  studentById: Map<string, any>;
  teacherNameById: Map<string, string>;
}

// ─── Helpers ───────────────────────────────────────────────────────

type JsonRow = Record<string, string | number | boolean | null>;

/** Récupère TOUTES les lignes d'une table pour un ensemble d'écoles (pagination 1000). */
async function fetchAll<T extends JsonRow>(table: string, schoolIds: string[]): Promise<T[]> {
  if (schoolIds.length === 0) return [];
  const out: T[] = [];
  const page = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table as any)
      .select('*')
      .in('school_id', schoolIds)
      .order('created_at', { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(`Table ${table}: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < page) break;
    from += page;
  }
  return out;
}

/** Date lisible en français (jj/mm/aaaa) — restitue la valeur brute sinon. */
function fmt(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && typeof (v as any).toISOString === 'function') {
    const iso = (v as Date).toISOString().slice(0, 10);
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  return s;
}

/** Crée une feuille à partir d'en-têtes + lignes, avec entête stylée. */
function makeSheet(headers: string[], rows: (string | number | null | undefined)[][]): XLSX.WorkSheet {
  const data = [headers, ...rows.map((r) => r.map((c) => c ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = headers.map((h, i) => {
    let w = h.length;
    for (let r = 0; r < rows.length && r < 300; r++) {
      const len = String(rows[r][i] ?? '').length;
      if (len > w) w = len;
    }
    return { wch: Math.min(Math.max(w + 2, 10), 45) };
  });
  headers.forEach((_, i) => {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: i })];
    if (cell && typeof cell === 'object') {
      cell.s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '334155' } },
        alignment: { vertical: 'center' },
      };
    }
  });
  return ws;
}

function sanitizeSheetName(name: string): string {
  const clean = name.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
  return clean.trim().length === 0 ? 'Feuille' : clean;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 140);
}

function schoolLabel(s: School): string {
  return (s.short_name || s.name || 'Etablissement').replace(/\s+/g, '-');
}

function yearFolderName(y: AcademicYear): string {
  return sanitizeFileName(y.name || 'Annee-inconnue');
}

// ─── Chargement des années scolaires ───────────────────────────────

export async function loadAcademicYears(schoolIds: string[]): Promise<AcademicYear[]> {
  if (schoolIds.length === 0) return [];
  const { data, error } = await supabase
    .from('academic_years')
    .select('*')
    .in('school_id', schoolIds)
    .order('start_date', { ascending: false });
  if (error) throw new Error(`academic_years: ${error.message}`);
  return (data ?? []) as AcademicYear[];
}

// ─── Construction des fichiers Excel ───────────────────────────────

export async function buildExportFiles(options: ExportOptions): Promise<ExportResult> {
  const schools = await listSchools();

  const selectedSchools = schools.filter(
    (s) => options.schoolIds.length === 0 || options.schoolIds.includes(s.id)
  );
  if (selectedSchools.length === 0) throw new Error('Aucun établissement à exporter.');

  const schoolIds = selectedSchools.map((s) => s.id);

  const allYears = await loadAcademicYears(schoolIds);
  const years = allYears.filter(
    (y) => options.yearIds.length === 0 || options.yearIds.includes(y.id)
  );
  if (years.length === 0 && options.yearIds.length > 0) {
    throw new Error("Aucune année scolaire ne correspond à la sélection.");
  }

  // ── Récupération de toutes les données en parallèle ──
  const [classes, students, enrollments, subjects, classSubjects, gradingPeriods, gradeTypes, grades, feeStructures, payments, staff, professors] =
    await Promise.all([
      fetchAll<any>('classes', schoolIds),
      fetchAll<any>('students', schoolIds),
      fetchAll<any>('enrollments', schoolIds),
      fetchAll<any>('subjects', schoolIds),
      fetchAll<any>('class_subjects', schoolIds),
      fetchAll<any>('grading_periods', schoolIds),
      fetchAll<any>('grade_types', schoolIds),
      fetchAll<any>('grades', schoolIds),
      fetchAll<any>('fee_structures', schoolIds),
      fetchAll<any>('payments', schoolIds),
      fetchAll<any>('staff', schoolIds).catch(() => [] as any[]),
      fetchProfessors(schoolIds),
    ]);

  // ── Index utiles ──
  const studentsById = new Map(students.map((s) => [s.id, s]));
  const subjectsById = new Map(subjects.map((s) => [s.id, s]));

  // Nom des professeurs : staff cloud (id → nom) puis comptes utilisateurs.
  const teacherNameById = new Map<string, string>();
  for (const st of staff) {
    const full = [st.prenoms, st.nom].filter(Boolean).join(' ') || st.email;
    if (full) teacherNameById.set(st.id, String(full));
  }
  for (const t of professors) {
    if (!teacherNameById.has(t.user_id)) teacherNameById.set(t.user_id, t.name);
  }

  const files: ExportFile[] = [];

  const bySchool = new Map<string, AcademicYear[]>();
  for (const y of years) {
    if (!bySchool.has(y.school_id)) bySchool.set(y.school_id, []);
    bySchool.get(y.school_id)!.push(y);
  }

  for (const school of selectedSchools) {
    const schoolYears = bySchool.get(school.id) ?? [];

    // École sans année enregistrée → fiches vides avec contexte école.
    if (schoolYears.length === 0) {
      const ctx: Ctx = {
        school, year: null, yearName: '—',
        classes: [], studentsByClass: new Map(), subjects: [], subjectsById,
        teachings: [], teachingsById: new Map(), periodsById: new Map(),
        gradeTypesById: new Map(), grades: [], fees: [], feesById: new Map(),
        payments: [], professors: [], studentById: studentsById, teacherNameById,
      };
      files.push({
        fileName: `Export_${schoolLabel(school)}_sans-annee.xlsx`,
        base64: toBase64(buildWorkbook(ctx)),
      });
      continue;
    }

    for (const year of schoolYears) {
      const yearId = year.id;

      const enrolls = enrollments.filter((e) => e.academic_year_id === yearId && e.school_id === school.id);
      const studentsByClass = new Map<string, any[]>();
      for (const e of enrolls) {
        const st = studentsById.get(e.student_id);
        if (!st) continue;
        const enr = { ...st, _enrollment: e };
        if (!studentsByClass.has(e.class_id)) studentsByClass.set(e.class_id, []);
        studentsByClass.get(e.class_id)!.push(enr);
      }

      const yearClasses = classes.filter((c) => c.academic_year_id === yearId && c.school_id === school.id);
      const teachings = classSubjects.filter((cs) => cs.academic_year_id === yearId && cs.school_id === school.id);
      const yearGrades = grades.filter((g) => g.academic_year_id === yearId && g.school_id === school.id);
      const yearFees = feeStructures.filter((f) => f.academic_year_id === yearId && f.school_id === school.id);
      const feesById = new Map(yearFees.map((f) => [f.id, f]));
      const yearPayments = payments.filter((p) => p.academic_year_id === yearId && p.school_id === school.id);
      const yearProfessors = professors.filter((p) => p.school_id === school.id);

      const ctx: Ctx = {
        school, year, yearName: year.name || '—',
        classes: yearClasses, studentsByClass, subjects, subjectsById,
        teachings, teachingsById: new Map(teachings.map((t) => [t.id, t])),
        periodsById: new Map(gradingPeriods.filter((p) => p.school_id === school.id).map((p) => [p.id, p])),
        gradeTypesById: new Map(gradeTypes.filter((g) => g.school_id === school.id).map((g) => [g.id, g])),
        grades: yearGrades, fees: yearFees, feesById,
        payments: yearPayments, professors: yearProfessors, studentById: studentsById, teacherNameById,
      };

      files.push({
        fileName: `Export_${schoolLabel(school)}_${yearFolderName(year)}.xlsx`,
        base64: toBase64(buildWorkbook(ctx)),
      });
    }
  }

  return { files, schoolsDone: selectedSchools.length, yearsDone: years.length };
}

// ─── Construction d'un classeur (école × année) ────────────────────

function buildWorkbook(ctx: Ctx): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const { school, year, yearName } = ctx;

  // 1. Établissement + année
  const info = [
    ['Établissement', school.name || ''],
    ['Sigle', school.short_name || ''],
    ['Ville', school.city || ''],
    ['Pays', school.country || ''],
    ['Téléphone', school.phone_primary || school.phone_secondary || ''],
    ['Email', school.email || ''],
    ['Site web', school.website || ''],
    ['Devise', school.currency || ''],
    ['Statut', school.status || ''],
    ['Année scolaire', yearName],
    ['Début', year ? fmt(year.start_date) : ''],
    ['Fin', year ? fmt(year.end_date) : ''],
    ['Statut année', year ? (year.status || '') : ''],
  ];
  XLSX.utils.book_append_sheet(wb, makeSheet(['Rubrique', 'Valeur'], info), sanitizeSheetName('Établissement'));

  // 2. Classes (avec effectif)
  const classRows = ctx.classes.map((c) => [
    yearName,
    c.name || '',
    c.level || '',
    ctx.studentsByClass.get(c.id)?.length ?? 0,
  ]);
  XLSX.utils.book_append_sheet(wb, makeSheet(['Année', 'Classe', 'Niveau', 'Effectif'], classRows), sanitizeSheetName('Classes'));

  // 3. Élèves inscrits (avec classe)
  const studentRows: any[][] = [];
  for (const [classId, studentsInClass] of ctx.studentsByClass) {
    const className = ctx.classes.find((c) => c.id === classId)?.name || classId;
    for (const st of studentsInClass) {
      const e = st._enrollment;
      studentRows.push([
        st.matricule || '',
        st.last_name || '',
        st.first_name || '',
        st.gender || '',
        fmt(st.birth_date),
        st.birth_place || '',
        className,
        e?.enrollment_number || '',
        e?.enrollment_type || '',
        e?.status || '',
        st.parent_name || '',
        st.parent_phone || '',
        st.parent_email || '',
        st.address || '',
        st.phone || '',
      ]);
    }
  }
  XLSX.utils.book_append_sheet(wb, makeSheet(
    ['Matricule', 'Nom', 'Prénom', 'Sexe', 'Naissance', 'Lieu naissance', 'Classe',
     'N° inscription', "Type d'inscription", 'Statut', 'Parent', 'Tél parent', 'Email parent', 'Adresse', 'Tél élève'],
    studentRows
  ), sanitizeSheetName('Élèves'));

  // 4. Matières
  const subjectRows = ctx.subjects.map((s) => [s.code || '', s.name || '', s.color || '']);
  XLSX.utils.book_append_sheet(wb, makeSheet(['Code', 'Matière', 'Couleur'], subjectRows), sanitizeSheetName('Matières'));

  // 5. Enseignements (classe × matière × coefficient × prof)
  const teachingRows = ctx.teachings.map((cs) => {
    const className = classOf(ctx.classes, cs.class_id);
    const subjectName = ctx.subjectsById.get(cs.subject_id)?.name || cs.subject_id || '';
    return [yearName, className, subjectName, cs.coefficient ?? '', ctx.teacherNameById.get(cs.teacher_id) || cs.teacher_id || ''];
  });
  XLSX.utils.book_append_sheet(wb, makeSheet(
    ['Année', 'Classe', 'Matière', 'Coefficient', 'Professeur'], teachingRows
  ), sanitizeSheetName('Enseignements'));

  // 6. Professeurs (comptes)
  const profRows = ctx.professors.map((p) => [p.firstName, p.lastName, p.email, p.phone || '']);
  XLSX.utils.book_append_sheet(wb, makeSheet(['Prénom', 'Nom', 'Email', 'Téléphone'], profRows), sanitizeSheetName('Professeurs'));

  // 7. Notes (élève, classe, matière, période, type, note)
  const enrollmentById = new Map<string, any>();
  for (const studentsInClass of ctx.studentsByClass.values()) {
    for (const st of studentsInClass) {
      if (st._enrollment) enrollmentById.set(st._enrollment.id, st._enrollment);
    }
  }
  const studentNameOf = (enrollmentId: string) => {
    const e = enrollmentById.get(enrollmentId);
    if (!e) return enrollmentId;
    const st = ctx.studentById.get(e.student_id);
    return st ? `${st.last_name || ''} ${st.first_name || ''}`.trim() : enrollmentId;
  };
  const gradeRows = ctx.grades.map((g) => {
    const enrollment = enrollmentById.get(g.enrollment_id);
    const className = enrollment ? classOf(ctx.classes, enrollment.class_id) : '';
    const cs = ctx.teachingsById.get(g.class_subject_id);
    const subjectName = ctx.subjectsById.get(cs?.subject_id)?.name || g.class_subject_id || '';
    const periodName = ctx.periodsById.get(g.grading_period_id)?.name || '';
    const typeName = ctx.gradeTypesById.get(g.grade_type_id)?.name || '';
    return [
      yearName,
      className,
      studentNameOf(g.enrollment_id),
      subjectName,
      periodName,
      typeName,
      g.score ?? '',
      g.max_score ?? 20,
      g.is_absent ? 'Oui' : '',
      fmt(g.evaluation_date),
    ];
  });
  XLSX.utils.book_append_sheet(wb, makeSheet(
    ['Année', 'Classe', 'Élève', 'Matière', 'Période', 'Type évaluation', 'Note', 'Sur', 'Absent', 'Date éval'],
    gradeRows
  ), sanitizeSheetName('Notes'));

  // 8. Frais
  const feeRows = ctx.fees.map((f) => [yearName, f.name || '', f.amount ?? '', f.fee_type || '', f.is_mandatory ? 'Oui' : 'Non', fmt(f.due_date)]);
  XLSX.utils.book_append_sheet(wb, makeSheet(
    ['Année', 'Libellé', 'Montant', 'Type', 'Obligatoire', 'Échéance'], feeRows
  ), sanitizeSheetName('Frais'));

  // 9. Paiements
  const paymentRows = ctx.payments.map((p) => {
    const st = ctx.studentById.get(p.student_id);
    const studentName = st ? `${st.last_name || ''} ${st.first_name || ''}`.trim() : p.student_id;
    return [
      yearName,
      studentName,
      ctx.feesById.get(p.fee_structure_id)?.name || '',
      p.amount ?? '',
      fmt(p.payment_date),
      p.payment_method || '',
      p.reference || '',
      p.receipt_number || '',
      p.status || '',
    ];
  });
  XLSX.utils.book_append_sheet(wb, makeSheet(
    ['Année', 'Élève', 'Frais', 'Montant', 'Date', 'Méthode', 'Référence', 'N° reçu', 'Statut'],
    paymentRows
  ), sanitizeSheetName('Paiements'));

  return wb;
}

// ─── Petits helpers de jointure ────────────────────────────────────

function classOf(classes: any[], id: string | null | undefined): string {
  if (!id) return '';
  return classes.find((c) => c.id === id)?.name || id;
}

function toBase64(wb: XLSX.WorkBook): string {
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;
}

// ─── Professeurs (utilisateurs au rôle PROFESSEUR) ─────────────────

interface ProfessorRow {
  user_id: string;
  school_id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  name: string;
}

async function fetchProfessors(schoolIds: string[]): Promise<ProfessorRow[]> {
  if (schoolIds.length === 0) return [];
  const { data: ur, error } = await supabase
    .from('user_roles')
    .select('user_id, school_id, roles(name)')
    .in('school_id', schoolIds);
  if (error) throw new Error(`user_roles: ${error.message}`);

  const profUserIds = (ur ?? [])
    .filter((r: any) => r.roles?.[0]?.name === 'PROFESSEUR')
    .map((r: any) => r.user_id);
  if (profUserIds.length === 0) return [];

  const [profilesRes, usersRes] = await Promise.all([
    supabase.from('profiles').select('user_id, first_name, last_name, phone'),
    supabase.from('users').select('id, email'),
  ]);
  if (profilesRes.error) throw new Error(`profiles: ${profilesRes.error.message}`);
  if (usersRes.error) throw new Error(`users: ${usersRes.error.message}`);

  const profMap = new Map((profilesRes.data ?? []).map((p: any) => [p.user_id, p]));
  const userMap = new Map((usersRes.data ?? []).map((u: any) => [u.id, u]));

  const unique = new Map<string, ProfessorRow>();
  for (const r of ur ?? []) {
    if (r.roles?.[0]?.name !== 'PROFESSEUR') continue;
    const p = profMap.get(r.user_id);
    const u = userMap.get(r.user_id);
    const first = p?.first_name || '';
    const last = p?.last_name || '';
    unique.set(r.user_id, {
      user_id: r.user_id,
      school_id: r.school_id,
      firstName: first,
      lastName: last,
      email: u?.email || '',
      phone: p?.phone || null,
      name: `${first} ${last}`.trim() || u?.email || r.user_id,
    });
  }
  return Array.from(unique.values());
}
