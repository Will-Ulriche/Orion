import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import {
  CalendarDays, Download, Eye, LoaderCircle, Pencil, Search, X, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  buildTimetablePdf, loadTimetableAssets, timetableFileName,
  type TimetableAssets, type TimetableGridData,
} from "../lib/timetablePdf";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Subject {
  id: string;
  name: string;
  code: string;
  color?: string | null;
}

interface ClassItem {
  id: string;
  name: string;
}

interface TimetableSlotData {
  id: string;
  class_id: string;
  day_of_week: number;
  slot_index: number;
  subject_id: string | null;
  subject_code: string | null;
  subject_name: string | null;
}

// key: `${day}_${slot}` → subject_id or null
type GridIdState = Record<string, string | null>;

interface Props {
  schoolId: string;
  academicYearId: string;
  yearName: string;
  schoolName: string;
  classes: ClassItem[];
  onClose: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const HOUR_LABELS = ["1 H", "2 H", "3 H", "4 H", "5 H", "6H", "7H"];
const BREAK_AFTER_INDEX = 4; // grey separator after slot 4 (between 5H and 6H)

function cellKey(day: number, slot: number) {
  return `${day}_${slot}`;
}

function deaccent(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ─── Subject picker dropdown ──────────────────────────────────────────────────

function SubjectPicker({
  subjects,
  value,
  onChange,
  onClose: closePicker,
}: {
  subjects: Subject[];
  value: string | null;
  onChange: (id: string | null) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute z-50 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
      style={{ top: "calc(100% + 2px)", left: "50%", transform: "translateX(-50%)" }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="max-h-56 overflow-y-auto py-1">
        <button
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-400 hover:bg-slate-50"
          onClick={() => { onChange(null); closePicker(); }}
        >
          <span className="h-3.5 w-3.5 rounded-full border border-dashed border-slate-300 flex-shrink-0" />
          Vide
        </button>
        {subjects.map((s) => (
          <button
            key={s.id}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-violet-50 ${
              value === s.id ? "bg-violet-50 text-violet-700" : "text-slate-700"
            }`}
            onClick={() => { onChange(s.id); closePicker(); }}
          >
            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: s.color || "#a78bfa" }} />
            <span className="font-bold text-slate-800">{s.code}</span>
            <span className="truncate text-slate-400">{s.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Timetable Grid ───────────────────────────────────────────────────────────

function TimetableGrid({
  grid,
  subjects,
  saving,
  openPicker,
  onCellClick,
  onCellChange,
  onPickerClose,
}: {
  grid: GridIdState;
  subjects: Subject[];
  saving: string | null;
  openPicker: string | null;
  onCellClick: (key: string) => void;
  onCellChange: (day: number, slot: number, subjectId: string | null) => void;
  onPickerClose: () => void;
}) {
  const getSubject = (id: string | null) => subjects.find((s) => s.id === id);

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-sm select-none min-w-[600px]">
        <thead>
          <tr>
            <th className="bg-gray-100 border border-slate-300 px-2 py-2 text-center text-[11px] font-semibold text-slate-600 w-16"></th>
            {DAYS.map((d) => (
              <th key={d} className="bg-gray-100 border border-slate-300 px-2 py-2.5 text-center text-[11px] font-bold text-slate-800 uppercase tracking-wide">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOUR_LABELS.map((hour, si) => (
            <>
              {si === BREAK_AFTER_INDEX + 1 && (
                <tr key="separator">
                  <td colSpan={7} className="bg-gray-200 border border-slate-300 h-2.5 p-0" />
                </tr>
              )}
              <tr key={si}>
                {/* Hour cell — big font like the template */}
                <td className="border border-slate-300 bg-white text-center font-bold text-slate-800" style={{ fontSize: "18px", height: "56px", width: "60px" }}>
                  {hour}
                </td>
                {DAYS.map((_, di) => {
                  const key = cellKey(di + 1, si);
                  const subjId = grid[key] ?? null;
                  const subj = getSubject(subjId);
                  const isSaving = saving === key;
                  const isOpen = openPicker === key;

                  return (
                    <td key={di} className="relative border border-slate-300 p-0" style={{ height: "56px" }}>
                      <button
                        className={`w-full h-full flex items-center justify-center text-center font-bold transition-all duration-150 ${
                          isSaving ? "opacity-50 cursor-wait" : "cursor-pointer"
                        } ${subj ? "hover:brightness-90" : "hover:bg-violet-50 text-slate-200 hover:text-violet-400"}`}
                        style={subj ? { color: subj.color || "#3c3cb4", fontSize: "14px" } : { fontSize: "20px" }}
                        disabled={isSaving}
                        onMouseDown={(e) => { e.stopPropagation(); onCellClick(isOpen ? "" : key); }}
                      >
                        {isSaving ? (
                          <LoaderCircle size={12} className="animate-spin" />
                        ) : subj ? (
                          subj.code
                        ) : (
                          <span className="opacity-30">+</span>
                        )}
                      </button>
                      {isOpen && (
                        <SubjectPicker
                          subjects={subjects}
                          value={subjId}
                          onChange={(id) => onCellChange(di + 1, si, id)}
                          onClose={onPickerClose}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TimetableModal({
  schoolId,
  academicYearId,
  yearName,
  schoolName,
  classes,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grids, setGrids] = useState<Record<string, GridIdState>>({});
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [assets, setAssets] = useState<TimetableAssets | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  // Bascule entre l'éditeur de grille et l'aperçu du PDF (comme la liste nominative).
  const [view, setView] = useState<"edit" | "preview">("edit");


  // Load assets
  useEffect(() => {
    Promise.all([
      loadTimetableAssets(),
      invoke<any>("get_school_settings").catch(() => null)
    ]).then(([baseAssets, school]) => {
      if (school && school.logo_url) {
        setAssets({ ...baseAssets, logo: school.logo_url });
      } else {
        setAssets(baseAssets);
      }
    }).catch(console.error);
  }, []);

  // Load subjects once
  useEffect(() => {
    invoke<Subject[]>("get_subjects", { schoolId }).then(setSubjects).catch(() => {});
  }, [schoolId]);

  // Auto-select first class
  useEffect(() => {
    if (classes.length > 0 && !selectedClass) {
      setSelectedClass(classes[0].id);
    }
  }, [classes, selectedClass]);

  // Load grid when class changes
  useEffect(() => {
    if (!selectedClass) return;
    if (grids[selectedClass] !== undefined) return;
    setLoadingGrid(true);
    invoke<TimetableSlotData[]>("get_timetable", {
      schoolId, academicYearId, classId: selectedClass,
    })
      .then((slots) => {
        const g: GridIdState = {};
        for (const s of slots) {
          g[cellKey(s.day_of_week, s.slot_index)] = s.subject_id;
        }
        setGrids((prev) => ({ ...prev, [selectedClass]: g }));
      })
      .catch(() => { setGrids((prev) => ({ ...prev, [selectedClass]: {} })); })
      .finally(() => setLoadingGrid(false));
  }, [selectedClass, schoolId, academicYearId]);

  const currentGrid = useMemo(
    () => (selectedClass ? grids[selectedClass] ?? {} : {}),
    [grids, selectedClass]
  );

  const currentClassObj = useMemo(
    () => classes.find((c) => c.id === selectedClass),
    [classes, selectedClass]
  );

  const currentClassIndex = useMemo(
    () => classes.findIndex((c) => c.id === selectedClass),
    [classes, selectedClass]
  );

  const getSubject = useCallback(
    (id: string | null) => subjects.find((s) => s.id === id),
    [subjects]
  );

  // Build grid of codes for PDF
  const codeGrid = useMemo<TimetableGridData>(() => {
    const g: TimetableGridData = {};
    for (const key in currentGrid) {
      const subj = getSubject(currentGrid[key]);
      g[key] = subj?.code ?? "";
    }
    return g;
  }, [currentGrid, getSubject]);

  // Build PDF blob for preview
  useEffect(() => {
    if (!assets || !currentClassObj) { setBlobUrl(null); setPdfBlob(null); return; }
    try {
      const doc = buildTimetablePdf({
        className: currentClassObj.name,
        schoolName,
        yearName,
        grid: codeGrid,
        assets,
      });
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      setPdfBlob(blob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setBlobUrl(null);
      setPdfBlob(null);
    }
  }, [assets, currentClassObj, schoolName, yearName, codeGrid]);

  const filtered = useMemo(() => {
    const q = deaccent(query).trim().toLowerCase();
    if (!q) return classes;
    return classes.filter((c) => deaccent(c.name).toLowerCase().includes(q));
  }, [classes, query]);

  const handleCellChange = useCallback(
    async (day: number, slot: number, subjectId: string | null) => {
      if (!selectedClass) return;
      const key = cellKey(day, slot);
      setSavingCell(key);
      setOpenPicker(null);
      try {
        await invoke("save_timetable_slot", {
          schoolId, academicYearId, classId: selectedClass,
          dayOfWeek: day, slotIndex: slot, subjectId,
        });
        setGrids((prev) => ({
          ...prev,
          [selectedClass]: { ...(prev[selectedClass] ?? {}), [key]: subjectId },
        }));
      } catch (e) {
        console.error(e);
      } finally {
        setSavingCell(null);
      }
    },
    [selectedClass, schoolId, academicYearId]
  );

  const handleDownload = useCallback(() => {
    if (!pdfBlob) return;
    setBusy(true);
    try {
      const fileName = timetableFileName(currentClassObj?.name ?? 'classe', yearName);
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }, [pdfBlob, currentClassObj?.name, yearName]);

  // Close picker on outside click
  useEffect(() => {
    if (!openPicker) return;
    const handler = () => setOpenPicker(null);
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [openPicker]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const container = useMemo(() => document.querySelector("main") ?? document.body, []);

  return createPortal(
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Emploi du temps"
        className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-scale-in"
      >
        {/* ── Header ── */}
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <CalendarDays size={16} />
            </span>
            <div>
              <h3 className="text-[14px] font-bold text-slate-800">Emploi du temps</h3>
              <p className="text-[11px] text-slate-400">
                Aperçu avant impression · A4 paysage · {yearName}
              </p>
            </div>
          </div>
          {/* Nav arrows */}
          <div className="flex items-center gap-1 ml-auto mr-3">
            <button
              onClick={() => { const i = currentClassIndex; if (i > 0) setSelectedClass(classes[i - 1].id); }}
              disabled={currentClassIndex <= 0}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-[12px] font-semibold text-slate-600 min-w-[80px] text-center truncate">
              {currentClassObj?.name ?? "—"}
            </span>
            <button
              onClick={() => { const i = currentClassIndex; if (i < classes.length - 1) setSelectedClass(classes[i + 1].id); }}
              disabled={currentClassIndex >= classes.length - 1}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* ── Left panel ── */}
          <aside className="flex max-h-64 w-full flex-shrink-0 flex-col border-b border-slate-200 bg-slate-50 md:max-h-none md:w-72 md:border-b-0 md:border-r overflow-y-auto">
            {/* Class search */}
            <div className="flex-shrink-0 space-y-2.5 border-b border-slate-200/70 p-3">
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Rechercher une classe…"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-8 text-[12.5px] text-slate-700 outline-none transition-all placeholder:text-slate-300 hover:border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15"
                />
                {query && (
                  <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-semibold text-slate-500">Classes</span>
                <span className="text-[11px] text-slate-400">{filtered.length} / {classes.length}</span>
              </div>
            </div>

            {/* Class list */}
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
              <ul className="space-y-0.5">
                {filtered.map((c) => {
                  const on = selectedClass === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => setSelectedClass(c.id)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${on ? "bg-violet-600/10 ring-1 ring-violet-500/25" : "hover:bg-slate-100"}`}
                      >
                        <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${on ? "border-violet-600 bg-violet-600" : "border-slate-300 bg-white"}`}>
                          {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </span>
                        <span className="block truncate text-[12.5px] font-semibold text-slate-700">{c.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex-shrink-0 border-t border-slate-200/70 p-3 space-y-3">
              {/* Legend */}
              {subjects.length > 0 && (
                <div>
                  <p className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Légende matières</p>
                  <div className="space-y-0.5 max-h-28 overflow-y-auto">
                    {subjects.map((s) => (
                      <div key={s.id} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: s.color || "#a78bfa" }} />
                        <span className="font-bold">{s.code}</span>
                        <span className="text-slate-400 truncate">— {s.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* ── Right panel: Grid ── */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
              <p className="text-[12px] font-semibold text-slate-600">
                {currentClassObj ? currentClassObj.name : "Sélectionnez une classe"}
              </p>
              {savingCell && (
                <span className="flex items-center gap-1.5 text-[11px] text-violet-500">
                  <LoaderCircle size={11} className="animate-spin" />
                  Enregistrement…
                </span>
              )}
              {/* Bascule éditeur / aperçu PDF */}
              <div className="flex flex-shrink-0 items-center gap-1 rounded-xl bg-slate-100 p-0.5">
                <button
                  onClick={() => setView("edit")}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    view === "edit"
                      ? "bg-white text-violet-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Pencil size={11} />
                  Modifier
                </button>
                <button
                  onClick={() => setView("preview")}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    view === "preview"
                      ? "bg-white text-violet-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Eye size={11} />
                  Aperçu
                </button>
              </div>

            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-slate-200 p-4">
              {!assets ? (
                <div className="flex h-full flex-col items-center justify-center text-slate-400">
                  <LoaderCircle size={34} strokeWidth={1} className="mb-3 animate-spin opacity-50" />
                  <p className="text-sm">Chargement du modèle…</p>
                </div>
              ) : !selectedClass ? (
                <div className="flex h-full flex-col items-center justify-center text-slate-400">
                  <CalendarDays size={38} strokeWidth={1} className="mb-3 opacity-30" />
                  <p className="text-sm font-medium text-slate-500">Sélectionnez une classe</p>
                  <p className="mt-1 max-w-sm text-center text-[12px] text-slate-400">Choisissez une classe dans le panneau de gauche pour afficher et modifier son emploi du temps.</p>
                </div>
              ) : loadingGrid ? (
                <div className="flex h-full flex-col items-center justify-center text-violet-500">
                  <LoaderCircle size={34} strokeWidth={1} className="mb-3 animate-spin opacity-60" />
                </div>
              ) : view === "preview" ? (
                blobUrl ? (
                  <div className="relative h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    <iframe
                      ref={frameRef}
                      src={`${blobUrl}#view=FitH`}
                      className="h-full w-full border-0 bg-slate-200"
                      title="Aperçu PDF de l'emploi du temps"
                    />
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-slate-400">
                    <LoaderCircle size={34} strokeWidth={1} className="mb-3 animate-spin opacity-50" />
                    <p className="text-sm">Génération de l'aperçu…</p>
                  </div>
                )

              ) : (
                <div className="overflow-hidden rounded-xl bg-white shadow-lg border border-slate-200 relative">
                  <TimetableGrid
                    grid={currentGrid}
                    subjects={subjects}
                    saving={savingCell}
                    openPicker={openPicker}
                    onCellClick={(key) => setOpenPicker(key)}
                    onCellChange={handleCellChange}
                    onPickerClose={() => setOpenPicker(null)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <p className="text-[11px] text-slate-400">
            Format <strong className="text-slate-500">A4 paysage</strong> — cliquez sur une case pour assigner une matière.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={!selectedClass || !assets || busy || !pdfBlob}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />}
              Télécharger PDF
            </button>
          </div>
        </div>
      </div>
    </div>,
    container
  );
}
