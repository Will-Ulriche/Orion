import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from '../contexts/AuthContext';
import { useYear } from '../contexts/YearContext';
import { saveReceiptPdf, type ReceiptSchoolInfo } from '../lib/receiptPdf';
import { saveFinanceReportPdf } from '../lib/financeReportPdf';
import {
  AlertCircle, Banknote, CalendarClock, Check, CheckCircle2, ChevronDown, Coins,
  FileDown, List, Loader2, Lock, Pencil, Plus, Receipt, RefreshCw, Search, Trash2,
  TrendingUp, UserX, Users, Wallet, X,
} from 'lucide-react';

interface FeeStructure {
  id: string;
  name: string;
  amount: number;
  fee_type: string;
  applies_to: string;
  class_id: string | null;
  level: string | null;
  due_date: string | null;
  is_mandatory: boolean;
  class_name: string | null;
}

interface Payment {
  id: string;
  enrollment_id: string;
  fee_structure_id: string | null;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference: string | null;
  receipt_number: string;
  notes: string | null;
  status: string;
  cancel_reason: string | null;
  fee_name: string | null;
}

interface StudentFinancialSummary {
  student_id: string;
  enrollment_id: string;
  first_name: string;
  last_name: string;
  class_name: string;
  total_due: number;
  total_paid: number;
  remaining_balance: number;
  status: string;
}

interface ClassItem {
  id: string;
  name: string;
  level: string | null;
  student_count: number;
}

interface StudentRow {
  id: string;
  student_id: string;
  class_id: string | null;
  status: string;
  first_name: string | null;
  last_name: string | null;
  matricule: string | null;
  class_name: string | null;
  class_level: string | null;
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
  by_class: { class_id: string | null; class_name: string; student_count: number; total_due: number; total_paid: number; remaining_balance: number }[];
  by_method: { method: string; amount: number; payment_count: number }[];
  debtors: {
    student_id: string; enrollment_id: string; first_name: string; last_name: string;
    class_name: string; total_due: number; total_paid: number; remaining_balance: number; status: string;
  }[];
}

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

const inputClass =
  'w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] placeholder:text-slate-400 text-slate-700';
const labelClass = 'block text-[12px] font-semibold text-slate-700 mb-1.5';
const primaryBtn =
  'flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca] text-white text-sm font-semibold transition-all shadow-[0_4px_14px_0_rgb(79,70,229,0.35)] disabled:opacity-50 disabled:shadow-none';
const ghostBtn =
  'px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors';

function labelOf(list: { id: string; label: string }[], id: string): string {
  return list.find(x => x.id === id)?.label ?? id;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

export default function Finances() {
  const { schoolId, user } = useAuth();
  const { selectedYear } = useYear();

  const [activeTab, setActiveTab] = useState<'grille' | 'paiements' | 'dashboard'>('grille');
  const [currency, setCurrency] = useState('XOF');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isYearLocked = selectedYear?.status === 'CLOSED' || selectedYear?.status === 'ARCHIVED';

  // ── Données ─────────────────────────────────────────────
  const [fees, setFees] = useState<FeeStructure[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [dashboard, setDashboard] = useState<FinancialDashboard | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [schoolInfo, setSchoolInfo] = useState<ReceiptSchoolInfo | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [exportingReport, setExportingReport] = useState(false);

  const formatMoney = useCallback(
    (cents: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(cents / 100)} ${currency}`,
    [currency]
  );
  const toCents = (value: string) => Math.round((parseFloat(value.replace(/\s/g, '').replace(',', '.')) || 0) * 100);

  const loadFees = useCallback(async () => {
    if (!selectedYear) return;
    const data: FeeStructure[] = await invoke('get_fee_structures', {
      schoolId, academicYearId: selectedYear.id,
    });
    setFees(data);
  }, [schoolId, selectedYear]);

  const loadDashboard = useCallback(async () => {
    if (!selectedYear) return;
    setLoadingDashboard(true);
    try {
      const data: FinancialDashboard = await invoke('get_financial_dashboard', {
        schoolId, academicYearId: selectedYear.id,
      });
      setDashboard(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingDashboard(false);
    }
  }, [schoolId, selectedYear]);

  const loadAll = useCallback(async () => {
    if (!selectedYear) return;
    setLoading(true);
    setError(null);
    try {
      const [c, s] = await Promise.all([
        invoke('get_classes', { schoolId, academicYearId: selectedYear.id }) as Promise<ClassItem[]>,
        invoke('get_students', { schoolId, academicYearId: selectedYear.id, classId: null }) as Promise<StudentRow[]>,
      ]);
      setClasses(c);
      setStudents(s);
      await loadFees();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [schoolId, selectedYear, loadFees]);

  useEffect(() => {
    invoke<Partial<ReceiptSchoolInfo>>('get_school_settings')
      .then(s => {
        if (s?.currency) setCurrency(s.currency);
        setSchoolInfo({
          name: s?.name ?? '',
          short_name: s?.short_name ?? '',
          ministry_name: s?.ministry_name ?? '',
          address: s?.address ?? '',
          city: s?.city ?? '',
          country: s?.country ?? '',
          phone: s?.phone ?? '',
          email: s?.email ?? '',
          website: s?.website ?? '',
          registration_number: s?.registration_number ?? '',
          logo_url: s?.logo_url ?? '',
          stamp_url: s?.stamp_url ?? '',
          signature_url: s?.signature_url ?? '',
          head_title: s?.head_title ?? 'Le Directeur',
          head_name: s?.head_name ?? '',
          slogan: s?.slogan ?? '',
          currency: s?.currency ?? 'XOF',
        });
      })
      .catch(() => { /* devise par défaut */ });
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (activeTab === 'dashboard') loadDashboard();
  }, [activeTab, loadDashboard]);

  const notify = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  // ══════════════ ONGLET 1 : GRILLE TARIFAIRE ══════════════
  const [feeSearch, setFeeSearch] = useState('');
  const [showFeeForm, setShowFeeForm] = useState(false);
  const [editingFee, setEditingFee] = useState<FeeStructure | null>(null);
  const [feeForm, setFeeForm] = useState({
    name: '', amount: '', feeType: 'SCOLARITE', appliesTo: 'ALL', classId: '', dueDate: '', isMandatory: true,
  });

  const openFeeForm = (fee?: FeeStructure) => {
    setError(null);
    setEditingFee(fee ?? null);
    setFeeForm(fee
      ? {
          name: fee.name,
          amount: String(fee.amount / 100),
          feeType: fee.fee_type,
          appliesTo: fee.applies_to,
          classId: fee.class_id ?? '',
          dueDate: fee.due_date ?? '',
          isMandatory: fee.is_mandatory,
        }
      : { name: '', amount: '', feeType: 'SCOLARITE', appliesTo: 'ALL', classId: '', dueDate: '', isMandatory: true });
    setShowFeeForm(true);
  };

  const closeFeeForm = () => {
    setShowFeeForm(false);
    setEditingFee(null);
    setError(null);
  };

  const handleFeeSubmit = async () => {
    setError(null);
    const name = feeForm.name.trim();
    if (!name) { setError('Le libellé du frais est requis.'); return; }
    const amount = toCents(feeForm.amount);
    if (amount <= 0) { setError('Le montant doit être supérieur à 0.'); return; }
    if (feeForm.appliesTo === 'CLASS' && !feeForm.classId) { setError('Sélectionnez la classe concernée par ce frais.'); return; }
    if (!selectedYear) { setError('Aucune année scolaire sélectionnée.'); return; }

    setSaving(true);
    try {
      if (editingFee) {
        await invoke('update_fee_structure', {
          id: editingFee.id,
          schoolId,
          name,
          amount,
          dueDate: feeForm.dueDate || null,
          isMandatory: feeForm.isMandatory,
        });
        notify(`Frais « ${name} » modifié.`);
      } else {
        await invoke('create_fee_structure', {
          schoolId,
          academicYearId: selectedYear.id,
          name,
          amount,
          feeType: feeForm.feeType,
          appliesTo: feeForm.appliesTo,
          classId: feeForm.appliesTo === 'CLASS' ? feeForm.classId : null,
          level: null,
          dueDate: feeForm.dueDate || null,
          isMandatory: feeForm.isMandatory,
        });
        notify(`Frais « ${name} » ajouté à la grille.`);
      }
      closeFeeForm();
      await loadFees();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFee = async (fee: FeeStructure) => {
    if (!window.confirm(`Supprimer le frais « ${fee.name} » ?`)) return;
    setError(null);
    try {
      await invoke('delete_fee_structure', { id: fee.id, schoolId });
      notify(`Frais « ${fee.name} » supprimé.`);
      await loadFees();
    } catch (e) {
      setError(String(e));
    }
  };

  const filteredFees = useMemo(() => {
    const q = feeSearch.trim().toLowerCase();
    if (!q) return fees;
    return fees.filter(f =>
      f.name.toLowerCase().includes(q) ||
      labelOf(FEE_TYPES, f.fee_type).toLowerCase().includes(q) ||
      (f.class_name ?? '').toLowerCase().includes(q)
    );
  }, [fees, feeSearch]);

  const globalFeesTotal = useMemo(
    () => fees.filter(f => f.applies_to === 'ALL').reduce((sum, f) => sum + f.amount, 0),
    [fees]
  );

  // ══════════════ ONGLET 2 : PAIEMENTS ÉLÈVE ══════════════
  const [studentSearch, setStudentSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);
  const [summary, setSummary] = useState<StudentFinancialSummary | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingStudent, setLoadingStudent] = useState(false);

  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState({ feeId: '', amount: '', method: 'ESPECES', reference: '', notes: '' });
  const [cancelling, setCancelling] = useState<Payment | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const applicableFees = useMemo(() => {
    if (!selectedStudent) return [];
    return fees.filter(f =>
      f.applies_to === 'ALL' ||
      (f.applies_to === 'CLASS' && f.class_id === selectedStudent.class_id) ||
      (f.applies_to === 'LEVEL' && f.level === selectedStudent.class_level)
    );
  }, [fees, selectedStudent]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return students
      .filter(s => s.status === 'ACTIVE')
      .filter(s => !classFilter || s.class_id === classFilter)
      .filter(s => !q ||
        `${s.first_name ?? ''} ${s.last_name ?? ''}`.toLowerCase().includes(q) ||
        (s.matricule ?? '').toLowerCase().includes(q))
      .slice(0, 200);
  }, [students, studentSearch, classFilter]);

  const loadStudentData = useCallback(async (student: StudentRow) => {
    if (!selectedYear) return;
    setLoadingStudent(true);
    setError(null);
    try {
      const [s, p] = await Promise.all([
        invoke('get_student_financial_summary', {
          schoolId, academicYearId: selectedYear.id, studentId: student.student_id,
        }) as Promise<StudentFinancialSummary>,
        invoke('get_student_payments', {
          schoolId, academicYearId: selectedYear.id, studentId: student.student_id,
        }) as Promise<Payment[]>,
      ]);
      setSummary(s);
      setPayments(p);
    } catch (e) {
      setSummary(null);
      setPayments([]);
      setError(String(e));
    } finally {
      setLoadingStudent(false);
    }
  }, [schoolId, selectedYear]);

  const selectStudent = (student: StudentRow) => {
    setSelectedStudent(student);
    loadStudentData(student);
  };

  const handlePrintReceipt = (p: Payment) => {
    setError(null);
    setPrintingId(p.id);
    try {
      const fee = p.fee_structure_id ? fees.find(f => f.id === p.fee_structure_id) : null;
      saveReceiptPdf({
        school: schoolInfo ?? {
          name: '', short_name: '', ministry_name: '', address: '', city: '',
          country: '', phone: '', email: '', website: '', registration_number: '',
          logo_url: '', stamp_url: '', signature_url: '', head_title: 'Directeur',
          head_name: '', slogan: '', currency,
        },
        student: {
          last_name: summary?.last_name ?? selectedStudent?.last_name ?? '',
          first_name: summary?.first_name ?? selectedStudent?.first_name ?? '',
          class_name: summary?.class_name ?? selectedStudent?.class_name ?? '',
          matricule: selectedStudent?.matricule ?? null,
        },
        payment: {
          receipt_number: p.receipt_number,
          amount: p.amount,
          payment_date: p.payment_date,
          payment_method: labelOf(PAYMENT_METHODS, p.payment_method),
          reference: p.reference,
          notes: p.notes,
          status: p.status,
          cancel_reason: p.cancel_reason,
          fee_name: p.fee_name,
          fee_type_label: fee ? labelOf(FEE_TYPES, fee.fee_type) : '—',
          fee_due_date: fee?.due_date ?? null,
          fee_expected: fee?.amount ?? null,
        },
        totals: {
          total_due: summary?.total_due ?? 0,
          total_paid: summary?.total_paid ?? 0,
          remaining_balance: summary?.remaining_balance ?? 0,
          status: summary?.status ?? 'IMPAYE',
        },
        academicYearName: selectedYear?.name ?? '—',
        printedBy: user?.email ?? 'Orion ERP',
      });
    } catch (e) {
      setError(`Impossible de générer le reçu : ${String(e)}`);
    } finally {
      setPrintingId(null);
    }
  };

  const handleExportReport = async () => {
    setError(null);
    setExportingReport(true);
    try {
      const data = dashboard ?? (await invoke<FinancialDashboard>('get_financial_dashboard', {
        schoolId, academicYearId: selectedYear?.id,
      }));
      saveFinanceReportPdf({
        school: schoolInfo ?? {
          name: '', short_name: '', ministry_name: '', address: '', city: '',
          country: '', phone: '', email: '', website: '', registration_number: '',
          logo_url: '', stamp_url: '', signature_url: '', head_title: 'Directeur',
          head_name: '', slogan: '', currency,
        },
        year: selectedYear?.name ?? 'annee',
        data: {
          ...data,
          fees: fees.map(f => ({
            name: f.name,
            amount: f.amount,
            fee_type: f.fee_type,
            applies_to: f.applies_to,
            class_name: f.class_name,
            due_date: f.due_date,
            is_mandatory: f.is_mandatory,
          })),
        },
        methodLabels: PAYMENT_METHODS,
        feeTypeLabels: FEE_TYPES,
        exportedBy: user?.email ?? 'Orion ERP',
      });
      notify('Rapport financier exporté en PDF.');
    } catch (e) {
      setError(`Impossible d'exporter le rapport : ${String(e)}`);
    } finally {
      setExportingReport(false);
    }
  };

  const openPayForm = () => {
    if (!summary) return;
    setError(null);
    setPayForm({
      feeId: '',
      amount: summary.remaining_balance > 0 ? String(summary.remaining_balance / 100) : '',
      method: 'ESPECES',
      reference: '',
      notes: '',
    });
    setShowPayForm(true);
  };

  const handlePaySubmit = async () => {
    setError(null);
    if (!summary || !selectedStudent) { setError('Sélectionnez d\'abord un élève.'); return; }
    const amount = toCents(payForm.amount);
    if (amount <= 0) { setError('Le montant du paiement doit être supérieur à 0.'); return; }
    if (summary.remaining_balance <= 0) { setError('Cet élève est déjà à jour : aucune somme due.'); return; }
    if (amount > summary.remaining_balance) {
      setError(`Le montant dépasse le reliquat de ${formatMoney(summary.remaining_balance)}.`);
      return;
    }

    setSaving(true);
    try {
      await invoke('create_payment', {
        schoolId,
        academicYearId: selectedYear!.id,
        enrollmentId: summary.enrollment_id,
        studentId: summary.student_id,
        feeStructureId: payForm.feeId || null,
        amount,
        paymentMethod: payForm.method,
        reference: payForm.reference.trim() || null,
        notes: payForm.notes.trim() || null,
        recordedBy: user?.id || 'local',
      });
      setShowPayForm(false);
      notify(`Paiement de ${formatMoney(amount)} enregistré.`);
      await loadStudentData(selectedStudent);
      if (activeTab === 'dashboard') loadDashboard();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelPayment = async () => {
    if (!cancelling) return;
    if (cancelReason.trim().length < 3) { setError('Merci d\'indiquer le motif de l\'annulation.'); return; }
    setSaving(true);
    setError(null);
    try {
      await invoke('cancel_payment', { id: cancelling.id, schoolId, cancelReason: cancelReason.trim() });
      notify('Paiement annulé.');
      setCancelling(null);
      setCancelReason('');
      if (selectedStudent) await loadStudentData(selectedStudent);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  // ══════════════ ONGLET 3 : TABLEAU DE BORD ══════════════
  const goToStudent = (studentId: string) => {
    const student = students.find(s => s.student_id === studentId);
    if (student) {
      selectStudent(student);
      setActiveTab('paiements');
    }
  };

  const tabs = [
    { id: 'grille' as const, label: 'Grille Tarifaire', icon: List },
    { id: 'paiements' as const, label: 'Paiements Élève', icon: Receipt },
    { id: 'dashboard' as const, label: 'Tableau de Bord', icon: TrendingUp },
  ];

  return (
    <div className="px-8 pt-6 pb-4 w-full h-full flex flex-col bg-[#f8f9fc]">

      {/* En-tête */}
      <div className="mb-5 flex items-start justify-between flex-shrink-0 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#1e293b] tracking-tight flex items-center gap-2">
            <Coins size={24} className="text-[#4f46e5]" />
            Finances &amp; Paiements
          </h2>
          <p className="text-slate-500 mt-0.5 text-[13px]">
            {selectedYear
              ? <>Année <span className="font-semibold text-[#4f46e5]">{selectedYear.name}</span> · {fees.length} frais défini(s)</>
              : 'Aucune année scolaire sélectionnée'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadAll(); if (activeTab === 'dashboard') loadDashboard(); }}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors"
          >
            <RefreshCw size={14} className={loading || loadingDashboard ? 'animate-spin' : ''} /> Actualiser
          </button>
          {activeTab === 'grille' && (
            <button onClick={() => openFeeForm()} disabled={isYearLocked} className={primaryBtn}>
              <Plus size={16} /> Ajouter un frais
            </button>
          )}
          {activeTab === 'dashboard' && (
            <button
              onClick={handleExportReport}
              disabled={exportingReport || !selectedYear}
              className={primaryBtn}
              title="Rapport financier complet (synthèse, recouvrement, impayés)"
            >
              {exportingReport ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
              Exporter le rapport
            </button>
          )}
        </div>
      </div>

      {/* Année verrouillée */}
      {isYearLocked && (
        <div className="flex items-center gap-2 mb-4 bg-amber-50 text-amber-700 border border-amber-100 p-3 rounded-xl text-sm flex-shrink-0">
          <Lock size={15} />
          <span>L'année {selectedYear?.name} est {selectedYear?.status === 'CLOSED' ? 'clôturée' : 'archivée'} : consultation uniquement, aucune écriture financière possible.</span>
        </div>
      )}

      {/* Onglets */}
      <div className="flex bg-white rounded-xl p-1 w-fit shadow-sm border border-slate-200 mb-4 flex-shrink-0 self-start">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === t.id
                ? 'bg-[#4f46e5] text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Alertes */}
      {error && (
        <div className="flex items-start gap-2 mb-4 bg-red-50 text-red-600 border border-red-100 p-3 rounded-xl text-sm flex-shrink-0">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="hover:text-red-800"><X size={14} /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 mb-4 bg-green-50 text-green-700 border border-green-100 p-3 rounded-xl text-sm flex-shrink-0">
          <Check size={16} />
          <span>{success}</span>
        </div>
      )}

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto min-h-0 pb-6">
        {!selectedYear ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <CalendarClock size={48} strokeWidth={1} className="mb-3 opacity-40" />
            <p className="text-sm">Sélectionnez une année scolaire dans la barre latérale.</p>
          </div>
        ) : (
          <>
            {/* ─────────── GRILLE TARIFAIRE ─────────── */}
            {activeTab === 'grille' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)]">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Frais globaux</p>
                    <p className="text-xl font-bold text-slate-800 mt-1">{formatMoney(globalFeesTotal)}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Appliqués à tous les élèves</p>
                  </div>
                  <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)]">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Frais par classe</p>
                    <p className="text-xl font-bold text-slate-800 mt-1">{fees.filter(f => f.applies_to === 'CLASS').length}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Spécifiques à une classe</p>
                  </div>
                  <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)]">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Avec échéance</p>
                    <p className="text-xl font-bold text-slate-800 mt-1">{fees.filter(f => f.due_date).length}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Frais avec date limite</p>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Search size={15} />
                  </div>
                  <input
                    type="text"
                    placeholder="Rechercher un frais, un type, une classe..."
                    value={feeSearch}
                    onChange={e => setFeeSearch(e.target.value)}
                    className="w-full max-w-sm pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[13.5px] outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] placeholder:text-slate-400 text-slate-700"
                  />
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="py-3.5 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Libellé</th>
                          <th className="py-3.5 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Type</th>
                          <th className="py-3.5 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Montant</th>
                          <th className="py-3.5 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Applicable à</th>
                          <th className="py-3.5 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Échéance</th>
                          <th className="py-3.5 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading && fees.length === 0 ? (
                          <tr><td colSpan={6} className="p-10 text-center text-slate-400 text-sm">Chargement de la grille...</td></tr>
                        ) : filteredFees.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-10 text-center">
                              <div className="flex flex-col items-center gap-2 text-slate-400">
                                <Wallet size={36} strokeWidth={1} className="opacity-40" />
                                <p className="text-sm font-medium text-slate-500">
                                  {fees.length === 0 ? 'Aucune grille tarifaire pour cette année' : 'Aucun frais trouvé'}
                                </p>
                                {fees.length === 0 && (
                                  <button onClick={() => openFeeForm()} disabled={isYearLocked} className="mt-2 flex items-center gap-2 bg-[#4f46e5] text-white px-4 py-2 rounded-xl text-sm font-medium">
                                    <Plus size={14} /> Définir un premier frais
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ) : (
                          filteredFees.map(fee => (
                            <tr key={fee.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                              <td className="py-3.5 px-5 font-bold text-slate-800">
                                {fee.name}
                                {!fee.is_mandatory && (
                                  <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">OPTION</span>
                                )}
                              </td>
                              <td className="py-3.5 px-5 text-slate-600">{labelOf(FEE_TYPES, fee.fee_type)}</td>
                              <td className="py-3.5 px-5 text-right font-semibold text-slate-800">{formatMoney(fee.amount)}</td>
                              <td className="py-3.5 px-5">
                                {fee.applies_to === 'ALL' ? (
                                  <span className="inline-block px-2 py-0.5 rounded-md bg-[#ede9fe] text-[#6d28d9] text-[11px] font-bold">Tous les élèves</span>
                                ) : fee.applies_to === 'CLASS' ? (
                                  <span className="inline-block px-2 py-0.5 rounded-md bg-[#e0f2fe] text-[#0369a1] text-[11px] font-bold">{fee.class_name || 'Classe'}</span>
                                ) : (
                                  <span className="inline-block px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-bold">Niveau {fee.level}</span>
                                )}
                              </td>
                              <td className="py-3.5 px-5 text-slate-600">{formatDate(fee.due_date)}</td>
                              <td className="py-3.5 px-5">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => openFeeForm(fee)}
                                    disabled={isYearLocked}
                                    title="Modifier"
                                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 hover:bg-[#fef9c3] hover:text-[#a16207] text-slate-400 transition-colors disabled:opacity-40"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteFee(fee)}
                                    disabled={isYearLocked}
                                    title="Supprimer"
                                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 hover:bg-red-50 hover:text-red-500 text-slate-400 transition-colors disabled:opacity-40"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ─────────── PAIEMENTS ÉLÈVE ─────────── */}
            {activeTab === 'paiements' && (
              <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
                {/* Liste des élèves */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-slate-100 space-y-3">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Users size={15} className="text-[#4f46e5]" /> Élèves inscrits
                    </h3>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Search size={14} />
                      </div>
                      <input
                        type="text"
                        placeholder="Nom ou matricule..."
                        value={studentSearch}
                        onChange={e => setStudentSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] placeholder:text-slate-400"
                      />
                    </div>
                    <div className="relative">
                      <select
                        value={classFilter}
                        onChange={e => setClassFilter(e.target.value)}
                        className="w-full appearance-none pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] text-slate-700 font-medium"
                      >
                        <option value="">Toutes les classes</option>
                        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="max-h-[520px] overflow-y-auto">
                    {filteredStudents.length === 0 ? (
                      <p className="p-8 text-center text-slate-400 text-sm">Aucun élève inscrit.</p>
                    ) : (
                      filteredStudents.map(s => (
                        <button
                          key={s.id}
                          onClick={() => selectStudent(s)}
                          className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-colors ${
                            selectedStudent?.id === s.id ? 'bg-[#eef2ff] border-l-2 border-l-[#4f46e5]' : 'hover:bg-slate-50'
                          }`}
                        >
                          <p className="font-semibold text-slate-800 text-[13px] truncate">
                            {s.last_name} {s.first_name}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {s.class_name || 'Sans classe'}{s.matricule ? ` · ${s.matricule}` : ''}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Situation de l'élève */}
                <div className="space-y-4">
                  {!selectedStudent ? (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center h-64 text-slate-400">
                      <UserX size={40} strokeWidth={1} className="mb-3 opacity-40" />
                      <p className="text-sm">Sélectionnez un élève pour voir sa situation financière.</p>
                    </div>
                  ) : loadingStudent || !summary ? (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-center h-64 text-slate-400 text-sm gap-2">
                      <Loader2 size={16} className="animate-spin" /> Chargement de la situation...
                    </div>
                  ) : (
                    <>
                      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <h3 className="text-lg font-bold text-slate-800">
                              {summary.last_name} {summary.first_name}
                            </h3>
                            <p className="text-[13px] text-slate-500">{summary.class_name}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${
                              summary.status === 'SOLDE' ? 'bg-green-50 text-green-600'
                                : summary.status === 'PARTIEL' ? 'bg-amber-50 text-amber-600'
                                : 'bg-red-50 text-red-600'}`}>
                              {summary.status === 'SOLDE' ? 'À JOUR' : summary.status === 'PARTIEL' ? 'PAIEMENT PARTIEL' : 'IMPAYÉ'}
                            </span>
                            <button onClick={openPayForm} disabled={isYearLocked} className={primaryBtn}>
                              <Banknote size={16} /> Encaisser
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mt-5">
                          <div className="bg-slate-50 rounded-xl p-3.5">
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total dû</p>
                            <p className="text-lg font-bold text-slate-800 mt-0.5">{formatMoney(summary.total_due)}</p>
                          </div>
                          <div className="bg-emerald-50 rounded-xl p-3.5">
                            <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Payé</p>
                            <p className="text-lg font-bold text-emerald-700 mt-0.5">{formatMoney(summary.total_paid)}</p>
                          </div>
                          <div className={`rounded-xl p-3.5 ${summary.remaining_balance > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                            <p className={`text-[11px] font-bold uppercase tracking-wider ${summary.remaining_balance > 0 ? 'text-red-500' : 'text-slate-400'}`}>Reliquat</p>
                            <p className={`text-lg font-bold mt-0.5 ${summary.remaining_balance > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                              {formatMoney(summary.remaining_balance)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Frais applicables */}
                      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                        <h4 className="text-sm font-bold text-slate-800 mb-3">Frais applicables</h4>
                        {applicableFees.length === 0 ? (
                          <p className="text-sm text-slate-400">Aucun frais défini pour cette année.</p>
                        ) : (
                          <div className="space-y-2">
                            {applicableFees.map(f => (
                              <div key={f.id} className="flex items-center justify-between gap-3 py-2 border-b border-slate-50 last:border-0">
                                <div>
                                  <p className="text-[13px] font-semibold text-slate-700">{f.name}</p>
                                  <p className="text-[11px] text-slate-400">
                                    {labelOf(FEE_TYPES, f.fee_type)}
                                    {f.due_date ? ` · échéance ${formatDate(f.due_date)}` : ''}
                                  </p>
                                </div>
                                <span className="font-semibold text-slate-800 text-[13px] whitespace-nowrap">{formatMoney(f.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Historique des paiements */}
                      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                          <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            <Receipt size={15} className="text-[#4f46e5]" /> Historique des paiements
                          </h4>
                          <span className="text-[11px] text-slate-400">{payments.length} opération(s)</span>
                        </div>
                        {payments.length === 0 ? (
                          <p className="p-8 text-center text-slate-400 text-sm">Aucun paiement enregistré pour cet élève.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-[13px]">
                              <thead>
                                <tr className="border-b border-slate-100">
                                  <th className="py-3 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                                  <th className="py-3 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Reçu</th>
                                  <th className="py-3 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Frais</th>
                                  <th className="py-3 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Montant</th>
                                  <th className="py-3 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Mode</th>
                                  <th className="py-3 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {payments.map(p => (
                                  <tr key={p.id} className={`border-b border-slate-50 ${p.status === 'CANCELLED' ? 'opacity-50' : ''}`}>
                                    <td className="py-3 px-5 text-slate-600 whitespace-nowrap">{formatDate(p.payment_date)}</td>
                                    <td className="py-3 px-5 font-mono text-[12px] text-slate-500">{p.receipt_number}</td>
                                    <td className="py-3 px-5 text-slate-700">
                                      {p.fee_name || 'Acompte / paiement libre'}
                                      {p.status === 'CANCELLED' && (
                                        <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-500">ANNULÉ</span>
                                      )}
                                      {p.notes && <p className="text-[11px] text-slate-400">{p.notes}</p>}
                                    </td>
                                    <td className="py-3 px-5 text-right font-semibold text-slate-800 whitespace-nowrap">
                                      {formatMoney(p.amount)}
                                    </td>
                                    <td className="py-3 px-5 text-slate-600 whitespace-nowrap">{labelOf(PAYMENT_METHODS, p.payment_method)}</td>
                                    <td className="py-3 px-5 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          onClick={() => handlePrintReceipt(p)}
                                          disabled={printingId === p.id}
                                          title="Télécharger le reçu (PDF)"
                                          className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-slate-50 hover:bg-[#0e7490]/10 hover:text-[#0e7490] text-slate-400 transition-colors disabled:opacity-40"
                                        >
                                          {printingId === p.id
                                            ? <Loader2 size={14} className="animate-spin" />
                                            : <FileDown size={14} />}
                                        </button>
                                        {p.status === 'VALID' && (
                                          <button
                                            onClick={() => { setError(null); setCancelReason(''); setCancelling(p); }}
                                            disabled={isYearLocked}
                                            title="Annuler le paiement"
                                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-slate-50 hover:bg-red-50 hover:text-red-500 text-slate-400 transition-colors disabled:opacity-40"
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ─────────── TABLEAU DE BORD ─────────── */}
            {activeTab === 'dashboard' && (
              loadingDashboard && !dashboard ? (
                <div className="flex items-center justify-center h-64 text-slate-400 text-sm gap-2">
                  <Loader2 size={16} className="animate-spin" /> Calcul du tableau de bord...
                </div>
              ) : !dashboard ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <TrendingUp size={40} strokeWidth={1} className="mb-3 opacity-40" />
                  <p className="text-sm">Aucune donnée financière disponible.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)]">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Wallet size={12} /> Total attendu
                      </p>
                      <p className="text-xl font-bold text-slate-800 mt-1">{formatMoney(dashboard.total_due)}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{dashboard.student_count} élève(s) actif(s)</p>
                    </div>
                    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)]">
                      <p className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 size={12} /> Total encaissé
                      </p>
                      <p className="text-xl font-bold text-emerald-600 mt-1">{formatMoney(dashboard.total_paid)}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {dashboard.cancelled_payment_count} paiement(s) annulé(s)
                      </p>
                    </div>
                    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)]">
                      <p className="text-[11px] font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertCircle size={12} /> Reste à recouvrer
                      </p>
                      <p className="text-xl font-bold text-red-500 mt-1">{formatMoney(Math.max(0, dashboard.remaining_balance))}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {dashboard.debtors.length} élève(s) concerné(s)
                      </p>
                    </div>
                    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)]">
                      <p className="text-[11px] font-bold text-[#4f46e5] uppercase tracking-wider flex items-center gap-1.5">
                        <TrendingUp size={12} /> Taux de recouvrement
                      </p>
                      <p className="text-xl font-bold text-[#4f46e5] mt-1">{dashboard.recovery_rate.toFixed(1)} %</p>
                      <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                        <div
                          className="h-full bg-[#4f46e5] rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.max(0, dashboard.recovery_rate))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => setActiveTab('paiements')}
                      className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-left hover:border-emerald-300 transition-colors"
                    >
                      <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Soldés</p>
                      <p className="text-xl font-bold text-emerald-700 mt-0.5">{dashboard.settled_count}</p>
                    </button>
                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                      <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Paiements partiels</p>
                      <p className="text-xl font-bold text-amber-700 mt-0.5">{dashboard.partial_count}</p>
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                      <p className="text-[11px] font-bold text-red-600 uppercase tracking-wider">Impayés</p>
                      <p className="text-xl font-bold text-red-700 mt-0.5">{dashboard.unpaid_count}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
                    {/* Situation par classe */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-slate-100">
                        <h4 className="text-sm font-bold text-slate-800">Recouvrement par classe</h4>
                      </div>
                      {dashboard.by_class.length === 0 ? (
                        <p className="p-8 text-center text-slate-400 text-sm">Aucun élève inscrit pour cette année.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-[13px]">
                            <thead>
                              <tr className="border-b border-slate-100">
                                <th className="py-3 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Classe</th>
                                <th className="py-3 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">Élèves</th>
                                <th className="py-3 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Dû</th>
                                <th className="py-3 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Encaissé</th>
                                <th className="py-3 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Reliquat</th>
                                <th className="py-3 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Progression</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dashboard.by_class.map(c => {
                                const rate = c.total_due > 0 ? (c.total_paid / c.total_due) * 100 : 100;
                                return (
                                  <tr key={c.class_id ?? 'none'} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                                    <td className="py-3 px-5 font-semibold text-slate-800">{c.class_name}</td>
                                    <td className="py-3 px-5 text-center text-slate-600">{c.student_count}</td>
                                    <td className="py-3 px-5 text-right text-slate-700 whitespace-nowrap">{formatMoney(c.total_due)}</td>
                                    <td className="py-3 px-5 text-right text-emerald-600 font-semibold whitespace-nowrap">{formatMoney(c.total_paid)}</td>
                                    <td className="py-3 px-5 text-right text-red-500 font-semibold whitespace-nowrap">
                                      {formatMoney(Math.max(0, c.remaining_balance))}
                                    </td>
                                    <td className="py-3 px-5 w-40">
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                          <div
                                            className={`h-full rounded-full ${rate >= 100 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                            style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                                          />
                                        </div>
                                        <span className="text-[11px] text-slate-400 w-10 text-right">{rate.toFixed(0)}%</span>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Modes de paiement */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                      <h4 className="text-sm font-bold text-slate-800 mb-3">Modes d'encaissement</h4>
                      {dashboard.by_method.length === 0 ? (
                        <p className="text-sm text-slate-400">Aucun encaissement enregistré.</p>
                      ) : (
                        <div className="space-y-3">
                          {dashboard.by_method.map(m => {
                            const share = dashboard.total_paid > 0 ? (m.amount / dashboard.total_paid) * 100 : 0;
                            return (
                              <div key={m.method}>
                                <div className="flex items-center justify-between text-[12px] mb-1">
                                  <span className="font-semibold text-slate-700">{labelOf(PAYMENT_METHODS, m.method)}</span>
                                  <span className="text-slate-500">{formatMoney(m.amount)}</span>
                                </div>
                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-[#4f46e5] rounded-full" style={{ width: `${share}%` }} />
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5">{m.payment_count} paiement(s)</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Reliquats */}
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-800">Élèves avec reliquat</h4>
                      <span className="text-[11px] text-slate-400">
                        {dashboard.debtors.length} élève(s){dashboard.debtors.length >= 100 ? ' (100 premiers)' : ''}
                      </span>
                    </div>
                    {dashboard.debtors.length === 0 ? (
                      <p className="p-8 text-center text-slate-400 text-sm">Aucun impayé : tous les élèves sont à jour.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-[13px]">
                          <thead>
                            <tr className="border-b border-slate-100">
                              <th className="py-3 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Élève</th>
                              <th className="py-3 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Classe</th>
                              <th className="py-3 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Dû</th>
                              <th className="py-3 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Payé</th>
                              <th className="py-3 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Reliquat</th>
                              <th className="py-3 px-5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Situation</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dashboard.debtors.map(d => (
                              <tr
                                key={d.enrollment_id}
                                onClick={() => goToStudent(d.student_id)}
                                className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors cursor-pointer"
                              >
                                <td className="py-3 px-5 font-semibold text-slate-800">{d.last_name} {d.first_name}</td>
                                <td className="py-3 px-5 text-slate-600">{d.class_name}</td>
                                <td className="py-3 px-5 text-right text-slate-700 whitespace-nowrap">{formatMoney(d.total_due)}</td>
                                <td className="py-3 px-5 text-right text-emerald-600 whitespace-nowrap">{formatMoney(d.total_paid)}</td>
                                <td className="py-3 px-5 text-right text-red-500 font-semibold whitespace-nowrap">{formatMoney(d.remaining_balance)}</td>
                                <td className="py-3 px-5">
                                  <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold ${d.status === 'PARTIEL' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
                                    {d.status === 'PARTIEL' ? 'Partiel' : 'Impayé'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )
            )}
          </>
        )}
      </div>

      {/* ═══════════ MODAL : CRÉER / MODIFIER UN FRAIS ═══════════ */}
      {showFeeForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={closeFeeForm}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  {editingFee ? 'Modifier le frais' : 'Nouveau frais scolaire'}
                </h3>
                <p className="text-sm text-slate-400">{selectedYear?.name}</p>
              </div>
              <button onClick={closeFeeForm} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full p-1.5 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelClass}>Libellé <span className="text-[#4f46e5]">*</span></label>
                <input
                  type="text"
                  placeholder="Ex: Scolarité 1er trimestre, Inscription, Transport..."
                  value={feeForm.name}
                  onChange={e => setFeeForm({ ...feeForm, name: e.target.value })}
                  className={inputClass}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Montant ({currency}) <span className="text-[#4f46e5]">*</span></label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={feeForm.amount}
                    onChange={e => setFeeForm({ ...feeForm, amount: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Échéance</label>
                  <input
                    type="date"
                    value={feeForm.dueDate}
                    onChange={e => setFeeForm({ ...feeForm, dueDate: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Type de frais</label>
                  <div className="relative">
                    <select
                      value={feeForm.feeType}
                      disabled={!!editingFee}
                      onChange={e => setFeeForm({ ...feeForm, feeType: e.target.value })}
                      className={`${inputClass} appearance-none disabled:opacity-60`}
                    >
                      {FEE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Applicable à</label>
                  <div className="relative">
                    <select
                      value={feeForm.appliesTo}
                      disabled={!!editingFee}
                      onChange={e => setFeeForm({ ...feeForm, appliesTo: e.target.value, classId: '' })}
                      className={`${inputClass} appearance-none disabled:opacity-60`}
                    >
                      <option value="ALL">Tous les élèves</option>
                      <option value="CLASS">Une classe</option>
                    </select>
                    <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {feeForm.appliesTo === 'CLASS' && (
                <div>
                  <label className={labelClass}>Classe concernée <span className="text-[#4f46e5]">*</span></label>
                  <div className="relative">
                    <select
                      value={feeForm.classId}
                      disabled={!!editingFee}
                      onChange={e => setFeeForm({ ...feeForm, classId: e.target.value })}
                      className={`${inputClass} appearance-none disabled:opacity-60`}
                    >
                      <option value="">— Choisir une classe —</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={feeForm.isMandatory}
                  onChange={e => setFeeForm({ ...feeForm, isMandatory: e.target.checked })}
                  className="w-4 h-4 rounded accent-[#4f46e5]"
                />
                <span className="text-[13px] text-slate-700">Frais obligatoire</span>
              </label>

              {editingFee && (
                <p className="text-[11px] text-slate-400 bg-slate-50 rounded-lg p-2.5">
                  Le type et le périmètre ne sont pas modifiables après création. Supprimez le frais puis recréez-le si nécessaire.
                </p>
              )}

              {error && (
                <div className="text-red-600 text-xs bg-red-50 border border-red-100 rounded-lg p-2.5">{error}</div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={closeFeeForm} className={`${ghostBtn} flex-1`}>Annuler</button>
              <button onClick={handleFeeSubmit} disabled={saving} className={`${primaryBtn} flex-1`}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                {editingFee ? 'Enregistrer' : 'Ajouter le frais'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ MODAL : ENCAISSER UN PAIEMENT ═══════════ */}
      {showPayForm && summary && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowPayForm(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Enregistrer un paiement</h3>
                <p className="text-sm text-slate-400">
                  {summary.last_name} {summary.first_name} · {summary.class_name}
                </p>
              </div>
              <button onClick={() => setShowPayForm(false)} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full p-1.5 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 mb-4 flex items-center justify-between">
              <span className="text-[12px] font-semibold text-slate-500">Reliquat à régler</span>
              <span className="text-base font-bold text-[#4f46e5]">{formatMoney(summary.remaining_balance)}</span>
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelClass}>Frais concerné</label>
                <div className="relative">
                  <select
                    value={payForm.feeId}
                    onChange={e => {
                      const fee = applicableFees.find(f => f.id === e.target.value);
                      setPayForm({
                        ...payForm,
                        feeId: e.target.value,
                        amount: fee ? String(fee.amount / 100) : payForm.amount,
                      });
                    }}
                    className={`${inputClass} appearance-none`}
                  >
                    <option value="">Acompte / paiement libre</option>
                    {applicableFees.map(f => (
                      <option key={f.id} value={f.id}>{f.name} — {formatMoney(f.amount)}</option>
                    ))}
                  </select>
                  <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Montant reçu ({currency}) <span className="text-[#4f46e5]">*</span></label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={payForm.amount}
                    onChange={e => setPayForm({ ...payForm, amount: e.target.value })}
                    className={inputClass}
                    autoFocus
                  />
                </div>
                <div>
                  <label className={labelClass}>Mode de paiement</label>
                  <div className="relative">
                    <select
                      value={payForm.method}
                      onChange={e => setPayForm({ ...payForm, method: e.target.value })}
                      className={`${inputClass} appearance-none`}
                    >
                      {PAYMENT_METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                    <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <label className={labelClass}>Référence (n° de chèque, transaction...)</label>
                <input
                  type="text"
                  placeholder="Optionnel"
                  value={payForm.reference}
                  onChange={e => setPayForm({ ...payForm, reference: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Observations</label>
                <textarea
                  rows={2}
                  placeholder="Optionnel"
                  value={payForm.notes}
                  onChange={e => setPayForm({ ...payForm, notes: e.target.value })}
                  className={`${inputClass} resize-none`}
                />
              </div>

              {error && (
                <div className="text-red-600 text-xs bg-red-50 border border-red-100 rounded-lg p-2.5">{error}</div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowPayForm(false)} className={`${ghostBtn} flex-1`}>Annuler</button>
              <button onClick={handlePaySubmit} disabled={saving} className={`${primaryBtn} flex-1`}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Banknote size={15} />}
                Encaisser
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ MODAL : ANNULER UN PAIEMENT ═══════════ */}
      {cancelling && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setCancelling(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center flex-shrink-0">
                <AlertCircle size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Annuler ce paiement ?</h3>
                <p className="text-[13px] text-slate-500">
                  Reçu {cancelling.receipt_number} · {formatMoney(cancelling.amount)}
                </p>
              </div>
            </div>

            <p className="text-[13px] text-slate-500 mb-4">
              Un paiement ne peut jamais être supprimé : il sera marqué comme annulé et conservé dans l'historique.
            </p>

            <label className={labelClass}>Motif de l'annulation <span className="text-[#4f46e5]">*</span></label>
            <textarea
              rows={3}
              placeholder="Ex: erreur de saisie, espèces non reçues..."
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              className={`${inputClass} resize-none`}
              autoFocus
            />

            {error && (
              <div className="text-red-600 text-xs bg-red-50 border border-red-100 rounded-lg p-2.5 mt-3">{error}</div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={() => setCancelling(null)} className={`${ghostBtn} flex-1`}>Retour</button>
              <button
                onClick={handleCancelPayment}
                disabled={saving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Confirmer l'annulation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
