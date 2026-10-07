import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from '../contexts/AuthContext';
import { useYear } from '../contexts/YearContext';
import {
  Archive, BookOpen, GraduationCap, Coins, UserCog, FileText, Download,
  CalendarDays, Users, Loader2, CheckCircle, AlertCircle, X, Search, ClipboardList, ClipboardCheck,
  User, CreditCard, ChevronRight, Info,
} from 'lucide-react';
import { EmptyState, Loader } from '../components/ui';
import StaffIdentityModal from '../components/StaffIdentityModal';
import NominalListModal from '../components/NominalListModal';
import PresenceListModal from '../components/PresenceListModal';
import TimetableModal from '../components/TimetableModal';
import type { NominalListClassInput } from '../lib/nominalListTemplate';
import { saveFinanceReportPdf, type FinanceReportData } from '../lib/financeReportPdf';
import type { ReceiptSchoolInfo } from '../lib/receiptPdf';

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
// Carte de document
// ─────────────────────────────────────────────────────
function DocCard({
  icon: Icon, tint, title, description, children, actionLabel, onAction, busy, disabled,
}: {
  icon: React.ComponentType<{ size?: number | string }>;
  tint: string;
  title: string;
  description: string;
  children?: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raise">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${tint}`}>
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-slate-800">{title}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-slate-400">{description}</p>
        </div>
      </div>
      {children && <div className="mt-4 space-y-2.5">{children}</div>}
      <div className="mt-auto pt-4">
        <button
          onClick={onAction}
          disabled={busy || disabled}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#4f46e5] to-[#6d28d9] px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {busy ? 'Génération…' : actionLabel}
        </button>
      </div>
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
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<ReceiptSchoolInfo>(EMPTY_SCHOOL_INFO);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [identityOpen, setIdentityOpen] = useState(false);
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

  // ── Chargement initial ──
  useEffect(() => {
    if (!schoolId || !selectedYear) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [secs, lvls, cls, studs, stf, settings] = await Promise.all([
          invoke<SectionRow[]>('get_sections', { schoolId }),
          invoke<LevelRow[]>('get_levels', { schoolId, sectionId: null }),
          invoke<ClassRow[]>('get_classes', { schoolId, academicYearId: selectedYear.id }),
          invoke<StudentRow[]>('get_students', { schoolId, academicYearId: selectedYear.id, classId: null }),
          invoke<StaffRecord[]>('get_staff', { schoolId }),
          invoke<Partial<ReceiptSchoolInfo>>('get_school_settings').catch(() => ({} as Partial<ReceiptSchoolInfo>)),
        ]);
        if (cancelled) return;
        setSections(secs); setLevels(lvls); setClasses(cls); setStudents(studs); setStaff(stf);
        setSchoolInfo({ ...EMPTY_SCHOOL_INFO, ...settings });
      } catch (e) {
        if (!cancelled) showToast('error', `Impossible de charger les archives : ${String(e)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [schoolId, selectedYear?.id, showToast]);

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
    if (id === 'personnel') return staff.length;
    if (id === 'finances') return null;
    const g: Group = id === 'lycee' ? 'lycee' : 'college';
    return classes.filter(c => belongsTo(c, g)).length;
  };

  // Liste filtrée & triée des élèves du groupe actif — Collège ou Lycée (classe, puis nom, puis prénom)
  const searchQ = studentSearch.trim().toLowerCase();
  const groupList = groupStudents
    .filter(s => !searchQ ||
      `${s.last_name ?? ''} ${s.first_name ?? ''} ${s.matricule ?? ''} ${s.class_name ?? ''}`.toLowerCase().includes(searchQ))
    .sort((a, b) =>
      (a.class_name ?? '').localeCompare(b.class_name ?? '') ||
      (a.last_name ?? '').localeCompare(b.last_name ?? '') ||
      (a.first_name ?? '').localeCompare(b.first_name ?? ''));

  // Liste filtrée & triée de tout le personnel (nom, puis prénom)
  const staffQ = staffSearch.trim().toLowerCase();
  const staffList = [...staff]
    .filter(s => !staffQ ||
      `${s.nom ?? ''} ${s.prenoms ?? ''} ${s.matricule ?? ''} ${s.fonction ?? ''}`.toLowerCase().includes(staffQ))
    .sort((a, b) =>
      (a.nom ?? '').localeCompare(b.nom ?? '') ||
      (a.prenoms ?? '').localeCompare(b.prenoms ?? ''));

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
    <div className="custom-scrollbar h-full w-full overflow-y-auto bg-gradient-to-b from-slate-50 to-[#f8f9fc]">
      <div className="mx-auto max-w-7xl space-y-6 px-8 py-7">
        {/* En-tête */}
        <div className="flex animate-fade-in items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] text-white shadow-lg">
              <Archive size={22} />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-800">Archives</h1>
              <p className="text-[13px] text-slate-400">
                Bulletins, listes, emplois du temps, rapports… tous les documents téléchargeables de l'établissement.
              </p>
            </div>
          </div>
          <span className="flex-shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-500 shadow-sm">
            {selectedYear.name}
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

        {/* Contenu + colonne de droite */}
        <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1">
        {loading ? (
          <Loader label="Chargement des archives…" />
        ) : (
          <div key={tab} className="animate-slide-in space-y-5">
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
              <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card animate-fade-in">
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
                <div className="max-h-[65vh] overflow-y-auto custom-scrollbar">
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
              <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card animate-fade-in">
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
                <div className="max-h-[65vh] overflow-y-auto custom-scrollbar">
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
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {tab === 'finances' && (
                  <DocCard
                    icon={Coins}
                    tint="bg-emerald-50 text-emerald-600"
                    title="Rapport financier annuel"
                    description="Recouvrement global, synthèse par classe, modes de paiement, débiteurs et grilles tarifaires."
                    actionLabel="Télécharger le rapport"
                    busy={busy === 'finance'}
                    onAction={handleFinanceReport}
                  />
                )}

              </div>
            )}

            {tab === 'finances' && (
              <p className="flex items-center gap-2 text-[12px] text-slate-400">
                <FileText size={13} className="flex-shrink-0" />
                Les reçus de paiement individuels restent téléchargeables depuis l'onglet « Finances &amp; Paiements ».
              </p>
            )}
          </div>
        )}
        </div>{/* / colonne principale */}

        {/* ── Colonne de droite : boutons de documents ── */}
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
                  onClick={() => {
                    if (tab === 'personnel' && a.label === "Fiche d'identité") {
                      if (staff.length === 0) showToast('error', 'Aucun membre du personnel à imprimer.');
                      else setIdentityOpen(true);
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
                  className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-all duration-200 hover:border-slate-200 hover:bg-slate-50"
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
        </div>{/* / rangée contenu + colonne */}

      </div>

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

      {/* ═══ POPUP : LISTE NOMINATIVE DE LA CLASSE ═══ */}
      {nominalListOpen && (
        <NominalListModal
          schoolId={schoolId}
          yearId={selectedYear.id}
          classes={nominalListClasses}
          groupLabel={groupLabel}
          yearName={selectedYear.name}
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
          classes={groupClasses.map(c => ({ id: c.id, name: c.name }))}
          onClose={() => setTimetableOpen(false)}
        />
      )}

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}





