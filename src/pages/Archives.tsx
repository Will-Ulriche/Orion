import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from '../contexts/AuthContext';
import { useYear } from '../contexts/YearContext';
import {
  BookOpen, GraduationCap, Coins, UserCog, FileText, Download,
  CalendarDays, Users, Loader2, CheckCircle, AlertCircle, X, Search, ClipboardList, ClipboardCheck,
  User, CreditCard, ChevronRight, Info, RefreshCw, Wallet, TrendingUp, CheckCircle2, BarChart2,
} from 'lucide-react';
import { EmptyState, Loader } from '../components/ui';
import StaffIdentityModal from '../components/StaffIdentityModal';
import StaffListModal from '../components/StaffListModal';
import StudentIdentityModal from '../components/StudentIdentityModal';
import BulletinModal from '../components/BulletinModal';
import NominalListModal from '../components/NominalListModal';
import PresenceListModal from '../components/PresenceListModal';
import TimetableModal from '../components/TimetableModal';
import { genderCode, type NominalListClassInput } from '../lib/nominalListTemplate';
import { saveFinanceReportPdf, type FinanceReportData } from '../lib/financeReportPdf';
import { preloadPresenceTemplate } from '../lib/presenceListPdf';
import type { ReceiptSchoolInfo } from '../lib/receiptPdf';
import { nextPaint } from '../utils/ui';

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────
interface SectionRow { id: string; name: string; }
interface LevelRow { id: string; section_id: string; name: string; }
interface ClassRow {
  id: string; name: string; level: string | null; level_id: string | null;
  student_count: number; homeroom_teacher_name: string | null;
}
interface StudentRow {
  id: string; student_id: string; class_id: string | null; status: string;
  first_name: string | null; last_name: string | null; matricule: string | null;
  class_name: string | null; class_level: string | null; gender: string | null;
}
interface FinancialDashboard {
  total_due: number;
  total_paid: number;
  remaining_balance: number;
  recovery_rate: number;
  student_count: number;
  settled_count: number;
  partial_count: number;
  unpaid_count: number;
  cancelled_payment_count: number;
  by_class: {
    class_id: string | null;
    class_name: string;
    student_count: number;
    total_due: number;
    total_paid: number;
    remaining_balance: number;
  }[];
  by_method: {
    method: string;
    amount: number;
    payment_count: number;
  }[];
  debtors: {
    student_id?: string;
    enrollment_id: string;
    first_name: string;
    last_name: string;
    class_name: string;
    total_due: number;
    total_paid: number;
    remaining_balance: number;
    status: string;
  }[];
}

interface FeeStructureRow {
  id: string; name: string; amount: number; fee_type: string; applies_to: string;
  class_name: string | null; due_date: string | null; is_mandatory: boolean;
}

interface StaffRow {
  id: string; matricule: string | null; nom: string; prenoms: string;
  type_personnel: string | null; fonction: string | null; statut_administratif: string;
}

/** get_staff renvoie le modèle Staff complet : on élargit StaffRow pour la fiche d'identité. */
interface StaffRecord extends StaffRow {
  sexe: string | null;
  date_naissance: string | null;
  lieu_naissance: string | null;
  nationalite: string | null;
  situation_matrimoniale: string | null;
  nombre_enfants: number | null;
  telephone_principal: string | null;
  telephone_secondaire: string | null;
  email: string | null;
  adresse: string | null;
  region: string | null;
  commune: string | null;
  quartier: string | null;
  urgence_nom: string | null;
  urgence_telephone: string | null;
  statut_professionnel: string | null;
  matricule_professionnel: string | null;
  categorie: string | null;
  grade: string | null;
  diplome_academique: string | null;
  diplome_professionnel: string | null;
  specialite: string | null;
  date_recrutement: string | null;
  date_prise_service: string | null;
  date_affectation: string | null;
  etablissement: string | null;
  observations: string | null;
}

// ─────────────────────────────────────────────────────
// Constantes & helpers
// ─────────────────────────────────────────────────────
const norm = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const COLLEGE_LEVELS = ['6e', '5e', '4e', '3e'];
const LYCEE_LEVELS = ['seconde', 'premiere', 'terminale'];

const FEE_TYPES = [
  { id: 'INSCRIPTION', label: 'Inscription' },
  { id: 'SCOLARITE', label: 'Scolarité' },
  { id: 'TRANSPORT', label: 'Transport' },
  { id: 'CANTINE', label: 'Cantine' },
  { id: 'AUTRE', label: 'Autre' },
];
const PAYMENT_METHODS = [
  { id: 'ESPECES', label: 'Espèces' },
  { id: 'MOBILE_MONEY', label: 'Mobile Money' },
  { id: 'VIREMENT', label: 'Virement bancaire' },
  { id: 'CHEQUE', label: 'Chèque' },
];

const EMPTY_SCHOOL_INFO: ReceiptSchoolInfo = {
  name: '', short_name: '', ministry_name: '', address: '', city: '',
  country: '', phone: '', email: '', website: '', registration_number: '',
  logo_url: '', stamp_url: '', signature_url: '', head_title: 'Directeur',
  head_name: '', slogan: '', currency: 'XOF',
};

// ── Cache de session ──
// Le socle (classes, niveaux, sections) est commun à tous les onglets : on le
// garde en mémoire pour que les entrées suivantes soient immédiates. Les élèves
// et le personnel ne sont chargés que lorsque leur onglet est ouvert.
interface ArchivesCacheEntry {
  sections: SectionRow[];
  levels: LevelRow[];
  classes: ClassRow[];
  schoolInfo: ReceiptSchoolInfo;
  students?: StudentRow[];
  staff?: StaffRecord[];
}
const archivesCache = new Map<string, ArchivesCacheEntry>();

if (typeof window !== 'undefined') {
  const clearArchives = () => {
    archivesCache.clear();
  };
  window.addEventListener('orion:school-settings-updated', clearArchives);
  window.addEventListener('orion:school-changed', clearArchives);
}


const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'college', label: 'Collège', icon: BookOpen },
  { id: 'lycee', label: 'Lycée', icon: GraduationCap },
  { id: 'finances', label: 'Finances', icon: Coins },
  { id: 'personnel', label: 'Personnel', icon: UserCog },
];

// Boutons de documents de la colonne de droite
// `schoolOnly: true` → affiché uniquement sur les onglets Collège et Lycée
const RIGHT_ACTIONS: { label: string; icon: typeof Users; tint: string; schoolOnly?: boolean }[] = [
  { label: 'Emploi du temps', icon: CalendarDays, tint: 'bg-violet-50 text-violet-600' },
  { label: 'Bulletin de notes', icon: ClipboardList, tint: 'bg-amber-50 text-amber-600' },
  { label: 'Liste de notes', icon: FileText, tint: 'bg-indigo-50 text-indigo-600' },
  { label: "Fiche d'identité", icon: User, tint: 'bg-sky-50 text-sky-600' },
  { label: 'Carte scolaire', icon: CreditCard, tint: 'bg-emerald-50 text-emerald-600' },
  { label: 'Liste nominative de la classe', icon: GraduationCap, tint: 'bg-rose-50 text-rose-600' },
  { label: 'Liste de présence', icon: ClipboardCheck, tint: 'bg-teal-50 text-teal-600', schoolOnly: true },
];

// Boutons de documents de la colonne de droite — onglet Personnel
const RIGHT_ACTIONS_PERSONNEL: { label: string; icon: typeof Users; tint: string }[] = [
  { label: "Fiche d'identité", icon: User, tint: 'bg-sky-50 text-sky-600' },
  { label: 'Liste du personnel', icon: Users, tint: 'bg-indigo-50 text-indigo-600' },
  { label: 'Badge du personnel', icon: CreditCard, tint: 'bg-emerald-50 text-emerald-600' },
];

interface FeeStructureRow {
  id: string; name: string; amount: number; fee_type: string; applies_to: string;
  class_name: string | null; due_date: string | null; is_mandatory: boolean;
}

type Tab = 'college' | 'lycee' | 'finances' | 'personnel';
type Group = 'college' | 'lycee';

// ─────────────────────────────────────────────────────
// Toast animé (identique à Personnel)
// ─────────────────────────────────────────────────────
function Toast({ type, message, onClose }: { type: 'success' | 'error' | 'info'; message: string; onClose: () => void }) {
  const tones = {
    success: { wrap: 'border-emerald-200 bg-emerald-50/95 text-emerald-800', circle: 'bg-emerald-100 text-emerald-600', Icon: CheckCircle },
    error:   { wrap: 'border-red-200 bg-red-50/95 text-red-700',            circle: 'bg-red-100 text-red-600',    Icon: AlertCircle },
    info:    { wrap: 'border-sky-200 bg-sky-50/95 text-sky-800',            circle: 'bg-sky-100 text-sky-600',    Icon: Info },
  }[type];
  return (
    <div
      role="status"
      className={`fixed bottom-6 right-6 z-[70] flex max-w-sm animate-toast-in items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-raise backdrop-blur-sm ${tones.wrap}`}
    >
      <span className={`mt-px flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${tones.circle}`}>
        <tones.Icon size={14} />
      </span>
      <p className="flex-1 text-[13px] leading-relaxed">{message}</p>
      <button onClick={onClose} aria-label="Fermer" className="mt-0.5 flex-shrink-0 rounded-md p-0.5 opacity-50 transition-opacity hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}


// ─────────────────────────────────────────────────────
// Page Archives
// ─────────────────────────────────────────────────────
export default function Archives() {
  const { schoolId, user } = useAuth();
  const { selectedYear } = useYear();

  const [tab, setTab] = useState<Tab>('college');
  const [studentSearch, setStudentSearch] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [baseLoading, setBaseLoading] = useState(true);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [staffLoaded, setStaffLoaded] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<ReceiptSchoolInfo>(EMPTY_SCHOOL_INFO);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [financeDashboard, setFinanceDashboard] = useState<FinancialDashboard | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [staffListModalOpen, setStaffListModalOpen] = useState(false);
  const [studentIdentityOpen, setStudentIdentityOpen] = useState(false);
  const [bulletinOpen, setBulletinOpen] = useState(false);
  const [nominalListOpen, setNominalListOpen] = useState(false);
  const [notesListOpen, setNotesListOpen] = useState(false);
  const [presenceListOpen, setPresenceListOpen] = useState(false);
  const [timetableOpen, setTimetableOpen] = useState(false);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), type === 'success' ? 3500 : 7000);
  }, []);

  useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);

  // Précharge le modèle PDF de la liste de présence de manière différée (après le rendu initial)
  useEffect(() => {
    const timer = setTimeout(() => {
      preloadPresenceTemplate();
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Réinitialiser le cache et recharger immédiatement si le nom ou les réglages changent
  useEffect(() => {
    const handleSettingsUpdated = () => {
      archivesCache.clear();
      setRefreshNonce(n => n + 1);
    };
    window.addEventListener('orion:school-settings-updated', handleSettingsUpdated);
    window.addEventListener('orion:school-changed', handleSettingsUpdated);
    return () => {
      window.removeEventListener('orion:school-settings-updated', handleSettingsUpdated);
      window.removeEventListener('orion:school-changed', handleSettingsUpdated);
    };
  }, []);

  // ── Chargement initial consolidé (socle + élèves + personnel en parallèle) ──
  const yearId = selectedYear?.id;
  const cacheKey = schoolId && yearId ? `${schoolId}::${yearId}` : null;

  useEffect(() => {
    if (!cacheKey) { setBaseLoading(false); return; }

    const cached = archivesCache.get(cacheKey);
    if (cached) {
      setSections(cached.sections);
      setLevels(cached.levels);
      setClasses(cached.classes);
      setSchoolInfo(cached.schoolInfo);
      setStudents(cached.students ?? []);
      setStudentsLoaded(true);
      setStaff(cached.staff ?? []);
      setStaffLoaded(true);
      setBaseLoading(false);
      return;
    }

    let cancelled = false;
    setBaseLoading(true);
    setSections([]); setLevels([]); setClasses([]);
    setStudents([]); setStudentsLoaded(false);
    setStaff([]); setStaffLoaded(false);
    setSchoolInfo(EMPTY_SCHOOL_INFO);

    (async () => {
      try {
        const [secs, lvls, cls, settings, stds, stf] = await Promise.all([
          invoke<SectionRow[]>('get_sections', { schoolId }),
          invoke<LevelRow[]>('get_levels', { schoolId, sectionId: null }),
          invoke<ClassRow[]>('get_classes', { schoolId, academicYearId: yearId }),
          invoke<Partial<ReceiptSchoolInfo>>('get_school_settings', { schoolId }).catch(() => ({} as Partial<ReceiptSchoolInfo>)),
          invoke<StudentRow[]>('get_students', {
            schoolId, academicYearId: yearId, classId: null, includePhotos: false,
          }).catch(err => {
            console.error('Erreur get_students:', err);
            return [] as StudentRow[];
          }),
          invoke<StaffRecord[]>('get_staff', { schoolId, includePhotos: false }).catch(err => {
            console.error('Erreur get_staff:', err);
            return [] as StaffRecord[];
          }),
        ]);

        if (cancelled) return;
        const schoolInfo = { ...EMPTY_SCHOOL_INFO, ...settings };
        archivesCache.set(cacheKey, {
          sections: secs,
          levels: lvls,
          classes: cls,
          schoolInfo,
          students: stds,
          staff: stf,
        });

        setSections(secs);
        setLevels(lvls);
        setClasses(cls);
        setSchoolInfo(schoolInfo);
        setStudents(stds);
        setStudentsLoaded(true);
        setStaff(stf);
        setStaffLoaded(true);
      } catch (e) {
        if (!cancelled) showToast('error', `Impossible de charger les archives : ${String(e)}`);
      } finally {
        if (!cancelled) setBaseLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [cacheKey, schoolId, yearId, refreshNonce, showToast]);

  // ── Chargement du tableau de bord financier (Archives > Finances) ──
  useEffect(() => {
    if (tab !== 'finances' || !selectedYear?.id || !schoolId) return;
    let cancelled = false;
    setFinanceLoading(true);
    invoke<FinancialDashboard>('get_financial_dashboard', {
      schoolId,
      academicYearId: selectedYear.id,
    })
      .then(data => {
        if (!cancelled) setFinanceDashboard(data);
      })
      .catch(err => {
        console.error('Erreur get_financial_dashboard:', err);
        if (!cancelled) showToast('error', 'Impossible de charger le tableau de bord financier.');
      })
      .finally(() => {
        if (!cancelled) setFinanceLoading(false);
      });
    return () => { cancelled = true; };
  }, [tab, selectedYear?.id, schoolId, refreshNonce, showToast]);

  // ── Regroupement des classes par niveau ──
  const isSchoolTab = tab === 'college' || tab === 'lycee';
  const group: Group = tab === 'lycee' ? 'lycee' : 'college';
  const groupLabel = group === 'college' ? 'Collège' : 'Lycée';
  // Libellé utilisé dans les messages des boutons « Documents »
  const docScopeLabel = isSchoolTab ? groupLabel : tab === 'personnel' ? 'Personnel' : 'Archives';

  const belongsTo = (cls: ClassRow, g: Group): boolean => {
    const lvl = cls.level_id ? levels.find(l => l.id === cls.level_id) : undefined;
    const sec = lvl ? sections.find(s => s.id === lvl.section_id) : undefined;
    if (sec) {
      const n = norm(sec.name);
      if (n.includes('college')) return g === 'college';
      if (n.includes('lycee')) return g === 'lycee';
    }
    const lv = norm(cls.level ?? lvl?.name ?? '');
    if (!lv) return false;
    const prefixes = g === 'college' ? COLLEGE_LEVELS : LYCEE_LEVELS;
    return prefixes.some(p => lv.startsWith(p));
  };

  const groupClasses = useMemo(
    () => (isSchoolTab ? classes.filter(c => belongsTo(c, group)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classes, sections, levels, isSchoolTab, group]
  );

  const groupStudents = useMemo(() => {
    const ids = new Set(groupClasses.map(c => c.id));
    return students.filter(s => s.class_id !== null && ids.has(s.class_id));
  }, [students, groupClasses]);

  // ── Liste nominative : classes de l'onglet, élèves rattachés ──────────────
  const nominalListClasses = useMemo(() => {
    const byClass = new Map<string, NominalListClassInput['students']>();
    for (const s of groupStudents) {
      if (!s.class_id) continue;
      const list = byClass.get(s.class_id);
      const entry = {
        id: s.student_id,
        lastName: s.last_name,
        firstName: s.first_name,
        gender: s.gender,
      };
      if (list) list.push(entry);
      else byClass.set(s.class_id, [entry]);
    }
    return groupClasses.map(c => ({
      id: c.id,
      name: c.name,
      students: byClass.get(c.id) ?? [],
    }));
  }, [groupClasses, groupStudents]);

  // ── Générateurs ──

  const runDoc = async (id: string, fn: () => void | Promise<void>, successMsg?: string) => {
    if (busy) return;
    setBusy(id);
    await nextPaint();
    try {
      await fn();
      if (successMsg) showToast('success', successMsg);
    } catch (e) {
      showToast('error', `Échec de la génération : ${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleFinanceReport = () => {
    if (!selectedYear) { showToast('error', 'Aucune année scolaire sélectionnée.'); return; }
    runDoc('finance', async () => {
      const [dashboard, fees] = await Promise.all([
        invoke<Omit<FinanceReportData, 'fees'>>('get_financial_dashboard', {
          schoolId, academicYearId: selectedYear.id,
        }),
        invoke<FeeStructureRow[]>('get_fee_structures', {
          schoolId, academicYearId: selectedYear.id,
        }),
      ]);
      saveFinanceReportPdf({
        school: schoolInfo,
        year: selectedYear.name,
        data: {
          ...dashboard,
          fees: fees.map(f => ({
            name: f.name, amount: f.amount, fee_type: f.fee_type,
            applies_to: f.applies_to, class_name: f.class_name,
            due_date: f.due_date, is_mandatory: f.is_mandatory,
          })),
        },
        methodLabels: PAYMENT_METHODS,
        feeTypeLabels: FEE_TYPES,
        exportedBy: user?.email ?? 'Orion ERP',
      });
    }, 'Rapport financier annuel téléchargé.');
  };

  const tabCount = (id: Tab): number | null => {
    if (id === 'personnel') return staffLoaded ? staff.length : null;
    if (id === 'finances') return null;
    const g: Group = id === 'lycee' ? 'lycee' : 'college';
    return classes.filter(c => belongsTo(c, g)).length;
  };

  // Liste filtrée & triée des élèves du groupe actif — Collège ou Lycée (classe, puis nom, puis prénom)
  const groupList = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return groupStudents
      .filter(s => !q ||
        `${s.last_name ?? ''} ${s.first_name ?? ''} ${s.matricule ?? ''} ${s.class_name ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) =>
        (a.class_name ?? '').localeCompare(b.class_name ?? '') ||
        (a.last_name ?? '').localeCompare(b.last_name ?? '') ||
        (a.first_name ?? '').localeCompare(b.first_name ?? ''));
  }, [groupStudents, studentSearch]);

  // Liste filtrée & triée de tout le personnel (nom, puis prénom)
  const staffList = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    return [...staff]
      .filter(s => !q ||
        `${s.nom ?? ''} ${s.prenoms ?? ''} ${s.matricule ?? ''} ${s.fonction ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) =>
        (a.nom ?? '').localeCompare(b.nom ?? '') ||
        (a.prenoms ?? '').localeCompare(b.prenoms ?? ''));
  }, [staff, staffSearch]);

  const staffTeachingMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of classes) {
      const tid = (c as any).homeroom_teacher_id as string | null | undefined;
      if (!tid) continue;
      const arr = m.get(tid) ?? [];
      if (!arr.includes(c.name)) arr.push(c.name);
      m.set(tid, arr);
    }
    return m;
  }, [classes]);

  const staffListForModal = useMemo(() => {
    return staff.map((s) => {
      const taught = staffTeachingMap.get(s.id) ?? [];
      const classesStr = taught.length ? taught.sort((a, b) => a.localeCompare(b, 'fr-FR')).join(', ') : null;
      return {
        id: s.id,
        matricule: s.matricule,
        nom: s.nom,
        prenoms: s.prenoms,
        date_naissance: s.date_naissance,
        fonction: s.fonction,
        type_personnel: s.type_personnel,
        statut_administratif: s.statut_administratif,
        specialite: s.specialite,
        classes_enseignees: classesStr,
        matieres_enseignees: s.specialite ?? null,
      };
    });
  }, [staff, staffTeachingMap]);

  const contentLoading = baseLoading || !studentsLoaded;
  const loadingLabel = 'Chargement des archives…';

  // ── Rendu ──
  if (!selectedYear) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f8f9fc] p-8">
        <EmptyState
          icon={CalendarDays}
          title="Aucune année scolaire"
          description="Sélectionnez une année scolaire dans la barre latérale pour accéder aux archives."
        />
      </div>
    );
  }

  const excludedClasses = classes.length - groupClasses.length;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-gradient-to-b from-slate-50 to-[#f8f9fc]">
      {/* En-tête fixe */}
      <div className="z-20 shrink-0 border-b border-slate-200/60 bg-slate-50/90 backdrop-blur-md">
        <div className="mx-auto max-w-7xl space-y-4 px-8 py-5">
        {/* En-tête */}
        <div className="flex animate-fade-in items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">Archives</h1>
            <p className="text-[13px] text-slate-400">
              Bulletins, listes, emplois du temps, rapports… tous les documents téléchargeables de l'établissement.
            </p>
          </div>
          <span className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => { if (cacheKey) archivesCache.delete(cacheKey); setRefreshNonce(n => n + 1); }}
              disabled={contentLoading}
              title="Recharger les données des archives"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-500 shadow-sm transition-all duration-200 hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={13} className={contentLoading ? 'animate-spin' : ''} />
              Actualiser
            </button>
            <span className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-500 shadow-sm">
              {selectedYear.name}
            </span>
          </span>
        </div>

        {/* Sous-onglets */}
        <div className="flex animate-fade-in flex-wrap gap-2">
          {TABS.map(t => {
            const active = tab === t.id;
            const count = tabCount(t.id);
            return (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setStudentSearch(''); setStaffSearch(''); }}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all duration-200
                  ${active
                    ? 'bg-gradient-to-br from-[#4f46e5] to-[#6d28d9] text-white shadow-md'
                    : 'border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-slate-300 hover:text-slate-700'}`}
              >
                <t.icon size={15} />
                {t.label}
                {count !== null && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        </div>
      </div>

      {/* Contenu défilant */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        <div className="mx-auto flex h-full max-w-7xl flex-col px-8 py-6">
        {/* Contenu + colonne de droite */}
        <div className="flex min-h-0 flex-1 gap-5">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {contentLoading ? (
          <Loader label={loadingLabel} />
        ) : (
          <div key={tab} className="animate-slide-in flex min-h-0 flex-1 flex-col space-y-5">
            {/* Bandeau d'info (onglets scolaires) */}
            {isSchoolTab && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[12px] font-semibold text-indigo-600">
                  {groupClasses.length} classe(s)
                </span>
                <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[12px] font-semibold text-emerald-600">
                  {groupStudents.length} élève(s)
                </span>
                {excludedClasses > 0 && (
                  <span
                    className="rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-[12px] font-semibold text-amber-600"
                    title="Classes dont le niveau n'est pas reconnu comme Collège (6ème–3ème) ou Lycée (Seconde–Terminale)."
                  >
                    {excludedClasses} hors groupe
                  </span>
                )}
              </div>
            )}

            {isSchoolTab && groupClasses.length === 0 ? (
              <EmptyState
                icon={GraduationCap}
                title={`Aucune classe « ${groupLabel} » détectée`}
                description="Vérifiez les niveaux de vos classes (6ème–3ème pour le Collège, Seconde–Terminale pour le Lycée) ou le nom des sections (Collège / Lycée)."
              />
            ) : isSchoolTab ? (
              /* ── Liste de tous les élèves du groupe (Collège / Lycée) ── */
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card animate-fade-in">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div>
                    <p className="text-[14px] font-bold text-slate-800">Élèves du {groupLabel}</p>
                    <p className="text-[12px] text-slate-400">{groupList.length} élève(s) · {groupClasses.length} classe(s)</p>
                  </div>
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Rechercher un élève..."
                      value={studentSearch}
                      onChange={e => setStudentSearch(e.target.value)}
                      className="w-56 rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-[12.5px] text-slate-700 outline-none transition-all duration-200 placeholder:text-slate-300 hover:border-slate-300 focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/15"
                    />
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                  <table className="w-full border-collapse text-left text-[13px]">
                    <thead className="sticky top-0 z-10 bg-slate-50">
                      <tr className="text-[11px] uppercase tracking-wider text-slate-400">
                        <th className="w-12 px-4 py-3 text-center font-semibold">N°</th>
                        <th className="px-4 py-3 font-semibold">Matricule</th>
                        <th className="px-4 py-3 font-semibold">Nom</th>
                        <th className="px-4 py-3 font-semibold">Prénoms</th>
                        <th className="w-16 px-4 py-3 text-center font-semibold">Sexe</th>
                        <th className="px-4 py-3 font-semibold">Classe</th>
                        <th className="px-4 py-3 font-semibold">Niveau</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupList.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-[13px] text-slate-400">
                            Aucun élève{studentSearch ? ` pour « ${studentSearch} »` : ` dans le ${groupLabel}`}.
                          </td>
                        </tr>
                      ) : groupList.map((s, i) => (
                        <tr key={s.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/70">
                          <td className="px-4 py-2.5 text-center text-slate-400">{i + 1}</td>
                          <td className="px-4 py-2.5 font-mono text-[12px] text-slate-500">{s.matricule || '—'}</td>
                          <td className="px-4 py-2.5 font-semibold text-slate-700">{(s.last_name ?? '').toLocaleUpperCase('fr-FR')}</td>
                          <td className="px-4 py-2.5 text-slate-600">{s.first_name ?? ''}</td>
                          <td className="px-4 py-2.5 text-center text-slate-500">{s.gender || '—'}</td>
                          <td className="px-4 py-2.5">
                            <span className="inline-block rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
                              {s.class_name || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-500">{s.class_level || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : tab === 'personnel' ? (
              /* ── Liste de tout le personnel ── */
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card animate-fade-in">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div>
                    <p className="text-[14px] font-bold text-slate-800">Personnel</p>
                    <p className="text-[12px] text-slate-400">{staffList.length} membre(s)</p>
                  </div>
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Rechercher un membre..."
                      value={staffSearch}
                      onChange={e => setStaffSearch(e.target.value)}
                      className="w-56 rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-[12.5px] text-slate-700 outline-none transition-all duration-200 placeholder:text-slate-300 hover:border-slate-300 focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/15"
                    />
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                  <table className="w-full border-collapse text-left text-[13px]">
                    <thead className="sticky top-0 z-10 bg-slate-50">
                      <tr className="text-[11px] uppercase tracking-wider text-slate-400">
                        <th className="w-12 px-4 py-3 text-center font-semibold">N°</th>
                        <th className="px-4 py-3 font-semibold">Matricule</th>
                        <th className="px-4 py-3 font-semibold">Nom</th>
                        <th className="px-4 py-3 font-semibold">Prénoms</th>
                        <th className="px-4 py-3 font-semibold">Type</th>
                        <th className="px-4 py-3 font-semibold">Fonction</th>
                        <th className="px-4 py-3 font-semibold">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffList.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-[13px] text-slate-400">
                            Aucun membre{staffSearch ? ` pour « ${staffSearch} »` : ' du personnel'}.
                          </td>
                        </tr>
                      ) : staffList.map((s, i) => (
                        <tr key={s.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/70">
                          <td className="px-4 py-2.5 text-center text-slate-400">{i + 1}</td>
                          <td className="px-4 py-2.5 font-mono text-[12px] text-slate-500">{s.matricule || '—'}</td>
                          <td className="px-4 py-2.5 font-semibold text-slate-700">{(s.nom ?? '').toLocaleUpperCase('fr-FR')}</td>
                          <td className="px-4 py-2.5 text-slate-600">{s.prenoms ?? ''}</td>
                          <td className="px-4 py-2.5 text-slate-600">{s.type_personnel || '—'}</td>
                          <td className="px-4 py-2.5 text-slate-600">{s.fonction || '—'}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                              s.statut_administratif === 'Actif' ? 'bg-emerald-50 text-emerald-600'
                              : s.statut_administratif === 'En conge' ? 'bg-amber-50 text-amber-600'
                              : 'bg-slate-100 text-slate-500'
                            }`}>
                              {s.statut_administratif || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
                        ) : tab === 'finances' ? (
              /* ── Tableau de bord financier complet (Courbes & Diagrammes réels) ── */
              financeLoading && !financeDashboard ? (
                <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
                  <Loader2 size={24} className="animate-spin text-[#4f46e5]" />
                  <span className="text-sm font-medium">Chargement des données financières…</span>
                </div>
              ) : !financeDashboard ? (
                <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
                  <BarChart2 size={44} strokeWidth={1.5} className="opacity-40" />
                  <p className="text-sm">Aucune donnée financière disponible pour cette année scolaire.</p>
                </div>
              ) : (() => {
                const currency = schoolInfo.currency || 'XOF';
                const fmt = (v: number) =>
                  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v / 100);

                return (
                  <div className="space-y-6 animate-fade-in pb-8">
                    {/* ── En-tête avec bouton de téléchargement ── */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                      <div>
                        <h2 className="text-base font-bold text-slate-800">Synthèse Financière Annuelle</h2>
                        <p className="text-[12px] text-slate-500 mt-0.5">
                          Situation globale des recouvrements, encaissements et reliquats pour l'année {selectedYear.name}
                        </p>
                      </div>
                      <button
                        onClick={handleFinanceReport}
                        disabled={busy === 'finance'}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#4f46e5] to-[#6d28d9] px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 disabled:opacity-50"
                      >
                        {busy === 'finance' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                        Télécharger le rapport financier (PDF)
                      </button>
                    </div>

                    {/* ── KPI Cards ── */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total attendu</span>
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                            <Wallet size={16} />
                          </span>
                        </div>
                        <p className="mt-2 text-2xl font-black text-slate-800 tracking-tight">
                          {fmt(financeDashboard.total_due)} <span className="text-xs font-normal text-slate-400">{currency}</span>
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {financeDashboard.student_count} élève(s) inscrit(s)
                        </p>
                      </div>

                      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/50 to-white p-5 shadow-card hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Total encaissé</span>
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                            <CheckCircle2 size={16} />
                          </span>
                        </div>
                        <p className="mt-2 text-2xl font-black text-emerald-700 tracking-tight">
                          {fmt(financeDashboard.total_paid)} <span className="text-xs font-normal text-emerald-500">{currency}</span>
                        </p>
                        <p className="mt-1 text-[11px] text-emerald-600 font-medium">
                          {financeDashboard.settled_count} élève(s) soldé(s)
                        </p>
                      </div>

                      <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50/50 to-white p-5 shadow-card hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-500">Reste à recouvrer</span>
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                            <AlertCircle size={16} />
                          </span>
                        </div>
                        <p className="mt-2 text-2xl font-black text-rose-600 tracking-tight">
                          {fmt(Math.max(0, financeDashboard.remaining_balance))} <span className="text-xs font-normal text-rose-400">{currency}</span>
                        </p>
                        <p className="mt-1 text-[11px] text-rose-500 font-medium">
                          {financeDashboard.debtors.length} débiteur(s)
                        </p>
                      </div>

                      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white p-5 shadow-card hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#4f46e5]">Taux recouvrement</span>
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-[#4f46e5]">
                            <TrendingUp size={16} />
                          </span>
                        </div>
                        <p className="mt-2 text-2xl font-black text-[#4f46e5] tracking-tight">
                          {financeDashboard.recovery_rate.toFixed(1)} %
                        </p>
                        <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-indigo-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#4f46e5] to-emerald-500 transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(0, financeDashboard.recovery_rate))}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* ── Courbes réelles SVG : Recouvrement par Classe ── */}
                    {financeDashboard.by_class.length > 0 && (() => {
                      const cls = financeDashboard.by_class;
                      const W = 840, H = 275, pL = 70, pR = 30, pT = 20, pB = 55;
                      const cW = W - pL - pR, cH = H - pT - pB;
                      const maxV = Math.max(...cls.map(c => Math.max(c.total_due, c.total_paid)), 1);

                      const xOf = (i: number) => pL + (cls.length > 1 ? (i * cW) / (cls.length - 1) : cW / 2);
                      const yOf = (v: number) => pT + cH - (v / maxV) * cH;

                      const fmtCompact = (v: number) =>
                        new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(v / 100);

                      // Helper pour abréger intelligemment les noms de classes afin d'éviter tout chevauchement
                      const abbreviateClass = (raw: string): string => {
                        if (!raw) return '';
                        let s = raw.trim();
                        s = s.replace(/sixi[eè]me/gi, '6e')
                             .replace(/cinqui[eè]me/gi, '5e')
                             .replace(/quatri[eè]me/gi, '4e')
                             .replace(/troisi[eè]me/gi, '3e')
                             .replace(/seconde/gi, '2nde')
                             .replace(/premi[eè]re/gi, '1ère')
                             .replace(/terminale/gi, 'Tle');

                        s = s.replace(/6\s*[eè]me/gi, '6e')
                             .replace(/5\s*[eè]me/gi, '5e')
                             .replace(/4\s*[eè]me/gi, '4e')
                             .replace(/3\s*[eè]me/gi, '3e')
                             .replace(/2\s*n?de/gi, '2nde')
                             .replace(/1\s*[eè]re/gi, '1ère')
                             .replace(/term\b/gi, 'Tle');

                        s = s.replace(/^classe\s*(de\s*)?/gi, '');
                        s = s.replace(/\s+/g, ' ').trim();
                        if (s.length > 7) {
                          s = s.slice(0, 6) + '…';
                        }
                        return s;
                      };

                      const shouldRotate = cls.length > 7;

                      // Path helper for smooth curves
                      const buildSmoothPath = (pts: { x: number; y: number }[]) => {
                        if (pts.length === 0) return '';
                        if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
                        let path = `M ${pts[0].x} ${pts[0].y}`;
                        for (let i = 0; i < pts.length - 1; i++) {
                          const cpX = (pts[i].x + pts[i + 1].x) / 2;
                          path += ` C ${cpX} ${pts[i].y}, ${cpX} ${pts[i + 1].y}, ${pts[i + 1].x} ${pts[i + 1].y}`;
                        }
                        return path;
                      };

                      const duePts = cls.map((c, i) => ({ x: xOf(i), y: yOf(c.total_due) }));
                      const paidPts = cls.map((c, i) => ({ x: xOf(i), y: yOf(c.total_paid) }));

                      const dueCurve = buildSmoothPath(duePts);
                      const paidCurve = buildSmoothPath(paidPts);

                      const dueArea = `${dueCurve} L ${duePts[duePts.length - 1].x} ${pT + cH} L ${duePts[0].x} ${pT + cH} Z`;
                      const paidArea = `${paidCurve} L ${paidPts[paidPts.length - 1].x} ${pT + cH} L ${paidPts[0].x} ${pT + cH} Z`;

                      return (
                        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                            <div>
                              <h3 className="text-[14px] font-bold text-slate-800">
                                Courbe de Recouvrement par Classe
                              </h3>
                              <p className="text-[11px] text-slate-400">
                                Comparatif direct entre le montant attendu et le montant effectivement encaissé
                              </p>
                            </div>
                            <div className="flex items-center gap-5">
                              <span className="flex items-center gap-2 text-[12px] font-semibold text-slate-600">
                                <span className="h-2 w-5 rounded-full bg-[#6366f1] inline-block shadow-sm" />
                                Attendu
                              </span>
                              <span className="flex items-center gap-2 text-[12px] font-semibold text-slate-600">
                                <span className="h-2 w-5 rounded-full bg-[#10b981] inline-block shadow-sm" />
                                Encaissé
                              </span>
                            </div>
                          </div>

                          <div className="w-full overflow-x-auto">
                            <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[650px]" style={{ height: 275 }}>
                              <defs>
                                <linearGradient id="areaDue" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.28" />
                                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0.01" />
                                </linearGradient>
                                <linearGradient id="areaPaid" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
                                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
                                </linearGradient>
                              </defs>

                              {/* Horizontals */}
                              {[0, 0.25, 0.5, 0.75, 1].map(r => (
                                <g key={r}>
                                  <line
                                    x1={pL}
                                    x2={W - pR}
                                    y1={pT + r * cH}
                                    y2={pT + r * cH}
                                    stroke="#f1f5f9"
                                    strokeWidth="1.2"
                                    strokeDasharray={r === 1 ? undefined : '3 3'}
                                  />
                                  <text
                                    x={pL - 10}
                                    y={pT + r * cH + 4}
                                    textAnchor="end"
                                    fontSize={10}
                                    fill="#94a3b8"
                                    fontWeight="500"
                                  >
                                    {fmtCompact(maxV * (1 - r))}
                                  </text>
                                </g>
                              ))}

                              {/* Areas */}
                              <path d={dueArea} fill="url(#areaDue)" />
                              <path d={paidArea} fill="url(#areaPaid)" />

                              {/* Lines */}
                              <path
                                d={dueCurve}
                                fill="none"
                                stroke="#6366f1"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                              />
                              <path
                                d={paidCurve}
                                fill="none"
                                stroke="#10b981"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                              />

                              {/* Points & Labels */}
                              {cls.map((c, i) => {
                                const x = xOf(i);
                                const yDue = yOf(c.total_due);
                                const yPaid = yOf(c.total_paid);
                                const shortName = abbreviateClass(c.class_name);
                                return (
                                  <g key={c.class_id ?? i} className="group cursor-pointer">
                                    <title>{`${c.class_name}\nAttendu : ${fmt(c.total_due)} ${currency}\nEncaissé : ${fmt(c.total_paid)} ${currency}\nReliquat : ${fmt(Math.max(0, c.remaining_balance))} ${currency}`}</title>
                                    <circle
                                      cx={x}
                                      cy={yDue}
                                      r="4.5"
                                      fill="#6366f1"
                                      stroke="#ffffff"
                                      strokeWidth="2"
                                      className="transition-transform duration-150 hover:scale-125"
                                    />
                                    <circle
                                      cx={x}
                                      cy={yPaid}
                                      r="4.5"
                                      fill="#10b981"
                                      stroke="#ffffff"
                                      strokeWidth="2"
                                      className="transition-transform duration-150 hover:scale-125"
                                    />
                                    <text
                                      x={x}
                                      y={shouldRotate ? H - 10 : H - 14}
                                      textAnchor={shouldRotate ? 'end' : 'middle'}
                                      transform={shouldRotate ? `rotate(-35, ${x}, ${H - 10})` : undefined}
                                      fontSize={9.5}
                                      fill="#64748b"
                                      fontWeight="600"
                                    >
                                      {shortName}
                                    </text>
                                  </g>
                                );
                              })}
                            </svg>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Deux colonnes : Donut des statuts + Diagramme des modes de paiement ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      {/* Donut Statuts Élèves */}
                      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card flex flex-col justify-between">
                        <div>
                          <h3 className="text-[14px] font-bold text-slate-800">
                            Statut de Règlement des Élèves
                          </h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Répartition des {financeDashboard.student_count} élève(s) selon l'état de leur compte
                          </p>
                        </div>

                        {(() => {
                          const slices = [
                            { label: 'Soldés', value: financeDashboard.settled_count, color: '#10b981', bg: 'bg-emerald-500' },
                            { label: 'Partiel', value: financeDashboard.partial_count, color: '#f59e0b', bg: 'bg-amber-500' },
                            { label: 'Impayés', value: financeDashboard.unpaid_count, color: '#ef4444', bg: 'bg-rose-500' },
                          ].filter(s => s.value > 0);

                          const total = slices.reduce((acc, s) => acc + s.value, 0) || 1;
                          const cx = 95, cy = 95, r = 75, ri = 48;
                          let angle = -Math.PI / 2;

                          const paths = slices.map(s => {
                            const sweep = (s.value / total) * 2 * Math.PI;
                            const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
                            const x2 = cx + r * Math.cos(angle + sweep), y2 = cy + r * Math.sin(angle + sweep);
                            const xi1 = cx + ri * Math.cos(angle), yi1 = cy + ri * Math.sin(angle);
                            const xi2 = cx + ri * Math.cos(angle + sweep), yi2 = cy + ri * Math.sin(angle + sweep);
                            const large = sweep > Math.PI ? 1 : 0;
                            const d = `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${xi2.toFixed(2)} ${yi2.toFixed(2)} A ${ri} ${ri} 0 ${large} 0 ${xi1.toFixed(2)} ${yi1.toFixed(2)} Z`;
                            angle += sweep;
                            return { ...s, d };
                          });

                          return (
                            <div className="flex flex-col sm:flex-row items-center justify-around gap-6 my-4">
                              <svg viewBox="0 0 190 190" className="w-44 h-44 shrink-0 drop-shadow-sm">
                                {paths.map((p, idx) => (
                                  <path
                                    key={idx}
                                    d={p.d}
                                    fill={p.color}
                                    stroke="#ffffff"
                                    strokeWidth="2.5"
                                  />
                                ))}
                                <text x={cx} y={cy - 6} textAnchor="middle" fontSize={16} fontWeight="800" fill="#1e293b">
                                  {financeDashboard.recovery_rate.toFixed(0)}%
                                </text>
                                <text x={cx} y={cy + 12} textAnchor="middle" fontSize={10} fill="#94a3b8" fontWeight="500">
                                  recouvré
                                </text>
                              </svg>

                              <div className="space-y-3 w-full max-w-xs">
                                {slices.map(s => {
                                  const pct = ((s.value / total) * 100).toFixed(1);
                                  return (
                                    <div key={s.label} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                      <div className="flex items-center gap-2.5">
                                        <span className={`w-3 h-3 rounded-full shrink-0 ${s.bg}`} />
                                        <span className="text-[12px] font-semibold text-slate-700">{s.label}</span>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-[13px] font-bold text-slate-800">{s.value}</span>
                                        <span className="text-[11px] text-slate-400 ml-1.5">({pct}%)</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                        <div className="border-t border-slate-100 pt-3 text-[11px] text-slate-400 text-center">
                          Les comptes soldés ont réglé la totalité de leurs frais de scolarité
                        </div>
                      </div>

                      {/* Modes de paiement */}
                      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card flex flex-col justify-between">
                        <div>
                          <h3 className="text-[14px] font-bold text-slate-800">
                            Répartition des Modes d'Encaissement
                          </h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Volume total des transactions par canal de règlement
                          </p>
                        </div>

                        <div className="space-y-3.5 my-4">
                          {financeDashboard.by_method.length === 0 ? (
                            <p className="text-xs text-slate-400 py-6 text-center">Aucun encaissement enregistré.</p>
                          ) : (() => {
                            const maxM = Math.max(...financeDashboard.by_method.map(m => m.amount), 1);
                            const totalM = financeDashboard.by_method.reduce((acc, m) => acc + m.amount, 0) || 1;

                            return financeDashboard.by_method.map(m => {
                              const label = PAYMENT_METHODS.find(p => p.id === m.method)?.label ?? m.method;
                              const pctOfTotal = ((m.amount / totalM) * 100).toFixed(1);
                              const barPct = (m.amount / maxM) * 100;

                              return (
                                <div key={m.method} className="space-y-1">
                                  <div className="flex items-center justify-between text-[12px]">
                                    <span className="font-semibold text-slate-700">{label}</span>
                                    <span className="font-bold text-slate-800">
                                      {fmt(m.amount)} {currency}{' '}
                                      <span className="font-normal text-slate-400 text-[11px]">({pctOfTotal}%)</span>
                                    </span>
                                  </div>
                                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                                      style={{ width: `${Math.max(4, barPct)}%` }}
                                    />
                                  </div>
                                  <p className="text-[10px] text-slate-400 text-right">
                                    {m.payment_count} transaction(s)
                                  </p>
                                </div>
                              );
                            });
                          })()}
                        </div>

                        <div className="border-t border-slate-100 pt-3 text-[11px] text-slate-400 text-center">
                          Total des recettes encaissées : <strong className="text-slate-700">{fmt(financeDashboard.total_paid)} {currency}</strong>
                        </div>
                      </div>
                    </div>

                    {/* ── Tableau synthétique par classe ── */}
                    {financeDashboard.by_class.length > 0 && (
                      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
                        <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
                          <div>
                            <h3 className="text-[14px] font-bold text-slate-800">
                              Détail du Recouvrement par Classe
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Situation financière détaillée et taux de recouvrement par division
                            </p>
                          </div>
                          <span className="text-xs font-semibold text-slate-400">
                            {financeDashboard.by_class.length} classe(s)
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-[12px]">
                            <thead className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                              <tr>
                                <th className="px-5 py-3">Classe</th>
                                <th className="px-4 py-3 text-center">Effectif</th>
                                <th className="px-4 py-3 text-right">Total Attendu</th>
                                <th className="px-4 py-3 text-right">Encaissé</th>
                                <th className="px-4 py-3 text-right">Reliquat</th>
                                <th className="px-5 py-3 text-right">Taux</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                              {financeDashboard.by_class.map(c => {
                                const rate = c.total_due > 0 ? (c.total_paid / c.total_due) * 100 : 100;
                                return (
                                  <tr key={c.class_id ?? c.class_name} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-5 py-3 font-semibold text-slate-900">{c.class_name}</td>
                                    <td className="px-4 py-3 text-center text-slate-500">{c.student_count}</td>
                                    <td className="px-4 py-3 text-right font-medium">{fmt(c.total_due)} {currency}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">{fmt(c.total_paid)} {currency}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-rose-500">
                                      {fmt(Math.max(0, c.remaining_balance))} {currency}
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                      <span
                                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${
                                          rate >= 80
                                            ? 'bg-emerald-50 text-emerald-700'
                                            : rate >= 50
                                            ? 'bg-amber-50 text-amber-700'
                                            : 'bg-rose-50 text-rose-700'
                                        }`}
                                      >
                                        {rate.toFixed(1)} %
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              </div>
            )}
          </div>
        )}
        </div>{/* / colonne principale */}

        {/* ── Colonne de droite : boutons de documents (masquée en mode finances) ── */}
        {tab !== 'finances' && (
        <aside className="w-72 xl:w-80 flex-shrink-0 self-start sticky top-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card animate-fade-in">
            <div className="border-b border-slate-100 px-4 py-3.5">
              <p className="text-[13px] font-bold text-slate-800">Documents</p>
              <p className="text-[11px] text-slate-400">Actions rapides</p>
            </div>
            <div className="space-y-1 p-3">
              {(tab === 'personnel'
                ? RIGHT_ACTIONS_PERSONNEL
                : RIGHT_ACTIONS.filter(a => !a.schoolOnly || isSchoolTab)
              ).map(a => (
                <button
                  key={a.label}
                  disabled={contentLoading}
                  onClick={() => {
                    if (tab === 'personnel' && a.label === "Fiche d'identité") {
                      if (staff.length === 0) showToast('error', 'Aucun membre du personnel à imprimer.');
                      else setIdentityOpen(true);
                      return;
                    }
                    if (tab === 'personnel' && a.label === 'Liste du personnel') {
                      if (staff.length === 0) showToast('error', 'Aucun membre du personnel à afficher.');
                      else setStaffListModalOpen(true);
                      return;
                    }
                    if (a.label === "Fiche d'identité") {
                      // Onglets Collège / Lycée : fiche d'identité des élèves.
                      if (groupStudents.length === 0) {
                        showToast('error', 'Aucun élève à imprimer dans cet onglet.');
                        return;
                      }
                      setStudentIdentityOpen(true);
                      return;
                    }
                    if (a.label === 'Bulletin de notes' && isSchoolTab) {
                      if (groupStudents.length === 0) {
                        showToast('error', 'Aucun élève à imprimer dans cet onglet.');
                        return;
                      }
                      setBulletinOpen(true);
                      return;
                    }
                    if (a.label === 'Emploi du temps') {
                      if (groupClasses.length === 0) {
                        showToast('error', 'Aucune classe disponible dans cet onglet.');
                        return;
                      }
                      setTimetableOpen(true);
                      return;
                    }
                    if (a.label === 'Liste de notes') {
                      if (nominalListClasses.length === 0) {
                        showToast('error', 'Aucune classe à imprimer dans cet onglet.');
                        return;
                      }
                      setNotesListOpen(true);
                      return;
                    }
                    if (a.label === 'Liste nominative de la classe') {
                      if (nominalListClasses.length === 0) {
                        showToast('error', 'Aucune classe à imprimer dans cet onglet.');
                        return;
                      }
                      setNominalListOpen(true);
                      return;
                    }
                    if (a.label === 'Liste de présence') {
                      if (nominalListClasses.length === 0) {
                        showToast('error', 'Aucune classe à imprimer dans cet onglet.');
                        return;
                      }
                      setPresenceListOpen(true);
                      return;
                    }
                    showToast('info', `${a.label} — ${docScopeLabel} : fonctionnalité à venir.`);
                  }}
                  className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-all duration-200 hover:border-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-transparent disabled:hover:bg-transparent"
                >
                  <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${a.tint}`}>
                    <a.icon size={15} />
                  </span>
                  <span className="flex-1 text-[12.5px] font-semibold text-slate-600 transition-colors group-hover:text-slate-800">
                    {a.label}
                  </span>
                  <ChevronRight size={13} className="flex-shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-slate-400" />
                </button>
              ))}
            </div>
          </div>
        </aside>
        )}
        </div>{/* / rangée contenu + colonne */}
        </div>
      </div>

      {/* ═══ POPUP : BULLETIN DE NOTES ═══ */}
      {bulletinOpen && (
        <BulletinModal
          students={groupStudents}
          classes={groupClasses}
          school={schoolInfo}
          schoolId={schoolId}
          yearId={selectedYear.id}
          yearName={selectedYear.name}
          groupLabel={groupLabel}
          onClose={() => setBulletinOpen(false)}
          onError={msg => showToast('error', msg)}
          onSuccess={msg => showToast('success', msg)}
        />
      )}

      {/* ═══ POPUP : FICHE D'IDENTITÉ DE L'ÉLÈVE ═══ */}
      {studentIdentityOpen && (
        <StudentIdentityModal
          students={groupStudents}
          school={schoolInfo}
          yearName={selectedYear.name}
          groupLabel={groupLabel}
          onClose={() => setStudentIdentityOpen(false)}
          onError={msg => showToast('error', msg)}
          onSuccess={msg => showToast('success', msg)}
        />
      )}

      {/* ═══ POPUP : FICHE D'IDENTITÉ DU PERSONNEL ═══ */}
      {identityOpen && (
        <StaffIdentityModal
          staffList={staff}
          school={schoolInfo}
          yearName={selectedYear.name}
          onClose={() => setIdentityOpen(false)}
          onError={msg => showToast('error', msg)}
        />
      )}

      {/* ═══ POPUP : LISTE DU PERSONNEL ═══ */}
      {staffListModalOpen && (
        <StaffListModal
          staffList={staffListForModal}
          schoolName={schoolInfo.name || 'Établissement'}
          yearName={selectedYear.name}
          onClose={() => setStaffListModalOpen(false)}
          onError={msg => showToast('error', msg)}
          onSuccess={msg => showToast('success', msg)}
        />
      )}

      {/* ═══ POPUP : LISTE NOMINATIVE DE LA CLASSE ═══ */}
      {nominalListOpen && (
        <NominalListModal
          schoolId={schoolId}
          yearId={selectedYear.id}
          classes={nominalListClasses}
          groupLabel={groupLabel}
          yearName={selectedYear.name}
          schoolName={schoolInfo.name || ''}
          documentType="nominative"
          onClose={() => setNominalListOpen(false)}
          onError={msg => showToast('error', msg)}
          onSuccess={msg => showToast('success', msg)}
        />
      )}

      {/* ═══ POPUP : LISTE DE NOTES ═══ */}
      {notesListOpen && (
        <NominalListModal
          schoolId={schoolId}
          yearId={selectedYear.id}
          classes={nominalListClasses}
          groupLabel={groupLabel}
          yearName={selectedYear.name}
          schoolName={schoolInfo.name || ''}
          documentType="notes"
          onClose={() => setNotesListOpen(false)}
          onError={msg => showToast('error', msg)}
          onSuccess={msg => showToast('success', msg)}
        />
      )}

      {/* ═══ POPUP : LISTE DE PRÉSENCE ═══ */}
      {presenceListOpen && (
        <PresenceListModal
          classes={nominalListClasses}
          groupLabel={groupLabel}
          yearName={selectedYear.name}
          schoolName={schoolInfo.name || ''}
          onClose={() => setPresenceListOpen(false)}
          onError={msg => showToast('error', msg)}
          onSuccess={msg => showToast('success', msg)}
        />
      )}

      {/* ═══ POPUP : EMPLOI DU TEMPS ═══ */}
      {timetableOpen && (
        <TimetableModal
          schoolId={schoolId}
          academicYearId={selectedYear.id}
          yearName={selectedYear.name}
          schoolName={schoolInfo.name || 'Établissement'}
          classes={groupClasses.map(c => {
            const classStudents = students.filter(s => s.class_id === c.id);
            const boyCount = classStudents.filter(s => genderCode(s.gender) === 'M').length;
            const girlCount = classStudents.filter(s => genderCode(s.gender) === 'F').length;
            return {
              id: c.id,
              name: c.name,
              homeroom_teacher_name: c.homeroom_teacher_name,
              boyCount,
              girlCount,
            };
          })}
          onClose={() => setTimetableOpen(false)}
        />
      )}

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}





