import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { Download, GraduationCap, LoaderCircle, Search, Users, X, ClipboardCheck } from 'lucide-react';
import type { NominalListClassInput } from '../lib/nominalListTemplate';
import { buildPresenceListPdf, buildPresenceListHtml, nominalListFileName } from '../lib/presenceListPdf';

interface PresenceListModalProps {
  classes: NominalListClassInput[];
  groupLabel: string;
  yearName: string;
  onClose: () => void;
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
}

const deaccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function PresenceListModal({
  classes, groupLabel, yearName, onClose, onError, onSuccess,
}: PresenceListModalProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // ── Recherche sur le nom de la classe ─────────────────────────────────────
  const filtered = useMemo(() => {
    const q = deaccent(query).trim().toLowerCase();
    if (!q) return classes;
    return classes.filter(c => deaccent(c.name).toLowerCase().includes(q));
  }, [classes, query]);

  // ── Sélection ─────────────────────────────────────────────────────────────
  const selectedClasses = useMemo(
    () => classes.filter(c => selected.has(c.id)),
    [classes, selected],
  );

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

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | undefined>();

  useEffect(() => {
    invoke<any>('get_school_settings').then(s => {
      if (s && s.logo_url) setLogoUrl(s.logo_url);
    }).catch(() => {});
  }, []);

  // Aperçu HTML natif basé sur liste_de_presence.html
  useEffect(() => {
    if (selectedClasses.length === 0) {
      setBlobUrl(null);
      return;
    }
    let cancelled = false;
    let currentUrl: string | null = null;

    const timer = setTimeout(() => {
      try {
        const html = buildPresenceListHtml(selectedClasses, groupLabel, yearName, logoUrl);
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        currentUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setBlobUrl(currentUrl);
        } else {
          URL.revokeObjectURL(currentUrl);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error(err);
          setBlobUrl(null);
          onError(`Aperçu impossible : ${err.message}`);
        }
      }
    }, 10);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [selectedClasses, groupLabel, yearName, logoUrl]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleDownload = () => {
    if (selectedClasses.length === 0) return;
    setBusy(true);
    
    setTimeout(() => {
      buildPresenceListPdf(selectedClasses, groupLabel, yearName, logoUrl)
        .then(bytes => {
          const blob = new Blob([bytes as any], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = nominalListFileName(selectedClasses, groupLabel, yearName, 'presence');
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          const totalStudents = selectedClasses.reduce((sum, c) => sum + c.students.length, 0);
          onSuccess?.(
            selectedClasses.length === 1
              ? `${selectedClasses[0].name} — ${totalStudents} élève(s) exporté(s).`
              : `${selectedClasses.length} classes — ${totalStudents} élève(s) exporté(s).`
          );
        })
        .catch(err => {
          onError(`Impossible de générer le PDF : ${String(err)}`);
        })
        .finally(() => {
          setBusy(false);
        });
    }, 50);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const container = useMemo(() => document.querySelector('main') ?? document.body, []);
  const totalStudents = selectedClasses.reduce((sum, c) => sum + c.students.length, 0);

  return createPortal(
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Liste de présence"
        className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-scale-in"
      >
        {/* ── En-tête ── */}
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
              <ClipboardCheck size={16} />
            </span>
            <div>
              <h3 className="text-[14px] font-bold text-slate-800">Liste de présence</h3>
              <p className="text-[11px] text-slate-400">
                Aperçu basé sur votre modèle PDF · {groupLabel} · {yearName}
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
                  {selectedClasses.length === 0
                    ? 'Aucune classe sélectionnée'
                    : `${selectedClasses.length} classe${selectedClasses.length > 1 ? 's' : ''} · ${totalStudents} élève${totalStudents > 1 ? 's' : ''}`}
                </p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden bg-slate-200 p-4 relative">
              {busy && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-200/50 backdrop-blur-sm text-slate-600">
                  <LoaderCircle size={34} strokeWidth={1} className="mb-3 animate-spin" />
                  <p className="text-sm font-medium">Génération en cours…</p>
                </div>
              )}
              {classes.length === 0 ? (
                <EmptyState
                  icon={<GraduationCap size={38} strokeWidth={1} />}
                  title="Aucune classe enregistrée"
                  hint="Créez d'abord une classe dans cet onglet pour générer sa liste."
                />
              ) : selectedClasses.length === 0 ? (
                <EmptyState
                  icon={<Users size={38} strokeWidth={1} />}
                  title="Sélectionnez au moins une classe"
                  hint="Cochez une classe à gauche pour générer la liste de présence correspondante."
                />
              ) : blobUrl ? (
                <div className="h-full overflow-hidden rounded-xl bg-slate-200">
                  <iframe
                    ref={frameRef}
                    src={blobUrl}
                    className="h-full w-full border-0"
                    title="Aperçu de la liste de présence"
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── Pied : récapitulatif + actions ── */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
            Basé sur <strong>liste_de_presence.pdf</strong>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={selectedClasses.length === 0 || busy}
              className="flex items-center gap-1.5 rounded-lg bg-[#0d9488] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#0f766e] disabled:cursor-not-allowed disabled:opacity-50"
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
