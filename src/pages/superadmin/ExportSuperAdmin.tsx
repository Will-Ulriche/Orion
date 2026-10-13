import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import {
  FileSpreadsheet, Download, FolderOpen, Building2, CalendarDays,
  Loader2, CheckCircle2, AlertTriangle, Layers,
} from 'lucide-react';
import { Btn, Card, Loader } from '../../components/ui';
import SuperAdminShell from './SuperAdminShell';
import { listSchools, type School } from '../../lib/superAdminApi';
import { buildExportFiles, loadAcademicYears, type AcademicYear } from '../../lib/exportSuperAdmin';

interface LogEntry {
  fileName: string;
  path: string;
}

export default function ExportSuperAdmin() {
  const [schools, setSchools] = useState<School[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);

  const [exporting, setExporting] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([listSchools(), loadAcademicYears([])])
      .then(([sch]) => {
        setSchools(sch);
        // Années : on charge uniquement via les écoles (le cloud ne les liste pas globalement).
        if (sch.length > 0) {
          return loadAcademicYears(sch.map((s) => s.id)).then((ys) => {
            setYears(ys);
          });
        }
        setYears([]);
        return undefined;
      })
      .catch((e: any) => setError(e.message ?? String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Années visibles : uniquement celles des écoles sélectionnées
  const visibleYears = useMemo(() => {
    if (selectedSchools.length === 0) return years;
    const set = new Set(selectedSchools);
    return years.filter((y) => set.has(y.school_id));
  }, [years, selectedSchools]);

  const allSchoolsSelected = selectedSchools.length === schools.length;
  const allYearsSelected = selectedYears.length === visibleYears.length && visibleYears.length > 0;

  const toggleSchool = (id: string) => {
    setSelectedSchools((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAllSchools = () => {
    setSelectedSchools(allSchoolsSelected ? [] : schools.map((s) => s.id));
  };

  const toggleYear = (id: string) => {
    setSelectedYears((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAllYears = () => {
    setSelectedYears(allYearsSelected ? [] : visibleYears.map((y) => y.id));
  };

  const schoolById = useMemo(() => new Map(schools.map((s) => [s.id, s])), [schools]);

  const handleExport = async () => {
    setError('');
    setLog([]);
    setExporting(true);
    try {
      const result = await buildExportFiles({
        schoolIds: selectedSchools,
        yearIds: selectedYears,
      });
      if (result.files.length === 0) {
        setError('Aucun fichier généré (données vides ou école sans données synchronisées).');
        return;
      }
      const entries: LogEntry[] = [];
      let done = 0;
      for (const f of result.files) {
        const path = await invoke<string>('write_download_file', {
          fileName: f.fileName,
          base64Content: f.base64,
        });
        entries.push({ fileName: f.fileName, path });
        done += 1;
        setLog([...entries]);
        await new Promise((r) => setTimeout(r, 30));
      }
      notify(`Export terminé : ${entries.length} fichier(s) Excel dans Téléchargements.`, 'success');
      const first = entries[0];
      if (first) revealItemInDir(first.path).catch(() => {});
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setError(msg);
      notify(`Échec de l'export : ${msg}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  const count = useMemo(() => {
    if (selectedSchools.length === 0) return 0;
    const set = new Set(selectedSchools);
    const selY = new Set(selectedYears);
    const yearsForSel = years.filter((y) => set.has(y.school_id) && (selY.size === 0 || selY.has(y.id)));
    // Écoles sélectionnées sans année → un fichier chacune ; sinon une fichier par (école × année)
    const withYears = new Set(yearsForSel.map((y) => y.school_id));
    const schoolsNoYear = selectedSchools.filter((id) => !withYears.has(id));
    return yearsForSel.length + schoolsNoYear.length;
  }, [selectedSchools, selectedYears, years]);

  return (
    <SuperAdminShell
      title="Export des données"
      subtitle="Téléchargez les données de tous les établissements (classes, élèves, notes, professeurs, paiements), organisées par année scolaire, au format Excel."
      icon={FileSpreadsheet}
      actions={
        <Btn variant="ghost" size="sm" onClick={load} disabled={loading || exporting}>
          <Loader2 size={13} className={loading ? 'animate-spin' : ''} />
          Actualiser
        </Btn>
      }
    >
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {log.length > 0 && !exporting && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-700">
            <CheckCircle2 size={15} /> {log.length} fichier(s) généré(s) dans Téléchargements
          </p>
          <ul className="mt-2 space-y-1 text-[12px] text-emerald-700/90">
            {log.map((l, i) => (
              <li key={i} className="flex items-center gap-2">
                <FileSpreadsheet size={12} className="shrink-0" />
                <span className="truncate font-mono">{l.fileName}</span>
                <button
                  onClick={() => revealItemInDir(l.path).catch(() => {})}
                  className="ml-auto flex cursor-pointer items-center gap-1 text-emerald-600 hover:underline flex-shrink-0"
                >
                  <FolderOpen size={12} /> Afficher
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading && !schools.length ? (
        <div className="flex h-64 items-center justify-center">
          <Loader label="Chargement des établissements…" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Sélection des établissements */}
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Building2 size={15} className="text-brand-600" />
              <h3 className="text-sm font-bold text-slate-800">Établissements</h3>
              <span className="ml-auto text-[11px] text-slate-400">
                {selectedSchools.length}/{schools.length} sélectionnés
              </span>
            </div>

            {schools.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-slate-400">Aucun établissement enregistré.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-100">
                <label className="flex cursor-pointer items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSchoolsSelected}
                    onChange={toggleAllSchools}
                    className="h-4 w-4 cursor-pointer accent-indigo-600"
                  />
                  <span className="text-[12.5px] font-semibold text-slate-700">Tout sélectionner</span>
                </label>
                {schools.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-50 px-3 py-2 hover:bg-slate-50/60 last:border-0">
                    <input
                      type="checkbox"
                      checked={selectedSchools.includes(s.id)}
                      onChange={() => toggleSchool(s.id)}
                      className="h-4 w-4 cursor-pointer accent-indigo-600"
                    />
                    <span className="text-[12.5px] text-slate-700">{s.name}</span>
                    {s.short_name && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-500">
                        {s.short_name}
                      </span>
                    )}
                    {s.city && <span className="text-[11px] text-slate-400">· {s.city}</span>}
                  </label>
                ))}
              </div>
            )}
          </Card>

          {/* Sélection des années scolaires */}
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <CalendarDays size={15} className="text-brand-600" />
              <h3 className="text-sm font-bold text-slate-800">Années scolaires</h3>
              <span className="ml-auto text-[11px] text-slate-400">
                {selectedYears.length}/{visibleYears.length} sélectionnées
              </span>
            </div>

            {visibleYears.length === 0 ? (
              <p className="flex items-center gap-2 py-6 text-center text-[13px] text-slate-400">
                <Layers size={14} /> Aucune année scolaire synchronisée pour les établissements sélectionnés.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-100">
                <label className="flex cursor-pointer items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allYearsSelected}
                    onChange={toggleAllYears}
                    className="h-4 w-4 cursor-pointer accent-indigo-600"
                  />
                  <span className="text-[12.5px] font-semibold text-slate-700">Toutes les années</span>
                </label>
                {visibleYears.map((y) => {
                  const sch = schoolById.get(y.school_id);
                  return (
                    <label key={y.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-50 px-3 py-2 hover:bg-slate-50/60 last:border-0">
                      <input
                        type="checkbox"
                        checked={selectedYears.includes(y.id)}
                        onChange={() => toggleYear(y.id)}
                        className="h-4 w-4 cursor-pointer accent-indigo-600"
                      />
                      <span className="text-[12.5px] font-medium text-slate-700">{y.name}</span>
                      <span className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Building2 size={10} /> {sch?.short_name || sch?.name || ''}
                      </span>
                      {y.is_current && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">En cours</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Résumé + action */}
          <Card className="p-5">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {selectedSchools.length === 0
                    ? 'Sélectionnez au moins un établissement'
                    : `Export : ${count} fichier${count > 1 ? 's' : ''} Excel attendu${count > 1 ? 's' : ''}`}
                </p>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  Un fichier par établissement et par année scolaire : Élèves, Classes, Matières, Enseignements, Notes, Frais, Paiements, Professeurs.
                  Les fichiers seront enregistrés dans le dossier Téléchargements.
                </p>
              </div>
              <Btn
                onClick={handleExport}
                disabled={exporting || selectedSchools.length === 0 || count === 0}
                className="flex items-center gap-2"
              >
                {exporting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Export en cours…
                  </>
                ) : (
                  <>
                    <Download size={15} />
                    Exporter en Excel
                  </>
                )}
              </Btn>
            </div>
          </Card>
        </div>
      )}
    </SuperAdminShell>
  );
}

// Mini-toast (état d'export) — évite une dépendance supplémentaire.
let toast: HTMLDivElement | null = null;
function notify(msg: string, kind: 'success' | 'error') {
  if (toast) toast.remove();
  toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = [
    'position: fixed',
    'bottom: 24px',
    'left: 50%',
    'transform: translateX(-50%)',
    'zIndex: 9999',
    'padding: 10px 18px',
    'borderRadius: 10px',
    `background: ${kind === 'success' ? '#059669' : '#dc2626'}`,
    'color: #fff',
    'fontSize: 13px',
    'fontWeight: 600',
    'boxShadow: 0 8px 24px rgba(0,0,0,0.25)',
    'animation: slideUpFade 0.2s ease',
  ].join(';');
  document.body.appendChild(toast);
  setTimeout(() => { if (toast) { toast.remove(); toast = null; } }, 4500);
}