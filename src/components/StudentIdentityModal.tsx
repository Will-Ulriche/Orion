import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { Download, LoaderCircle, Search, User, X, ZoomIn, ZoomOut } from 'lucide-react';
import {
  buildStudentIdentityPdf, studentIdentityFileName,
  type StudentIdentityData,
} from '../lib/studentIdentityPdf';
import type { ReceiptSchoolInfo } from '../lib/receiptPdf';

const deaccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Zoom de l'aperçu : 30 % → 300 %, par pas de 10 %. */
const clampZoom = (z: number) => Math.min(3, Math.max(0.3, Math.round(z * 100) / 100));

/** Ligne d'inscription d'Archives (get_students) — champs utiles à la fiche. */
export interface StudentIdentityRow {
  student_id: string;
  first_name: string | null;
  last_name: string | null;
  matricule: string | null;
  class_name: string | null;
  gender?: string | null;
  birth_date?: string | null;
  birth_place?: string | null;
  address?: string | null;
}

/** Repli partiel si get_student_details échoue : au moins nom/classe/genre. */
const dataFromRow = (row: StudentIdentityRow): StudentIdentityData => ({
  studentId: row.student_id,
  firstName: row.first_name,
  lastName: row.last_name,
  matricule: row.matricule,
  className: row.class_name,
  birthDate: row.birth_date ?? null,
  birthPlace: row.birth_place ?? null,
  gender: row.gender ?? null,
  address: row.address ?? null,
  phone: null,
  parentName: null,
  parentPhone: null,
  parentEmail: null,
  bloodType: null,
  medicalNotes: null,
  photoUrl: null,
});

interface StudentIdentityModalProps {
  students: StudentIdentityRow[];
  school: ReceiptSchoolInfo;
  yearName: string;
  groupLabel: string;
  onClose: () => void;
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
}

export default function StudentIdentityModal({
  students, school, yearName, groupLabel, onClose, onError, onSuccess,
}: StudentIdentityModalProps) {
  const [query, setQuery] = useState('');
  // Une seule classe à la fois (liste de gauche) ; l'élève se choisit dans la
  // liste déroulante en haut du panneau.
  const [activeClass, setActiveClass] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [zoom, setZoom] = useState(1);

  // ── Classes de l'onglet (filtrimax par recherche) — une seule sélectionnable ──
  const grouped = useMemo(() => {
    const q = deaccent(query.trim()).toLowerCase();
    const match = (r: StudentIdentityRow) =>
      !q || deaccent(`${r.last_name ?? ''} ${r.first_name ?? ''} ${r.matricule ?? ''} ${r.class_name ?? ''}`)
        .toLowerCase().includes(q);
    const byClass = new Map<string, StudentIdentityRow[]>();
    for (const row of students) {
      if (!match(row)) continue;
      const key = row.class_name ?? 'Sans classe';
      const list = byClass.get(key);
      if (list) list.push(row);
      else byClass.set(key, [row]);
    }
    return [...byClass.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'))
      .map(([cls, rows]) => [cls, [...rows].sort((a, b) =>
        (a.last_name ?? '').localeCompare(b.last_name ?? '', 'fr')
        || (a.first_name ?? '').localeCompare(b.first_name ?? '', 'fr'))] as const);
  }, [students, query]);

  /** Élèves de la classe active (alimentent la liste déroulante). */
  const classRows = useMemo(
    () => grouped.find(([cls]) => cls === activeClass)?.[1] ?? [],
    [grouped, activeClass],
  );

  /** Sélection d'une classe : remplace la classe précédente (jamais cumulable). */
  const pickClass = (cls: string, rows: StudentIdentityRow[]) => {
    setActiveClass(cls);
    // Premier élève de la classe sélectionnée automatiquement affiché.
    setSelectedStudentId(rows[0]?.student_id ?? null);
  };

  const activeClassVisible = activeClass !== null && grouped.some(([cls]) => cls === activeClass);

  // La recherche peut masquer la classe active : on repart d'une sélection vide
  // plutôt que d'afficher une classe introuvable dans la liste.
  useEffect(() => {
    if (activeClass !== null && !activeClassVisible) {
      setActiveClass(null);
      setSelectedStudentId(null);
    }
  }, [activeClass, activeClassVisible]);

  // ── Données complètes de l'élève choisi (get_student_details) ───────────────
  const detailsCache = useRef(new Map<string, StudentIdentityData>());
  const [details, setDetails] = useState<StudentIdentityData[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const selectedRow = useMemo(
    () => students.find(s => s.student_id === selectedStudentId) ?? null,
    [students, selectedStudentId],
  );

  useEffect(() => {
    if (!selectedRow) {
      setDetails([]);
      return;
    }
    let cancelled = false;
    setLoadingDetails(true);
    // Le cache survit aux changements de classe : un élève déjà vu s'affiche
    // immédiatement, seules les nouvelles sélections déclenchent un fetch.
    const cached = detailsCache.current.get(selectedRow.student_id);
    const publish = (data: StudentIdentityData) => {
      if (cancelled) return;
      setDetails([data]);
      setLoadingDetails(false);
    };
    if (cached) { publish(cached); return; }
    (async () => {
      try {
        const d = await invoke<Record<string, string | null>>('get_student_details', {
          studentId: selectedRow.student_id,
        });
        const full: StudentIdentityData = {
          ...dataFromRow(selectedRow),
          firstName: d.first_name ?? selectedRow.first_name,
          lastName: d.last_name ?? selectedRow.last_name,
          matricule: d.matricule ?? selectedRow.matricule,
          birthDate: d.birth_date ?? selectedRow.birth_date ?? null,
          birthPlace: d.birth_place ?? selectedRow.birth_place ?? null,
          gender: d.gender ?? selectedRow.gender ?? null,
          address: d.address ?? selectedRow.address ?? null,
          phone: d.phone ?? null,
          parentName: d.parent_name ?? null,
          parentPhone: d.parent_phone ?? null,
          parentEmail: d.parent_email ?? null,
          bloodType: d.blood_type ?? null,
          medicalNotes: d.medical_notes ?? null,
          photoUrl: d.photo_url ?? null,
        };
        detailsCache.current.set(selectedRow.student_id, full);
        publish(full);
      } catch (e) {
        // Repli sur la ligne d'inscription : la fiche reste générable.
        console.error(e);
        const fallback = dataFromRow(selectedRow);
        detailsCache.current.set(selectedRow.student_id, fallback);
        publish(fallback);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedRow]);


  // ── Aperçu : le PDF réel (mêmes octets que le fichier téléchargé) ──────────
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const revokePreviewUrl = () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };

    if (details.length === 0 || loadingDetails) {
      // On conserve l'ancien aperçu pendant le chargement des détails.
      if (details.length === 0) {
        revokePreviewUrl();
        setPdfBlob(null);
        setBlobUrl(null);
      }
      setPreviewing(false);
      return;
    }

    let cancelled = false;
    setPreviewing(true);
    // Court délai : React peint le spinner avant le build jsPDF synchrone.
    const timer = setTimeout(() => {
      if (cancelled) return;
      try {
        const doc = buildStudentIdentityPdf({ students: details, school });
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        revokePreviewUrl();
        previewUrlRef.current = url;
        setPdfBlob(blob);
        setBlobUrl(url);
      } catch (e) {
        console.error(e);
        onError(`Aperçu PDF impossible : ${String(e)}`);
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [details, loadingDetails, school, onError]);

  // Dernière URL de l'aperçu : révoquée au démontage du modal.
  useEffect(() => () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Téléchargement : réutilise les octets de l'aperçu ──────────────────────
  const handleDownload = () => {
    if (!pdfBlob) return;
    setBusy(true);
    setTimeout(() => {
      try {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = studentIdentityFileName(details, yearName);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        onSuccess?.(
          details.length === 1
            ? `Fiche d'identité de ${[details[0].lastName, details[0].firstName].filter(Boolean).join(' ')} exportée.`
            : `${details.length} fiches d'identité exportées.`,
        );
      } catch (e) {
        onError(`Impossible de générer le PDF : ${String(e)}`);
      } finally {
        setBusy(false);
      }
    }, 50);
  };


  const container = useMemo(() => document.querySelector('main') ?? document.body, []);

  return createPortal(
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Fiche d'identité de l'élève"
        className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-scale-in"
      >
        {/* ── En-tête ── */}
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <User size={16} />
            </span>
            <div>
              <h3 className="text-[14px] font-bold text-slate-800">Fiche d'identité de l'élève</h3>
              <p className="text-[11px] text-slate-400">
                Aperçu avant impression · A4 portrait · {groupLabel} · {yearName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* ── Panneau de sélection : élèves groupés par classe ── */}
          <aside className="flex max-h-56 w-full flex-shrink-0 flex-col border-b border-slate-200 bg-slate-50 md:max-h-none md:w-80 md:border-b-0 md:border-r">
            <div className="flex-shrink-0 space-y-2.5 border-b border-slate-200/70 p-3">
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Rechercher une classe…"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-8 text-[12.5px] text-slate-700 outline-none transition-all placeholder:text-slate-300 hover:border-slate-300 focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/15"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    aria-label="Effacer la recherche"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 transition-colors hover:text-slate-500"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* ── Liste déroulante : élève de la classe choisie ── */}
              <div>
                <label
                  htmlFor="student-identity-select"
                  className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-slate-400"
                >
                  Élève de la classe
                </label>
                <select
                  id="student-identity-select"
                  value={selectedStudentId ?? ''}
                  onChange={e => setSelectedStudentId(e.target.value || null)}
                  disabled={!activeClass || classRows.length === 0}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-medium text-slate-700 outline-none transition-all hover:border-slate-300 focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">
                    {!activeClass
                      ? 'Sélectionnez une classe…'
                      : classRows.length === 0
                        ? 'Aucun élève dans cette classe'
                        : 'Choisir un élève…'}
                  </option>
                  {classRows.map(r => (
                    <option key={r.student_id} value={r.student_id}>
                      {[r.last_name, r.first_name].filter(Boolean).join(' ') || '—'}
                      {r.matricule ? ` (${r.matricule})` : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {activeClass
                    ? `${activeClass} · ${classRows.length} élève${classRows.length > 1 ? 's' : ''}`
                    : `${grouped.length} classe${grouped.length > 1 ? 's' : ''} · ${students.length} élève${students.length > 1 ? 's' : ''}`}
                </p>
              </div>
            </div>


            {/* ── Liste des classes : une seule sélection à la fois ── */}
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
              {grouped.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-slate-400">
                  {students.length === 0 ? 'Aucune classe dans cet onglet.' : 'Aucune classe ne correspond.'}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {grouped.map(([cls, rows]) => {
                    const on = activeClass === cls;
                    return (
                      <li key={cls}>
                        <button
                          onClick={() => pickClass(cls, rows)}
                          aria-pressed={on}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                            on ? 'bg-[#4f46e5]/10 ring-1 ring-[#4f46e5]/25' : 'hover:bg-slate-100'
                          }`}
                        >
                          {/* Pastille radio : jamais deux classes actives */}
                          <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
                            on ? 'border-[#4f46e5]' : 'border-slate-300 bg-white'
                          }`}>
                            {on && <span className="h-2 w-2 rounded-full bg-[#4f46e5]" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-semibold text-slate-700">
                              {cls}
                            </span>
                            <span className="block text-[10.5px] text-slate-400">
                              {rows.length} élève{rows.length > 1 ? 's' : ''}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>


          {/* ── Aperçu ── */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <User size={13} className="flex-shrink-0 text-slate-400" />
                <p className="truncate text-[12px] font-semibold text-slate-600">
                  {!selectedStudentId
                    ? 'Aucun élève sélectionné'
                    : loadingDetails
                      ? 'Chargement de la fiche…'
                      : details.length === 1
                        ? `Fiche de ${[details[0].lastName, details[0].firstName].filter(Boolean).join(' ') || 'élève'}`
                        : '1 fiche · A4 portrait'}
                </p>
              </div>

              {/* ── Zoom de l'aperçu ── */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setZoom(z => clampZoom(z - 0.1))}
                  disabled={zoom <= 0.3}
                  aria-label="Dézoomer"
                  title="Dézoomer"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ZoomOut size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  aria-label="Réinitialiser le zoom à 100 %"
                  title="Réinitialiser à 100 %"
                  className="min-w-[3.1rem] rounded-lg px-1.5 py-1 text-[11px] font-semibold tabular-nums text-slate-600 transition-colors hover:bg-slate-100"
                >
                  {Math.round(zoom * 100)} %
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(z => clampZoom(z + 0.1))}
                  disabled={zoom >= 3}
                  aria-label="Zoomer"
                  title="Zoomer"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ZoomIn size={13} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden bg-slate-200 p-4 relative">
              {(previewing || (loadingDetails && !!selectedStudentId)) && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-200/50 backdrop-blur-sm text-slate-600">
                  <LoaderCircle size={34} strokeWidth={1} className="mb-3 animate-spin" />
                  <p className="text-sm font-medium">
                    {loadingDetails ? 'Chargement des données…' : 'Génération de l’aperçu…'}
                  </p>
                </div>
              )}
              {students.length === 0 ? (
                <EmptyState
                  icon={<User size={38} strokeWidth={1} />}
                  title="Aucun élève enregistré"
                  hint="Inscrits d'abord des élèves dans cet onglet pour générer leurs fiches d'identité."
                />
              ) : !activeClass || !selectedStudentId ? (
                <EmptyState
                  icon={<User size={38} strokeWidth={1} />}
                  title="Sélectionnez une classe"
                  hint="Choisissez une classe dans la liste de gauche, puis un élève dans la liste déroulante pour afficher sa fiche."
                />
              ) : blobUrl ? (
                <div className="h-full overflow-hidden rounded-xl bg-slate-200">
                  <iframe
                    src={`${blobUrl}#view=FitH`}
                    // CSS `zoom` : 100 % remplit le cadre, seul le contenu grossit.
                    style={{ zoom: `${zoom}` }}
                    className="h-full w-full border-0"
                    title="Aperçu de la fiche d'identité"
                  />
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-slate-400">
                  <LoaderCircle size={34} strokeWidth={1} className="mb-3 animate-spin opacity-50" />
                  <p className="text-sm">Génération de l'aperçu…</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Pied : récapitulatif + actions ── */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <p className="text-[11px] text-slate-400">
            Format <strong className="text-slate-500">A4 portrait</strong> — une page par élève, année {yearName}.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={!selectedStudentId || busy || previewing || loadingDetails || !pdfBlob}
              className="flex items-center gap-1.5 rounded-lg bg-[#4f46e5] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4338ca] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />}
              Télécharger PDF
            </button>
          </div>
        </div>
      </div>
    </div>,
    container,
  );
}

function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center text-slate-400">
      <span className="mb-3 opacity-40">{icon}</span>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-1 max-w-sm text-[12px] text-slate-400">{hint}</p>
    </div>
  );
}

