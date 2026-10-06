import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, ChevronLeft, ChevronRight, Download, GraduationCap,
  LoaderCircle, Printer, Search, Users, X,
} from 'lucide-react';
import {
  buildNominalListData, nominalListFileName,
  type NominalListClassInput,
} from '../lib/nominalListTemplate';
import {
  buildNominalListHtml, buildNominalListPdf, layoutNominalList, loadNominalListAssets,
  type NominalListAssets,
} from '../lib/nominalListPdf';

interface NominalListModalProps {
  /** Classes de l'onglet courant (Collège), déjà filtrées par l'établissement. */
  classes: NominalListClassInput[];
  groupLabel: string;
  yearName: string;
  onClose: () => void;
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
}

/** Une page d'aperçu, rattachée à sa classe. */
interface PreviewPage {
  key: string;
  label: string;
  count: number;
}

const deaccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function NominalListModal({
  classes, groupLabel, yearName, onClose, onError, onSuccess,
}: NominalListModalProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activePage, setActivePage] = useState(0);
  const [assets, setAssets] = useState<NominalListAssets | null>(null);
  const [busy, setBusy] = useState(false);

  const frameRef = useRef<HTMLIFrameElement>(null);

  // ── Images du modèle (logo, QR, filigrane) ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    loadNominalListAssets()
      .then(a => { if (!cancelled) setAssets(a); })
      .catch(e => onError(`Aperçu impossible : ${String(e)}`));
    return () => { cancelled = true; };
  }, [onError]);

  // ── Recherche sur le nom de la classe ─────────────────────────────────────
  const filtered = useMemo(() => {
    const q = deaccent(query).trim().toLowerCase();
    if (!q) return classes;
    return classes.filter(c => deaccent(c.name).toLowerCase().includes(q));
  }, [classes, query]);

  // ── Sélection ─────────────────────────────────────────────────────────────
  // On conserve l'ordre des classes de l'onglet : le PDF suit cet ordre.
  const selectedClasses = useMemo(
    () => classes.filter(c => selected.has(c.id)),
    [classes, selected],
  );

  const data = useMemo(() => buildNominalListData(selectedClasses), [selectedClasses]);

  // Une entrée par feuille, dans l'ordre du PDF (le même découpage).
  const previewPages = useMemo<PreviewPage[]>(
    () =>
      layoutNominalList(data).map(p => ({
        key: `${p.data.id}:${p.offset}`,
        label: p.parts > 1 ? `${p.data.name} · ${p.part}/${p.parts}` : p.data.name,
        count: p.data.rows.length,
      })),
    [data],
  );

  // Toute modification de la sélection ramène l'aperçu sur une page existante.
  useEffect(() => {
    setActivePage(p => Math.min(p, Math.max(0, previewPages.length - 1)));
  }, [previewPages.length]);

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allFilteredSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id));

  const toggleAll = useCallback(() => {
    setSelected(prev => {
      const next = new Set(prev);
      if (filtered.every(c => next.has(c.id))) filtered.forEach(c => next.delete(c.id));
      else filtered.forEach(c => next.add(c.id));
      return next;
    });
  }, [filtered]);

  const selectAll = useCallback(() => setSelected(new Set(classes.map(c => c.id))), [classes]);
  const clearAll = useCallback(() => setSelected(new Set()), []);

  // ── Aperçu : un seul document, toutes les pages sélectionnées ─────────────
  const docOptions = useMemo(
    () => (assets && data.length > 0 ? { pages: data, assets, groupLabel } : null),
    [assets, data, groupLabel],
  );

  const html = useMemo(
    () => (docOptions ? buildNominalListHtml(docOptions) : ''),
    [docOptions],
  );

  const blobUrl = useMemo(() => {
    if (!html) return null;
    return URL.createObjectURL(new Blob([html], { type: 'text/html; charset=utf-8' }));
  }, [html]);

  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  // Positionne l'aperçu sur la page active.
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    const page = doc.querySelectorAll('.page')[activePage] as HTMLElement | undefined;
    page?.scrollIntoView({ block: 'start' });
  }, [activePage, blobUrl]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const win = frameRef.current?.contentWindow;
    if (!win) { onError("Impossible d'ouvrir la fenêtre d'impression."); return; }
    win.focus();
    win.print(); // @page { size: A4 landscape } dans l'aperçu
  };

  const handleDownload = () => {
    if (!docOptions) return;
    setBusy(true);
    try {
      const fileName = nominalListFileName(data, groupLabel, yearName);
      buildNominalListPdf(docOptions).save(fileName);
      const students = data.reduce((sum, c) => sum + c.rows.length, 0);
      onSuccess?.(
        data.length === 1
          ? `${data[0].name} — ${students} élève(s) exporté(s).`
          : `${data.length} classes — ${students} élève(s) exporté(s).`,
      );
    } catch (e) {
      onError(`Impossible de générer le PDF : ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setActivePage(p => Math.min(p + 1, previewPages.length - 1));
      if (e.key === 'ArrowLeft') setActivePage(p => Math.max(p - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, previewPages.length]);

  const container = useMemo(() => document.querySelector('main') ?? document.body, []);
  const totalStudents = data.reduce((sum, c) => sum + c.rows.length, 0);
  const current = previewPages[activePage];

  return createPortal(
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Liste nominative de la classe"
        className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-scale-in"
      >
        {/* ── En-tête ── */}
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <GraduationCap size={16} />
            </span>
            <div>
              <h3 className="text-[14px] font-bold text-slate-800">Liste nominative de la classe</h3>
              <p className="text-[11px] text-slate-400">
                Aperçu avant impression · A4 paysage · {groupLabel} · {yearName}
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
          {/* ── Panneau de sélection des classes ── */}
          <aside className="flex max-h-56 w-full flex-shrink-0 flex-col border-b border-slate-200 bg-slate-50 md:max-h-none md:w-72 md:border-b-0 md:border-r">
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

              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={toggleAll}
                  className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#4f46e5] transition-colors hover:text-[#4338ca]"
                >
                  <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border transition-colors ${
                    allFilteredSelected ? 'border-[#4f46e5] bg-[#4f46e5] text-white' : 'border-slate-300 bg-white'
                  }`}>
                    {allFilteredSelected && <CheckMark />}
                  </span>
                  {allFilteredSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
                <span className="text-[11px] text-slate-400">
                  {filtered.length} / {classes.length}
                </span>
              </div>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-slate-400">
                  Aucune classe ne correspond.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {filtered.map(c => {
                    const on = selected.has(c.id);
                    return (
                      <li key={c.id}>
                        <button
                          onClick={() => toggle(c.id)}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                            on ? 'bg-[#4f46e5]/10 ring-1 ring-[#4f46e5]/25' : 'hover:bg-slate-100'
                          }`}
                        >
                          <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                            on ? 'border-[#4f46e5] bg-[#4f46e5] text-white' : 'border-slate-300 bg-white'
                          }`}>
                            {on && <CheckMark />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-semibold text-slate-700">
                              {c.name}
                            </span>
                            <span className="block text-[10.5px] text-slate-400">
                              {c.students.length} élève{c.students.length > 1 ? 's' : ''}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {classes.length > 0 && (
              <div className="flex flex-shrink-0 gap-2 border-t border-slate-200/70 p-3">
                <button
                  onClick={selectAll}
                  className="flex-1 rounded-lg border border-slate-200 bg-white py-1.5 text-[11.5px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Toutes
                </button>
                <button
                  onClick={clearAll}
                  className="flex-1 rounded-lg border border-slate-200 bg-white py-1.5 text-[11.5px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Aucune
                </button>
              </div>
            )}
          </aside>

          {/* ── Aperçu ── */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <Users size={13} className="flex-shrink-0 text-slate-400" />
                <p className="truncate text-[12px] font-semibold text-slate-600">
                  {data.length === 0
                    ? 'Aucune classe sélectionnée'
                    : `${data.length} classe${data.length > 1 ? 's' : ''} · ${totalStudents} élève${totalStudents > 1 ? 's' : ''}`}
                </p>
              </div>

              {previewPages.length > 1 && current && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActivePage(p => Math.max(p - 1, 0))}
                    disabled={activePage === 0}
                    aria-label="Page précédente"
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <span className="min-w-40 truncate text-center text-[11.5px] font-medium text-slate-500">
                    {current.label}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {activePage + 1}/{previewPages.length}
                  </span>
                  <button
                    onClick={() => setActivePage(p => Math.min(p + 1, previewPages.length - 1))}
                    disabled={activePage >= previewPages.length - 1}
                    aria-label="Page suivante"
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-hidden bg-slate-200 p-4">
              {!assets ? (
                <div className="flex h-full flex-col items-center justify-center text-slate-400">
                  <LoaderCircle size={34} strokeWidth={1} className="mb-3 animate-spin opacity-50" />
                  <p className="text-sm">Chargement du modèle…</p>
                </div>
              ) : classes.length === 0 ? (
                <EmptyState
                  icon={<GraduationCap size={38} strokeWidth={1} />}
                  title="Aucune classe enregistrée"
                  hint="Créez d'abord une classe dans cet onglet pour générer sa liste nominative."
                />
              ) : data.length === 0 ? (
                <EmptyState
                  icon={<Users size={38} strokeWidth={1} />}
                  title="Sélectionnez au moins une classe"
                  hint="Cochez une classe à gauche, ou utilisez « Tout sélectionner » pour générer toutes les listes d'un coup."
                />
              ) : blobUrl ? (
                <div className="h-full overflow-hidden rounded-xl bg-white shadow-lg">
                  <iframe
                    ref={frameRef}
                    src={blobUrl}
                    className="h-full w-full border-0 bg-slate-200"
                    title={`Aperçu — Liste nominative ${current?.label ?? ''}`}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── Pied : récapitulatif + actions ── */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
            {data.some(c => c.rows.length > 27) ? (
              <>
                <AlertTriangle size={12} className="text-amber-500" />
                <span>
                  Une page contient 27 élèves : les classes plus grandes sont réparties sur plusieurs pages.
                </span>
              </>
            ) : (
              <span>
                Format <strong className="text-slate-500">A4 paysage</strong> — une page par classe.
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={data.length === 0 || !assets}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[12px] font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer size={13} /> Imprimer
            </button>
            <button
              onClick={handleDownload}
              disabled={data.length === 0 || !assets || busy}
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

/** Coche de la case à cocher (glyphe unique, sans dépendance supplémentaire). */
function CheckMark() {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden="true">
      <path d="M2 6.2 4.6 9 10 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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