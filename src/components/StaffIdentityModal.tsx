import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, Printer, Search, X } from 'lucide-react';
import {
  buildStaffIdentityHtml,
  saveStaffIdentityPdf,
  staffFullName,
  type StaffIdentityData,
} from '../utils/archivesPdf';
import type { ReceiptSchoolInfo } from '../lib/receiptPdf';

const norm = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Popup « Fiche d'identité » (Archives ▸ Personnel) — aperçu A4, impression, téléchargement PDF. */
export default function StaffIdentityModal({
  staffList, school, yearName, onClose, onError,
}: {
  staffList: StaffIdentityData[];
  school: ReceiptSchoolInfo;
  yearName: string;
  onClose: () => void;
  onError?: (message: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [openList, setOpenList] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(staffList[0]?.id ?? null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const selected = useMemo(
    () => staffList.find(s => s.id === selectedId) ?? null,
    [staffList, selectedId]
  );

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return staffList;
    return staffList.filter(s =>
      norm(`${s.nom ?? ''} ${s.prenoms ?? ''} ${s.matricule ?? ''} ${s.fonction ?? ''}`).includes(q)
    );
  }, [staffList, query]);

  const html = useMemo(
    () => (selected ? buildStaffIdentityHtml({ staff: selected, school, yearName }) : ''),
    [selected, school, yearName]
  );

  const blobUrl = useMemo(() => {
    if (!html) return null;
    return URL.createObjectURL(new Blob([html], { type: 'text/html; charset=utf-8' }));
  }, [html]);

  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handlePrint = () => {
    const win = frameRef.current?.contentWindow;
    if (!win) { onError?.("Impossible d'ouvrir la fenêtre d'impression."); return; }
    win.focus();
    win.print(); // @page { size: A4 } → papier A4
  };

  const handleDownload = () => {
    if (!selected) return;
    try {
      saveStaffIdentityPdf({ staff: selected, school, yearName });
    } catch (e) {
      onError?.(`Impossible de générer le PDF : ${String(e)}`);
    }
  };

  const container = useMemo(() => document.querySelector('main') ?? document.body, []);

  // Rendu dans <main> : la sidebar n'est jamais masquée par le flou.
  return createPortal(
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Fiche d'identité du personnel"
        className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-scale-in"
      >
        {/* ── En-tête : titre + recherche + fermeture ── */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <FileText size={16} />
            </span>
            <div>
              <h3 className="text-[14px] font-bold text-slate-800">Fiche d'identité du personnel</h3>
              <p className="text-[11px] text-slate-400">Aperçu avant impression · Format A4 · {yearName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Barre de recherche du personnel existant */}
            <div className="relative w-64">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setOpenList(true); }}
                onFocus={() => setOpenList(true)}
                onBlur={() => window.setTimeout(() => setOpenList(false), 120)}
                placeholder="Rechercher : nom, matricule, fonction…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-8 pr-3 text-[12.5px] text-slate-700 outline-none transition-all placeholder:text-slate-300 hover:border-slate-300 focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/15"
              />
              {openList && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                  {filtered.length === 0 ? (
                    <p className="px-3 py-3 text-center text-[12px] text-slate-400">Aucun membre trouvé.</p>
                  ) : (
                    filtered.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { setSelectedId(s.id); setQuery(''); setOpenList(false); }}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-slate-50 ${s.id === selectedId ? 'bg-[#eef2ff]' : ''}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[12.5px] font-semibold text-slate-700">{staffFullName(s)}</span>
                          <span className="block truncate text-[11px] text-slate-400">
                            {s.matricule ?? 'Sans matricule'} · {s.fonction ?? '—'}
                          </span>
                        </span>
                        {s.id === selectedId && (
                          <span className="flex-shrink-0 rounded-md bg-[#4f46e5] px-1.5 py-0.5 text-[10px] font-bold text-white">
                            Sélectionné
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              aria-label="Fermer"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Membre sélectionné ── */}
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5">
          <p className="min-w-0 truncate text-[12.5px] text-slate-600">
            {selected ? (
              <>
                <span className="font-bold text-slate-800">{staffFullName(selected)}</span>
                <span className="text-slate-400"> — {selected.matricule ?? 'sans matricule'} · {selected.fonction ?? 'fonction non renseignée'}</span>
              </>
            ) : (
              <span className="text-slate-400">Aucun membre sélectionné.</span>
            )}
          </p>
          <span className="flex-shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
            A4 · 210 × 297 mm
          </span>
        </div>

        {/* ── Aperçu du document ── */}
        <div className="min-h-0 flex-1 overflow-hidden bg-slate-200 p-4">
          {selected && blobUrl ? (
            <div className="h-full overflow-hidden rounded-xl bg-white shadow-lg">
              <iframe
                ref={frameRef}
                src={blobUrl}
                className="h-full w-full border-0 bg-white"
                title={`Aperçu — Fiche d'identité ${staffFullName(selected)}`}
              />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-slate-400">
              <FileText size={40} strokeWidth={1} className="mb-3 opacity-40" />
              <p className="text-sm">
                {staffList.length === 0
                  ? 'Aucun membre du personnel enregistré.'
                  : 'Sélectionnez un membre du personnel pour voir l’aperçu.'}
              </p>
            </div>
          )}
        </div>

        {/* ── Pied de page : impression / téléchargement ── */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <p className="text-[11px] text-slate-400">
            Le PDF est généré au format <strong className="text-slate-500">A4</strong> — utilisez <strong className="text-slate-500">Imprimer</strong> pour l'imprimer ou l'enregistrer en PDF.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={!selected}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[12px] font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer size={13} /> Imprimer
            </button>
            <button
              onClick={handleDownload}
              disabled={!selected}
              className="flex items-center gap-1.5 rounded-lg bg-[#4f46e5] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4338ca] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={13} /> Télécharger PDF
            </button>
          </div>
        </div>
      </div>
    </div>,
    container
  );
}
