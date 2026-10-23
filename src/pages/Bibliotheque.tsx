import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from '../contexts/AuthContext';
import { useYear } from '../contexts/YearContext';
import {
  AlertTriangle, BookMarked, Bookmark, CalendarClock, CheckCircle2,
  ClipboardCheck, Coins, Database, FolderTree, HandCoins,
  History, Library, Package, Pencil, Plus, RotateCcw, Settings2,
  ShieldCheck, Trash2, UserPlus, Users, XCircle,
} from 'lucide-react';
import {
  Alert, Avatar, Badge, Btn, Card, ConfirmDialog, EmptyState, Field, Kpi,
  Loader, Modal, NumberInput, PanelHeader, SearchInput, Segmented, Select,
  TableShell, Td, Th, TextInput, type Tone,
} from '../components/ui';

// ═══════════════════════════════════════════════════════════
// Types (miroir des structs Rust de src-tauri/src/models.rs)
// ═══════════════════════════════════════════════════════════

interface LibraryCategory {
  id: string; school_id: string; name: string; code: string | null;
  description: string | null; color: string | null; book_count: number;
}
interface LibraryBook {
  id: string; school_id: string; category_id: string | null; isbn: string | null;
  title: string; author: string | null; publisher: string | null;
  publication_year: number | null; language: string | null; edition: string | null;
  pages: number | null; description: string | null; shelf_location: string | null;
  is_reference: boolean; category_name: string | null; copy_count: number;
  available_count: number;
}
interface LibraryCopy {
  id: string; school_id: string; book_id: string; inventory_code: string;
  barcode: string | null; status: string; condition: string | null;
  acquisition_date: string | null; acquisition_source: string | null;
  price: number | null; location: string | null; notes: string | null;
  book_title: string | null; book_author: string | null; reader_name: string | null;
  due_date: string | null;
}
interface LibraryReader {
  id: string; school_id: string; reader_type: string; student_id: string | null;
  staff_id: string | null; full_name: string; email: string | null;
  phone: string | null; card_number: string; class_name: string | null;
  max_loans: number; status: string; registered_at: string | null;
  expires_at: string | null; notes: string | null; active_loans: number;
  unpaid_penalties: number;
}
interface LibraryLoan {
  id: string; school_id: string; copy_id: string; reader_id: string;
  book_id: string; loan_date: string; due_date: string; returned_at: string | null;
  status: string; loan_condition: string | null; notes: string | null;
  created_by: string | null; book_title: string | null; book_author: string | null;
  inventory_code: string | null; reader_name: string | null;
  reader_type: string | null; late_days: number; fine_amount: number;
}
interface LibraryReturn {
  id: string; school_id: string; loan_id: string; copy_id: string;
  reader_id: string; returned_at: string; loan_condition: string | null;
  late_days: number; fine_amount: number; remarks: string | null;
  handled_by: string | null; book_title: string | null;
  inventory_code: string | null; reader_name: string | null;
}
interface LibraryPenalty {
  id: string; school_id: string; reader_id: string; loan_id: string | null;
  penalty_type: string; amount: number; days_late: number;
  description: string | null; status: string; paid_at: string | null;
  reader_name: string | null; reader_type: string | null; book_title: string | null;
}
interface LibraryReservation {
  id: string; school_id: string; book_id: string; reader_id: string;
  reserved_at: string; available_at: string | null; expires_at: string | null;
  status: string; queue_position: number; notified_at: string | null;
  fulfilled_at: string | null; loan_id: string | null; book_title: string | null;
  book_author: string | null; reader_name: string | null;
  reader_type: string | null; available_copies: number;
}
interface LibrarySettings {
  id: string; school_id: string; loan_duration_days: number;
  max_loans_per_reader: number; fine_per_day: number; grace_days: number;
  reservation_expiry_days: number;
}
interface LibraryDashboard {
  total_books: number; total_copies: number; available_copies: number;
  loaned_copies: number; lost_copies: number; maintenance_copies: number;
  total_readers: number; active_readers: number; active_loans: number;
  overdue_loans: number; pending_reservations: number; unpaid_penalties: number;
  unpaid_penalty_amount: number;
}
interface StudentLite {
  id: string; student_id: string; first_name: string | null;
  last_name: string | null; matricule: string | null; class_name: string | null;
}

// ═══════════════════════════════════════════════════════════
// Helpers d'affichage
// ═══════════════════════════════════════════════════════════

const COPY_STATUS: Record<string, { tone: Tone; label: string }> = {
  DISPONIBLE: { tone: 'emerald', label: 'Disponible' },
  EMPREINTE: { tone: 'blue', label: 'Emprunté' },
  PERDU: { tone: 'red', label: 'Perdu' },
  MAINTENANCE: { tone: 'amber', label: 'Maintenance' },
  RETRAITE: { tone: 'slate', label: 'Retiré' },
};

const LOAN_STATUS: Record<string, { tone: Tone; label: string }> = {
  EN_COURS: { tone: 'blue', label: 'En cours' },
  RETOURNE: { tone: 'emerald', label: 'Retourné' },
  RETARD: { tone: 'red', label: 'En retard' },
  PROLONGE: { tone: 'violet', label: 'Prolongé' },
};

const PENALTY_STATUS: Record<string, { tone: Tone; label: string }> = {
  EN_ATTENTE: { tone: 'amber', label: 'En attente' },
  PAYEE: { tone: 'emerald', label: 'Payée' },
  REMISEE: { tone: 'slate', label: 'Remise' },
};

const RESERVATION_STATUS: Record<string, { tone: Tone; label: string }> = {
  EN_ATTENTE: { tone: 'amber', label: 'En attente' },
  DISPONIBLE: { tone: 'blue', label: 'Disponible' },
  SATISFAITE: { tone: 'emerald', label: 'Satisfaite' },
  ANNULEE: { tone: 'slate', label: 'Annulée' },
  EXPIREE: { tone: 'red', label: 'Expirée' },
};

const READER_TYPE: Record<string, { tone: Tone; label: string }> = {
  ELEVE: { tone: 'brand', label: 'Élève' },
  PERSONNEL: { tone: 'violet', label: 'Personnel' },
  EXTERNE: { tone: 'slate', label: 'Externe' },
};

const PENALTY_TYPE: Record<string, string> = {
  RETARD: 'Retard',
  PERTE: 'Perte',
  DEGRADATION: 'Dégradation',
  AUTRE: 'Autre',
};

const fmtDate = (v: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const fmtMoney = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} FCFA`;

const todayIso = () => new Date().toISOString().slice(0, 10);

const badge = (map: Record<string, { tone: Tone; label: string }>, key: string) => {
  const item = map[key] ?? { tone: 'slate' as Tone, label: key };
  return <Badge tone={item.tone}>{item.label}</Badge>;
};

// ═══════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════

type Tab = 'catalogue' | 'categories' | 'exemplaires' | 'lecteurs' | 'emprunts' | 'penalites' | 'reservations';

export default function Bibliotheque() {
  const { schoolId } = useAuth();
  const { selectedYear } = useYear();
  const [tab, setTab] = useState<Tab>('catalogue');
  const [dash, setDash] = useState<LibraryDashboard | null>(null);
  const [settings, setSettings] = useState<LibrarySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [confirmSeed, setConfirmSeed] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(async () => {
    if (!schoolId) return;
    try {
      const [d, s] = await Promise.all([
        invoke<LibraryDashboard>('get_library_dashboard', { schoolId }),
        invoke<LibrarySettings>('get_library_settings', { schoolId }),
      ]);
      setDash(d);
      setSettings(s);
      setError('');
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => { reload(); }, [reload, refreshKey]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await invoke<LibraryDashboard>('seed_library_demo_data', { schoolId });
      setConfirmSeed(false);
      setNotice('Jeu de démonstration inséré : catalogue, exemplaires, lecteurs, emprunts, pénalités et réservations.');
      setRefreshKey(k => k + 1);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setSeeding(false);
    }
  };

  const TABS: { value: Tab; label: string; icon: any; count?: number }[] = [
    { value: 'catalogue', label: 'Catalogue', icon: BookMarked, count: dash?.total_books },
    { value: 'categories', label: 'Catégories', icon: FolderTree },
    { value: 'exemplaires', label: 'Exemplaires', icon: Package, count: dash?.total_copies },
    { value: 'lecteurs', label: 'Lecteurs', icon: Users, count: dash?.total_readers },
    { value: 'emprunts', label: 'Emprunts', icon: ClipboardCheck, count: dash?.active_loans },
    { value: 'penalites', label: 'Retards & pénalités', icon: HandCoins, count: dash?.unpaid_penalties },
    { value: 'reservations', label: 'Réservations', icon: Bookmark, count: dash?.pending_reservations },
  ];

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="shrink-0 border-b border-slate-200/80 bg-white px-5 py-4 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-brand">
              <Library size={21} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-800">Bibliothèque</h1>
              <p className="text-[12px] text-slate-500">
                Catalogue, exemplaires, lecteurs, emprunts, retards et réservations
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="secondary" size="sm" onClick={() => setShowSettings(true)}>
              <Settings2 size={15} /> Paramètres
            </Btn>
            <Btn variant="secondary" size="sm" onClick={() => setRefreshKey(k => k + 1)}>
              <RotateCcw size={15} /> Actualiser
            </Btn>
            <Btn variant="primary" size="sm" onClick={() => setConfirmSeed(true)}>
              <Database size={15} /> Insérer des données
            </Btn>
          </div>
        </div>

        {dash && (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Kpi icon={BookMarked} label="Ouvrages" value={dash.total_books} tone="brand" compact />
            <Kpi icon={Package} label="Exemplaires" value={dash.total_copies} tone="slate" compact />
            <Kpi icon={CheckCircle2} label="Disponibles" value={dash.available_copies} tone="emerald" compact />
            <Kpi icon={Users} label="Lecteurs" value={dash.total_readers} tone="violet" compact />
            <Kpi icon={ClipboardCheck} label="Emprunts actifs" value={dash.active_loans} tone="blue" compact />
            <Kpi icon={AlertTriangle} label="Retards" value={dash.overdue_loans} tone="red" compact />
            <Kpi icon={HandCoins} label="Pénalités" value={fmtMoney(dash.unpaid_penalty_amount)} tone="amber" compact />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={TABS.map(t => ({ value: t.value, label: t.label, icon: t.icon, count: t.count }))}
          />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:px-8">
        {error && <Alert tone="error" message={error} onClose={() => setError('')} />}
        {notice && <Alert tone="success" message={notice} onClose={() => setNotice('')} />}

        {loading ? (
          <Loader label="Chargement de la bibliothèque…" />
        ) : (
          <>
            {tab === 'catalogue' && (
              <TabCatalogue
                schoolId={schoolId}
                yearId={selectedYear?.id ?? ''}
                onChanged={() => setRefreshKey(k => k + 1)}
                onError={setError}
                onNotice={setNotice}
              />
            )}
            {tab === 'categories' && (
              <TabCategories
                schoolId={schoolId}
                onChanged={() => setRefreshKey(k => k + 1)}
                onError={setError}
              />
            )}
            {tab === 'exemplaires' && (
              <TabExemplaires
                schoolId={schoolId}
                onChanged={() => setRefreshKey(k => k + 1)}
                onError={setError}
              />
            )}
            {tab === 'lecteurs' && (
              <TabLecteurs
                schoolId={schoolId}
                yearId={selectedYear?.id ?? ''}
                onChanged={() => setRefreshKey(k => k + 1)}
                onError={setError}
              />
            )}
            {tab === 'emprunts' && (
              <TabEmprunts
                schoolId={schoolId}
                settings={settings}
                onChanged={() => setRefreshKey(k => k + 1)}
                onError={setError}
                onNotice={setNotice}
              />
            )}
            {tab === 'penalites' && (
              <TabPenalties
                schoolId={schoolId}
                onChanged={() => setRefreshKey(k => k + 1)}
                onError={setError}
              />
            )}
            {tab === 'reservations' && (
              <TabReservations
                schoolId={schoolId}
                onChanged={() => setRefreshKey(k => k + 1)}
                onError={setError}
                onNotice={setNotice}
              />
            )}
          </>
        )}
      </main>

      {showSettings && settings && (
        <ModalSettings
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={(s) => {
            setSettings(s);
            setShowSettings(false);
            setNotice('Paramètres de la bibliothèque enregistrés.');
            setRefreshKey(k => k + 1);
          }}
          onError={setError}
        />
      )}

      {confirmSeed && (
        <ConfirmDialog
          title="Insérer le jeu de démonstration"
          message="Cette action remplace toutes les données de la bibliothèque de cet établissement (catalogue, exemplaires, lecteurs, emprunts, retours, pénalités et réservations) par un jeu cohérent de démonstration. Continuer ?"
          confirmLabel="Insérer les données"
          onConfirm={handleSeed}
          onCancel={() => setConfirmSeed(false)}
        />
      )}
      {seeding && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
          <Loader label="Insertion des données de démonstration…" />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ONGLET — CATALOGUE
// ═══════════════════════════════════════════════════════════

interface BookForm {
  title: string; author: string; publisher: string; isbn: string;
  publication_year: string; pages: string; category_id: string;
  shelf_location: string; description: string; language: string;
  edition: string; is_reference: boolean;
}

const emptyBook = (): BookForm => ({
  title: '', author: '', publisher: '', isbn: '', publication_year: '',
  pages: '', category_id: '', shelf_location: '', description: '',
  language: 'Français', edition: '', is_reference: false,
});

function TabCatalogue({
  schoolId, onChanged, onError, onNotice,
}: {
  schoolId: string; yearId: string;
  onChanged: () => void; onError: (m: string) => void; onNotice: (m: string) => void;
}) {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [categories, setCategories] = useState<LibraryCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [modal, setModal] = useState<'book' | 'copies' | null>(null);
  const [editing, setEditing] = useState<LibraryBook | null>(null);
  const [form, setForm] = useState<BookForm>(emptyBook());
  const [copiesBook, setCopiesBook] = useState<LibraryBook | null>(null);
  const [copiesQty, setCopiesQty] = useState('1');
  const [copiesPrefix, setCopiesPrefix] = useState('BIB');
  const [copiesCondition, setCopiesCondition] = useState('Bon');
  const [copiesPrice, setCopiesPrice] = useState('');
  const [copiesSource, setCopiesSource] = useState('Achat');
  const [confirmDelete, setConfirmDelete] = useState<LibraryBook | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, c] = await Promise.all([
        invoke<LibraryBook[]>('get_library_books', {
          schoolId,
          categoryId: categoryFilter || null,
          search: search || null,
        }),
        invoke<LibraryCategory[]>('get_library_categories', { schoolId }),
      ]);
      setBooks(b);
      setCategories(c);
    } catch (e: any) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  }, [schoolId, categoryFilter, search]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyBook());
    setModal('book');
  };

  const openEdit = (b: LibraryBook) => {
    setEditing(b);
    setForm({
      title: b.title, author: b.author ?? '', publisher: b.publisher ?? '',
      isbn: b.isbn ?? '', publication_year: b.publication_year?.toString() ?? '',
      pages: b.pages?.toString() ?? '', category_id: b.category_id ?? '',
      shelf_location: b.shelf_location ?? '', description: b.description ?? '',
      language: b.language ?? 'Français', edition: b.edition ?? '',
      is_reference: b.is_reference,
    });
    setModal('book');
  };

  const save = async () => {
    if (!form.title.trim()) { onError('Le titre de l’ouvrage est obligatoire.'); return; }
    const args = {
      schoolId,
      categoryId: form.category_id || null,
      isbn: form.isbn || null,
      title: form.title.trim(),
      author: form.author || null,
      publisher: form.publisher || null,
      publicationYear: form.publication_year ? parseInt(form.publication_year, 10) : null,
      language: form.language || null,
      edition: form.edition || null,
      pages: form.pages ? parseInt(form.pages, 10) : null,
      description: form.description || null,
      shelfLocation: form.shelf_location || null,
      isReference: form.is_reference,
    };
    try {
      if (editing) {
        await invoke('update_library_book', { id: editing.id, ...args });
        onNotice('Ouvrage mis à jour.');
      } else {
        await invoke('create_library_book', args);
        onNotice('Ouvrage ajouté au catalogue.');
      }
      setModal(null);
      setEditing(null);
      load();
      onChanged();
    } catch (e: any) {
      onError(String(e));
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      await invoke('delete_library_book', { id: confirmDelete.id, schoolId });
      setConfirmDelete(null);
      onNotice('Ouvrage supprimé.');
      load();
      onChanged();
    } catch (e: any) {
      onError(String(e));
      setConfirmDelete(null);
    }
  };

  const saveCopies = async () => {
    if (!copiesBook) return;
    const qty = parseInt(copiesQty, 10);
    if (!qty || qty < 1) { onError('Le nombre d’exemplaires doit être supérieur à zéro.'); return; }
    try {
      await invoke('create_library_copies', {
        schoolId,
        bookId: copiesBook.id,
        quantity: qty,
        codePrefix: copiesPrefix || null,
        condition: copiesCondition || null,
        acquisitionDate: todayIso(),
        acquisitionSource: copiesSource || null,
        price: copiesPrice ? parseFloat(copiesPrice) : null,
        location: null,
      });
      setModal(null);
      setCopiesBook(null);
      onNotice(`${qty} exemplaire(s) ajouté(s) à l’inventaire.`);
      load();
      onChanged();
    } catch (e: any) {
      onError(String(e));
    }
  };

  if (loading) return <Loader label="Chargement du catalogue…" />;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Titre, auteur, ISBN…" className="w-full max-w-xs" />
            <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full max-w-xs">
              <option value="">Toutes les catégories</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.book_count})</option>
              ))}
            </Select>
          </div>
          <Btn variant="primary" onClick={openCreate}>
            <Plus size={15} /> Nouvel ouvrage
          </Btn>
        </div>
      </Card>

      {books.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="Aucun ouvrage au catalogue"
          description="Ajoutez un premier ouvrage ou insérez le jeu de démonstration pour explorer le module."
          action={<Btn variant="primary" onClick={openCreate}><Plus size={15} /> Nouvel ouvrage</Btn>}
        />
      ) : (
        <TableShell>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[12px]">
              <thead className="border-b border-slate-200">
                <tr>
                  <Th>Titre</Th><Th>Catégorie</Th><Th>Auteur</Th><Th>Année</Th>
                  <Th>Exemplaires</Th><Th>Disponibles</Th><Th>État</Th><Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {books.map(b => (
                  <tr key={b.id} className="transition-colors hover:bg-slate-50/70">
                    <Td>
                      <p className="font-semibold text-slate-800">{b.title}</p>
                      <p className="text-[11px] text-slate-400">
                        {b.isbn ? `ISBN ${b.isbn}` : 'ISBN non renseigné'}
                        {b.shelf_location ? ` · ${b.shelf_location}` : ''}
                      </p>
                    </Td>
                    <Td>{b.category_name ?? <span className="text-slate-300">—</span>}</Td>
                    <Td>{b.author ?? '—'}</Td>
                    <Td>{b.publication_year ?? '—'}</Td>
                    <Td className="tabular-nums">{b.copy_count}</Td>
                    <Td className="tabular-nums">
                      <span className={b.available_count > 0 ? 'font-semibold text-emerald-600' : 'text-slate-400'}>
                        {b.available_count}
                      </span>
                    </Td>
                    <Td>{b.is_reference ? <Badge tone="violet">Référence</Badge> : <Badge tone="slate">Prêt</Badge>}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Btn variant="ghost" size="sm" onClick={() => {
                          setCopiesBook(b); setCopiesQty('1'); setCopiesPrefix('BIB');
                          setCopiesCondition('Bon'); setCopiesPrice(''); setCopiesSource('Achat');
                          setModal('copies');
                        }}>
                          <Package size={14} /> Exemplaires
                        </Btn>
                        <Btn variant="ghost" size="sm" onClick={() => openEdit(b)}>
                          <Pencil size={14} />
                        </Btn>
                        <Btn variant="ghost" size="sm" className="text-red-500" onClick={() => setConfirmDelete(b)}>
                          <Trash2 size={14} />
                        </Btn>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableShell>
      )}

      {modal === 'book' && (
        <Modal
          title={editing ? 'Modifier l’ouvrage' : 'Nouvel ouvrage'}
          description="Un ouvrage est la notice bibliographique ; ses exemplaires physiques sont gérés dans l’inventaire."
          onClose={() => { setModal(null); setEditing(null); }}
          footer={
            <>
              <Btn onClick={() => { setModal(null); setEditing(null); }}>Annuler</Btn>
              <Btn variant="primary" onClick={save}>
                <CheckCircle2 size={15} /> Enregistrer
              </Btn>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Titre" required className="sm:col-span-2">
              <TextInput value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Titre de l’ouvrage" />
            </Field>
            <Field label="Auteur">
              <TextInput value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} />
            </Field>
            <Field label="Éditeur">
              <TextInput value={form.publisher} onChange={e => setForm({ ...form, publisher: e.target.value })} />
            </Field>
            <Field label="ISBN">
              <TextInput value={form.isbn} onChange={e => setForm({ ...form, isbn: e.target.value })} placeholder="978-2-..." />
            </Field>
            <Field label="Année de publication">
              <NumberInput value={form.publication_year} onChange={e => setForm({ ...form, publication_year: e.target.value })} placeholder="2020" />
            </Field>
            <Field label="Nombre de pages">
              <NumberInput value={form.pages} onChange={e => setForm({ ...form, pages: e.target.value })} placeholder="320" />
            </Field>
            <Field label="Catégorie">
              <Select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                <option value="">— Sans catégorie —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Langue">
              <TextInput value={form.language} onChange={e => setForm({ ...form, language: e.target.value })} />
            </Field>
            <Field label="Édition">
              <TextInput value={form.edition} onChange={e => setForm({ ...form, edition: e.target.value })} placeholder="2e édition" />
            </Field>
            <Field label="Emplacement (rayonnage)">
              <TextInput value={form.shelf_location} onChange={e => setForm({ ...form, shelf_location: e.target.value })} placeholder="A-12" />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-[13px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10"
              />
            </Field>
            <div className="sm:col-span-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
              <input
                id="book-is-reference"
                type="checkbox"
                checked={form.is_reference}
                onChange={e => setForm({ ...form, is_reference: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="book-is-reference" className="text-[12px] font-medium text-slate-700">
                Ouvrage de référence (consultation sur place, non prêté)
              </label>
            </div>
          </div>
        </Modal>
      )}

      {modal === 'copies' && copiesBook && (
        <Modal
          title="Ajouter des exemplaires"
          description={`Nouveaux exemplaires physiques pour « ${copiesBook.title} ».`}
          onClose={() => setModal(null)}
          footer={
            <>
              <Btn onClick={() => setModal(null)}>Annuler</Btn>
              <Btn variant="primary" onClick={saveCopies}>
                <Package size={15} /> Ajouter à l’inventaire
              </Btn>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nombre d’exemplaires" required>
              <NumberInput value={copiesQty} onChange={e => setCopiesQty(e.target.value)} min={1} />
            </Field>
            <Field label="Préfixe du code d’inventaire" hint="Les codes sont générés automatiquement : BIB-0001…">
              <TextInput value={copiesPrefix} onChange={e => setCopiesPrefix(e.target.value)} />
            </Field>
            <Field label="État">
              <Select value={copiesCondition} onChange={e => setCopiesCondition(e.target.value)}>
                {['Neuf', 'Bon', 'Correct', 'Dégradé', 'À réparer'].map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Source d’acquisition">
              <TextInput value={copiesSource} onChange={e => setCopiesSource(e.target.value)} />
            </Field>
            <Field label="Prix unitaire" className="sm:col-span-2">
              <NumberInput value={copiesPrice} onChange={e => setCopiesPrice(e.target.value)} placeholder="0" />
            </Field>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Supprimer l’ouvrage"
          message={`« ${confirmDelete.title} » et ses exemplaires non prêtés seront supprimés. Confirmer ?`}
          confirmLabel="Supprimer"
          onConfirm={remove}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ONGLET — CATÉGORIES
// ═══════════════════════════════════════════════════════════

function TabCategories({
  schoolId, onChanged, onError,
}: {
  schoolId: string; onChanged: () => void; onError: (m: string) => void;
}) {
  const [categories, setCategories] = useState<LibraryCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<LibraryCategory | null>(null);
  const [form, setForm] = useState({ name: '', code: '', description: '', color: '#6366f1' });
  const [confirmDelete, setConfirmDelete] = useState<LibraryCategory | null>(null);

  const load = useCallback(async () => {
    try {
      setCategories(await invoke<LibraryCategory[]>('get_library_categories', { schoolId }));
    } catch (e: any) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name.trim()) { onError('Le nom de la catégorie est obligatoire.'); return; }
    const args = {
      schoolId,
      name: form.name.trim(),
      code: form.code || null,
      description: form.description || null,
      color: form.color || null,
    };
    try {
      if (editing) {
        await invoke('update_library_category', { id: editing.id, ...args });
      } else {
        await invoke('create_library_category', args);
      }
      setModal(false);
      setEditing(null);
      load();
      onChanged();
    } catch (e: any) {
      onError(String(e));
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      await invoke('delete_library_category', { id: confirmDelete.id, schoolId });
      setConfirmDelete(null);
      load();
      onChanged();
    } catch (e: any) {
      onError(String(e));
      setConfirmDelete(null);
    }
  };

  if (loading) return <Loader label="Chargement des catégories…" />;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <PanelHeader
          title="Catégories de classement"
          subtitle="Classement du catalogue (sciences, littérature, informatique…)."
          icon={FolderTree}
        />
        <Btn variant="primary" onClick={() => {
          setEditing(null);
          setForm({ name: '', code: '', description: '', color: '#6366f1' });
          setModal(true);
        }}>
          <Plus size={15} /> Nouvelle catégorie
        </Btn>
      </Card>

      {categories.length === 0 ? (
        <EmptyState icon={FolderTree} title="Aucune catégorie" description="Créez une catégorie pour classer les ouvrages." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map(c => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
                    style={{ backgroundColor: c.color || '#6366f1' }}
                  >
                    <FolderTree size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-slate-800">{c.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {c.code ? `${c.code} · ` : ''}{c.book_count} ouvrage(s)
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Btn variant="ghost" size="sm" onClick={() => {
                    setEditing(c);
                    setForm({
                      name: c.name, code: c.code ?? '', description: c.description ?? '',
                      color: c.color ?? '#6366f1',
                    });
                    setModal(true);
                  }}>
                    <Pencil size={14} />
                  </Btn>
                  <Btn variant="ghost" size="sm" className="text-red-500" onClick={() => setConfirmDelete(c)}>
                    <Trash2 size={14} />
                  </Btn>
                </div>
              </div>
              {c.description && <p className="mt-3 text-[12px] leading-relaxed text-slate-500">{c.description}</p>}
            </Card>
          ))}
        </div>
      )}

      {modal && (
        <Modal
          title={editing ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
          onClose={() => setModal(false)}
          footer={
            <>
              <Btn onClick={() => setModal(false)}>Annuler</Btn>
              <Btn variant="primary" onClick={save}><CheckCircle2 size={15} /> Enregistrer</Btn>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Nom" required>
              <TextInput value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Sciences" />
            </Field>
            <Field label="Code">
              <TextInput value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="SCI" />
            </Field>
            <Field label="Description">
              <TextInput value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Couleur">
              <input
                type="color"
                value={form.color}
                onChange={e => setForm({ ...form, color: e.target.value })}
                className="h-10 w-20 cursor-pointer rounded-xl border border-slate-200 bg-white"
              />
            </Field>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Supprimer la catégorie"
          message={`« ${confirmDelete.name} » sera supprimée. Les ouvrages rattachés resteront au catalogue sans catégorie.`}
          confirmLabel="Supprimer"
          onConfirm={remove}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ONGLET — EXEMPLAIRES & INVENTAIRE
// ═══════════════════════════════════════════════════════════

function TabExemplaires({
  schoolId, onChanged, onError,
}: {
  schoolId: string; onChanged: () => void; onError: (m: string) => void;
}) {
  const [copies, setCopies] = useState<LibraryCopy[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<LibraryCopy | null>(null);
  const [form, setForm] = useState({ status: '', condition: '', barcode: '', location: '', notes: '', acquisition_source: '', price: '' });
  const [confirmDelete, setConfirmDelete] = useState<LibraryCopy | null>(null);

  const load = useCallback(async () => {
    try {
      setCopies(await invoke<LibraryCopy[]>('get_library_copies', {
        schoolId, bookId: null, status: status || null, search: search || null,
      }));
    } catch (e: any) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  }, [schoolId, search, status]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    try {
      await invoke('update_library_copy', {
        id: editing.id,
        schoolId,
        status: form.status || null,
        condition: form.condition || null,
        barcode: form.barcode || null,
        acquisitionDate: null,
        acquisitionSource: form.acquisition_source || null,
        price: form.price ? parseFloat(form.price) : null,
        location: form.location || null,
        notes: form.notes || null,
      });
      setModal(false);
      setEditing(null);
      load();
      onChanged();
    } catch (e: any) {
      onError(String(e));
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      await invoke('delete_library_copy', { id: confirmDelete.id, schoolId });
      setConfirmDelete(null);
      load();
      onChanged();
    } catch (e: any) {
      onError(String(e));
      setConfirmDelete(null);
    }
  };

  if (loading) return <Loader label="Chargement de l’inventaire…" />;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Titre, code d’inventaire…" className="w-full max-w-xs" />
          <Select value={status} onChange={e => setStatus(e.target.value)} className="w-full max-w-56">
            <option value="">Tous les états</option>
            {Object.entries(COPY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        <PanelHeader title="Exemplaires & inventaire" subtitle="Chaque exemplaire physique porte un code d’inventaire unique." icon={Package} />
      </Card>

      {copies.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Aucun exemplaire"
          description="Les exemplaires se créent depuis l’onglet Catalogue, à partir d’un ouvrage."
        />
      ) : (
        <TableShell>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[12px]">
              <thead className="border-b border-slate-200">
                <tr>
                  <Th>Code</Th><Th>Ouvrage</Th><Th>État</Th><Th>Condition</Th>
                  <Th>Emplacement</Th><Th>Acquisition</Th><Th>Prix</Th><Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {copies.map(c => (
                  <tr key={c.id} className="transition-colors hover:bg-slate-50/70">
                    <Td className="font-mono text-[11px] font-semibold text-slate-700">{c.inventory_code}</Td>
                    <Td>
                      <p className="font-semibold text-slate-800">{c.book_title ?? '—'}</p>
                      {c.book_author && <p className="text-[11px] text-slate-400">{c.book_author}</p>}
                    </Td>
                    <Td>{badge(COPY_STATUS, c.status)}</Td>
                    <Td>{c.condition ?? '—'}</Td>
                    <Td>{c.location ?? '—'}</Td>
                    <Td>
                      <p>{fmtDate(c.acquisition_date)}</p>
                      {c.acquisition_source && <p className="text-[11px] text-slate-400">{c.acquisition_source}</p>}
                    </Td>
                    <Td className="tabular-nums">{c.price != null ? fmtMoney(c.price) : '—'}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Btn variant="ghost" size="sm" onClick={() => {
                          setEditing(c);
                          setForm({
                            status: c.status, condition: c.condition ?? '', barcode: c.barcode ?? '',
                            location: c.location ?? '', notes: c.notes ?? '',
                            acquisition_source: c.acquisition_source ?? '',
                            price: c.price != null ? String(c.price) : '',
                          });
                          setModal(true);
                        }}>
                          <Pencil size={14} />
                        </Btn>
                        <Btn variant="ghost" size="sm" className="text-red-500" onClick={() => setConfirmDelete(c)}>
                          <Trash2 size={14} />
                        </Btn>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableShell>
      )}

      {modal && editing && (
        <Modal
          title={`Exemplaire ${editing.inventory_code}`}
          description={editing.book_title ?? undefined}
          onClose={() => setModal(false)}
          footer={
            <>
              <Btn onClick={() => setModal(false)}>Annuler</Btn>
              <Btn variant="primary" onClick={save}><CheckCircle2 size={15} /> Enregistrer</Btn>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="État" hint="Un exemplaire prêté ne peut pas changer d’état manuellement.">
              <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {Object.entries(COPY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </Field>
            <Field label="Condition">
              <Select value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })}>
                <option value="">—</option>
                {['Neuf', 'Bon', 'Correct', 'Dégradé', 'À réparer'].map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Code-barres">
              <TextInput value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} />
            </Field>
            <Field label="Emplacement">
              <TextInput value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
            </Field>
            <Field label="Source d’acquisition">
              <TextInput value={form.acquisition_source} onChange={e => setForm({ ...form, acquisition_source: e.target.value })} />
            </Field>
            <Field label="Prix">
              <NumberInput value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <TextInput value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Supprimer l’exemplaire"
          message={`L’exemplaire ${confirmDelete.inventory_code} sera définitivement retiré de l’inventaire.`}
          confirmLabel="Supprimer"
          onConfirm={remove}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ONGLET — LECTEURS
// ═══════════════════════════════════════════════════════════

function TabLecteurs({
  schoolId, yearId, onChanged, onError,
}: {
  schoolId: string; yearId: string;
  onChanged: () => void; onError: (m: string) => void;
}) {
  const [readers, setReaders] = useState<LibraryReader[]>([]);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [modal, setModal] = useState<'form' | 'register' | null>(null);
  const [editing, setEditing] = useState<LibraryReader | null>(null);
  const [form, setForm] = useState({
    full_name: '', reader_type: 'ELEVE', email: '', phone: '', card_number: '',
    class_name: '', max_loans: '3', status: 'ACTIF', notes: '', student_id: '',
  });
  const [studentChoice, setStudentChoice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<LibraryReader | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await invoke<LibraryReader[]>('get_library_readers', {
        schoolId, search: search || null, readerType: typeFilter || null,
      });
      setReaders(r);
      if (yearId) {
        try {
          const s = await invoke<StudentLite[]>('get_students', {
            schoolId, academicYearId: yearId, classId: null, includePhotos: false,
          });
          setStudents(s);
        } catch { /* liste d'élèves indisponible : la saisie manuelle reste possible */ }
      }
    } catch (e: any) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  }, [schoolId, search, typeFilter, yearId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.full_name.trim()) { onError('Le nom du lecteur est obligatoire.'); return; }
    const args = {
      schoolId,
      readerType: form.reader_type,
      studentId: form.student_id || null,
      staffId: null,
      fullName: form.full_name.trim(),
      email: form.email || null,
      phone: form.phone || null,
      cardNumber: form.card_number || null,
      className: form.class_name || null,
      maxLoans: parseInt(form.max_loans, 10) || 3,
      status: form.status,
      notes: form.notes || null,
    };
    try {
      if (editing) {
        await invoke('update_library_reader', {
          id: editing.id,
          schoolId,
          readerType: form.reader_type,
          fullName: form.full_name.trim(),
          email: form.email || null,
          phone: form.phone || null,
          cardNumber: form.card_number || null,
          className: form.class_name || null,
          maxLoans: parseInt(form.max_loans, 10) || 3,
          status: form.status,
          expiresAt: null,
          notes: form.notes || null,
        });
      } else {
        await invoke('create_library_reader', args);
      }
      setModal(null);
      setEditing(null);
      load();
      onChanged();
    } catch (e: any) {
      onError(String(e));
    }
  };

  const registerStudent = async () => {
    if (!studentChoice) { onError('Sélectionnez un élève.'); return; }
    try {
      await invoke('register_student_as_reader', { schoolId, studentId: studentChoice });
      setModal(null);
      setStudentChoice('');
      load();
      onChanged();
    } catch (e: any) {
      onError(String(e));
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      await invoke('delete_library_reader', { id: confirmDelete.id, schoolId });
      setConfirmDelete(null);
      load();
      onChanged();
    } catch (e: any) {
      onError(String(e));
      setConfirmDelete(null);
    }
  };

  if (loading) return <Loader label="Chargement des lecteurs…" />;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Nom, carte…" className="w-full max-w-xs" />
          <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="w-full max-w-48">
            <option value="">Tous les types</option>
            {Object.entries(READER_TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn variant="secondary" onClick={() => setModal('register')}>
            <UserPlus size={15} /> Inscrire un élève
          </Btn>
          <Btn variant="primary" onClick={() => {
            setEditing(null);
            setForm({
              full_name: '', reader_type: 'ELEVE', email: '', phone: '', card_number: '',
              class_name: '', max_loans: '3', status: 'ACTIF', notes: '', student_id: '',
            });
            setModal('form');
          }}>
            <Plus size={15} /> Nouveau lecteur
          </Btn>
        </div>
      </Card>

      {readers.length === 0 ? (
        <EmptyState icon={Users} title="Aucun lecteur" description="Inscrivez des élèves ou créez des fiches de lecteurs (personnel, externes)." />
      ) : (
        <TableShell>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[12px]">
              <thead className="border-b border-slate-200">
                <tr>
                  <Th>Lecteur</Th><Th>Type</Th><Th>Carte</Th><Th>Classe</Th>
                  <Th>Emprunts</Th><Th>Pénalités</Th><Th>Statut</Th><Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {readers.map(r => (
                  <tr key={r.id} className="transition-colors hover:bg-slate-50/70">
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={r.full_name} size={32} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-800">{r.full_name}</p>
                          <p className="truncate text-[11px] text-slate-400">{r.email ?? r.phone ?? '—'}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>{badge(READER_TYPE, r.reader_type)}</Td>
                    <Td className="font-mono text-[11px]">{r.card_number}</Td>
                    <Td>{r.class_name ?? '—'}</Td>
                    <Td className="tabular-nums">{r.active_loans}/{r.max_loans}</Td>
                    <Td className="tabular-nums">
                      {r.unpaid_penalties > 0
                        ? <Badge tone="red">{r.unpaid_penalties}</Badge>
                        : <span className="text-slate-300">—</span>}
                    </Td>
                    <Td>{r.status === 'ACTIF' ? <Badge tone="emerald">Actif</Badge> : <Badge tone="slate">{r.status}</Badge>}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Btn variant="ghost" size="sm" onClick={() => {
                          setEditing(r);
                          setForm({
                            full_name: r.full_name, reader_type: r.reader_type, email: r.email ?? '',
                            phone: r.phone ?? '', card_number: r.card_number, class_name: r.class_name ?? '',
                            max_loans: String(r.max_loans), status: r.status, notes: r.notes ?? '',
                            student_id: r.student_id ?? '',
                          });
                          setModal('form');
                        }}>
                          <Pencil size={14} />
                        </Btn>
                        <Btn variant="ghost" size="sm" className="text-red-500" onClick={() => setConfirmDelete(r)}>
                          <Trash2 size={14} />
                        </Btn>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableShell>
      )}

      {modal === 'form' && (
        <Modal
          title={editing ? 'Modifier le lecteur' : 'Nouveau lecteur'}
          onClose={() => { setModal(null); setEditing(null); }}
          footer={
            <>
              <Btn onClick={() => { setModal(null); setEditing(null); }}>Annuler</Btn>
              <Btn variant="primary" onClick={save}><CheckCircle2 size={15} /> Enregistrer</Btn>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nom complet" required className="sm:col-span-2">
              <TextInput value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
            </Field>
            <Field label="Type de lecteur">
              <Select value={form.reader_type} onChange={e => setForm({ ...form, reader_type: e.target.value })}>
                {Object.entries(READER_TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </Field>
            <Field label="Classe / service">
              <TextInput value={form.class_name} onChange={e => setForm({ ...form, class_name: e.target.value })} placeholder="3ème B" />
            </Field>
            <Field label="Téléphone">
              <TextInput value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <TextInput value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Numéro de carte" hint="Généré automatiquement si laissé vide.">
              <TextInput value={form.card_number} onChange={e => setForm({ ...form, card_number: e.target.value })} />
            </Field>
            <Field label="Emprunts maximum">
              <NumberInput value={form.max_loans} onChange={e => setForm({ ...form, max_loans: e.target.value })} min={1} />
            </Field>
            <Field label="Statut">
              <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="ACTIF">Actif</option>
                <option value="SUSPENDU">Suspendu</option>
                <option value="INACTIF">Inactif</option>
              </Select>
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <TextInput value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}

      {modal === 'register' && (
        <Modal
          title="Inscrire un élève comme lecteur"
          description="La fiche est créée automatiquement à partir de la fiche élève."
          onClose={() => setModal(null)}
          footer={
            <>
              <Btn onClick={() => setModal(null)}>Annuler</Btn>
              <Btn variant="primary" onClick={registerStudent}><UserPlus size={15} /> Inscrire</Btn>
            </>
          }
        >
          {students.length === 0 ? (
            <Alert tone="info" message="Aucune liste d’élèves disponible pour cette année scolaire. Créez la fiche manuellement." />
          ) : (
            <Field label="Élève" required>
              <Select value={studentChoice} onChange={e => setStudentChoice(e.target.value)}>
                <option value="">— Sélectionner un élève —</option>
                {students.map(s => (
                  <option key={s.student_id} value={s.student_id}>
                    {s.last_name ?? ''} {s.first_name ?? ''}{s.class_name ? ` — ${s.class_name}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Supprimer le lecteur"
          message={`La fiche de « ${confirmDelete.full_name} » sera supprimée. Les emprunts en cours doivent avoir été rendus.`}
          confirmLabel="Supprimer"
          onConfirm={remove}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ONGLET — EMPRUNTS & RETOURS
// ═══════════════════════════════════════════════════════════

function TabEmprunts({
  schoolId, settings, onChanged, onError, onNotice,
}: {
  schoolId: string; settings: LibrarySettings | null;
  onChanged: () => void; onError: (m: string) => void; onNotice: (m: string) => void;
}) {
  const [scope, setScope] = useState<'EN_COURS' | 'HISTORIQUE' | 'TOUS'>('EN_COURS');
  const [loans, setLoans] = useState<LibraryLoan[]>([]);
  const [readers, setReaders] = useState<LibraryReader[]>([]);
  const [copies, setCopies] = useState<LibraryCopy[]>([]);
  const [referenceBooks, setReferenceBooks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loanModal, setLoanModal] = useState(false);
  const [loanForm, setLoanForm] = useState({ reader_id: '', copy_id: '', due_date: '', notes: '' });
  const [returnModal, setReturnModal] = useState<LibraryLoan | null>(null);
  const [returnForm, setReturnForm] = useState({ condition: 'Bon', remarks: '' });

  const load = useCallback(async () => {
    try {
      const [l, r, c, b] = await Promise.all([
        invoke<LibraryLoan[]>('get_library_loans', {
          schoolId, scope: scope === 'TOUS' ? null : scope, readerId: null, bookId: null,
        }),
        invoke<LibraryReader[]>('get_library_readers', { schoolId, search: null, readerType: null }),
        invoke<LibraryCopy[]>('get_library_copies', { schoolId, bookId: null, status: 'DISPONIBLE', search: null }),
        invoke<LibraryBook[]>('get_library_books', { schoolId, categoryId: null, search: null }),
      ]);
      setLoans(l);
      setReaders(r);
      setCopies(c);
      setReferenceBooks(new Set(b.filter(x => x.is_reference).map(x => x.id)));
    } catch (e: any) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  }, [schoolId, scope]);

  useEffect(() => { load(); }, [load]);

  const defaultDueDate = () => {
    const days = settings?.loan_duration_days ?? 14;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const submitLoan = async () => {
    if (!loanForm.reader_id || !loanForm.copy_id) {
      onError('Choisissez un lecteur et un exemplaire.');
      return;
    }
    try {
      await invoke('create_library_loan', {
        schoolId,
        readerId: loanForm.reader_id,
        copyId: loanForm.copy_id,
        loanDate: null,
        dueDate: loanForm.due_date || null,
        notes: loanForm.notes || null,
        createdBy: null,
      });
      setLoanModal(false);
      setLoanForm({ reader_id: '', copy_id: '', due_date: '', notes: '' });
      onNotice('Emprunt enregistré.');
      load();
      onChanged();
    } catch (e: any) {
      onError(String(e));
    }
  };

  const submitReturn = async () => {
    if (!returnModal) return;
    try {
      const ret = await invoke<LibraryReturn>('return_library_loan', {
        loanId: returnModal.id,
        schoolId,
        returnedAt: null,
        condition: returnForm.condition || null,
        remarks: returnForm.remarks || null,
        handledBy: null,
      });
      setReturnModal(null);
      setReturnForm({ condition: 'Bon', remarks: '' });
      onNotice(
        ret.late_days > 0
          ? `Retour enregistré — ${ret.late_days} jour(s) de retard, pénalité de ${fmtMoney(ret.fine_amount)}.`
          : 'Retour enregistré.'
      );
      load();
      onChanged();
    } catch (e: any) {
      onError(String(e));
    }
  };

  const extend = async (loan: LibraryLoan) => {
    try {
      await invoke('extend_library_loan', { loanId: loan.id, schoolId, days: 14 });
      onNotice('Emprunt prolongé de 14 jours.');
      load();
      onChanged();
    } catch (e: any) {
      onError(String(e));
    }
  };

  const availableCopies = useMemo(
    () => copies.filter(c => c.status === 'DISPONIBLE' && !referenceBooks.has(c.book_id)),
    [copies, referenceBooks]
  );

  if (loading) return <Loader label="Chargement des emprunts…" />;

  const activeLoans = loans.filter(l => l.status === 'EN_COURS');

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<'EN_COURS' | 'HISTORIQUE' | 'TOUS'>
            value={scope}
            onChange={setScope}
            options={[
              { value: 'EN_COURS', label: 'En cours', count: activeLoans.length },
              { value: 'HISTORIQUE', label: 'Historique' },
              { value: 'TOUS', label: 'Tous' },
            ]}
          />
        </div>
        <Btn variant="primary" onClick={() => {
          setLoanForm({ reader_id: '', copy_id: '', due_date: defaultDueDate(), notes: '' });
          setLoanModal(true);
        }}>
          <Plus size={15} /> Nouvel emprunt
        </Btn>
      </Card>

      {loans.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Aucun emprunt"
          description="Enregistrez un emprunt pour un lecteur et un exemplaire disponible."
          action={<Btn variant="primary" onClick={() => setLoanModal(true)}><Plus size={15} /> Nouvel emprunt</Btn>}
        />
      ) : (
        <TableShell>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[12px]">
              <thead className="border-b border-slate-200">
                <tr>
                  <Th>Ouvrage</Th><Th>Exemplaire</Th><Th>Lecteur</Th><Th>Emprunt</Th>
                  <Th>Échéance</Th><Th>Retard</Th><Th>Statut</Th><Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loans.map(l => (
                  <tr key={l.id} className="transition-colors hover:bg-slate-50/70">
                    <Td>
                      <p className="font-semibold text-slate-800">{l.book_title ?? '—'}</p>
                      {l.book_author && <p className="text-[11px] text-slate-400">{l.book_author}</p>}
                    </Td>
                    <Td className="font-mono text-[11px]">{l.inventory_code ?? '—'}</Td>
                    <Td>{l.reader_name ?? '—'}</Td>
                    <Td>{fmtDate(l.loan_date)}</Td>
                    <Td>{fmtDate(l.due_date)}</Td>
                    <Td className="tabular-nums">
                      {l.late_days > 0
                        ? <Badge tone="red">{l.late_days} j · {fmtMoney(l.fine_amount)}</Badge>
                        : <span className="text-slate-300">—</span>}
                    </Td>
                    <Td>{badge(LOAN_STATUS, l.status)}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        {l.status === 'EN_COURS' && (
                          <>
                            <Btn variant="ghost" size="sm" onClick={() => extend(l)}>
                              <CalendarClock size={14} /> +14 j
                            </Btn>
                            <Btn variant="subtle" size="sm" onClick={() => {
                              setReturnModal(l);
                              setReturnForm({ condition: 'Bon', remarks: '' });
                            }}>
                              <UndoIcon /> Retour
                            </Btn>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableShell>
      )}

      {loanModal && (
        <Modal
          title="Nouvel emprunt"
          description={`Durée par défaut : ${settings?.loan_duration_days ?? 14} jours.`}
          onClose={() => setLoanModal(false)}
          footer={
            <>
              <Btn onClick={() => setLoanModal(false)}>Annuler</Btn>
              <Btn variant="primary" onClick={submitLoan}><CheckCircle2 size={15} /> Enregistrer l’emprunt</Btn>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Lecteur" required>
              <Select value={loanForm.reader_id} onChange={e => setLoanForm({ ...loanForm, reader_id: e.target.value })}>
                <option value="">— Sélectionner un lecteur —</option>
                {readers.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.full_name} ({r.card_number}) — {r.active_loans}/{r.max_loans}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Exemplaire disponible" required hint="Seuls les exemplaires libres et prêtables apparaissent dans la liste.">
              <Select value={loanForm.copy_id} onChange={e => setLoanForm({ ...loanForm, copy_id: e.target.value })}>
                <option value="">— Sélectionner un exemplaire —</option>
                {availableCopies.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.inventory_code} — {c.book_title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date d’échéance" hint="Laissez vide pour appliquer la durée par défaut.">
              <TextInput type="date" value={loanForm.due_date} onChange={e => setLoanForm({ ...loanForm, due_date: e.target.value })} />
            </Field>
            <Field label="Notes">
              <TextInput value={loanForm.notes} onChange={e => setLoanForm({ ...loanForm, notes: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}

      {returnModal && (
        <Modal
          title="Enregistrer le retour"
          description={`${returnModal.book_title ?? 'Ouvrage'} — ${returnModal.reader_name ?? ''}`}
          onClose={() => setReturnModal(null)}
          footer={
            <>
              <Btn onClick={() => setReturnModal(null)}>Annuler</Btn>
              <Btn variant="primary" onClick={submitReturn}><CheckCircle2 size={15} /> Valider le retour</Btn>
            </>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-[12px] text-slate-600">
              <p>Emprunt du {fmtDate(returnModal.loan_date)}</p>
              <p>Échéance : {fmtDate(returnModal.due_date)}</p>
            </div>
            <Field label="État de l’exemplaire au retour">
              <Select value={returnForm.condition} onChange={e => setReturnForm({ ...returnForm, condition: e.target.value })}>
                {['Neuf', 'Bon', 'Correct', 'Dégradé', 'Perdu'].map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Remarques">
              <TextInput value={returnForm.remarks} onChange={e => setReturnForm({ ...returnForm, remarks: e.target.value })} />
            </Field>
            <Alert
              tone="info"
              message={`Le retard et la pénalité (${fmtMoney(settings?.fine_per_day ?? 100)} / jour, ${settings?.grace_days ?? 0} jour(s) de tolérance) sont calculés automatiquement.`}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

function UndoIcon() {
  return <History size={14} />;
}

// ═══════════════════════════════════════════════════════════
// ONGLET — RETARDS & PÉNALITÉS
// ═══════════════════════════════════════════════════════════

function TabPenalties({
  schoolId, onChanged, onError,
}: {
  schoolId: string; onChanged: () => void; onError: (m: string) => void;
}) {
  const [penalties, setPenalties] = useState<LibraryPenalty[]>([]);
  const [readers, setReaders] = useState<LibraryReader[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ reader_id: '', penalty_type: 'RETARD', amount: '100', days_late: '1', description: '' });
  const [confirmWaive, setConfirmWaive] = useState<LibraryPenalty | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([
        invoke<LibraryPenalty[]>('get_library_penalties', { schoolId, status: status || null }),
        invoke<LibraryReader[]>('get_library_readers', { schoolId, search: null, readerType: null }),
      ]);
      setPenalties(p);
      setReaders(r);
    } catch (e: any) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  }, [schoolId, status]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.reader_id) { onError('Sélectionnez un lecteur.'); return; }
    try {
      await invoke('create_library_penalty', {
        schoolId,
        readerId: form.reader_id,
        loanId: null,
        penaltyType: form.penalty_type,
        amount: parseFloat(form.amount) || 0,
        daysLate: parseInt(form.days_late, 10) || 0,
        description: form.description || null,
      });
      setModal(false);
      setForm({ reader_id: '', penalty_type: 'RETARD', amount: '100', days_late: '1', description: '' });
      load();
      onChanged();
    } catch (e: any) {
      onError(String(e));
    }
  };

  const pay = async (p: LibraryPenalty) => {
    try {
      await invoke('pay_library_penalty', { id: p.id, schoolId, amount: null });
      load();
      onChanged();
    } catch (e: any) {
      onError(String(e));
    }
  };

  const waive = async () => {
    if (!confirmWaive) return;
    try {
      await invoke('waive_library_penalty', { id: confirmWaive.id, schoolId, reason: 'Remise accordée' });
      setConfirmWaive(null);
      load();
      onChanged();
    } catch (e: any) {
      onError(String(e));
      setConfirmWaive(null);
    }
  };

  if (loading) return <Loader label="Chargement des pénalités…" />;

  const total = penalties.filter(p => p.status === 'EN_ATTENTE').reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={status} onChange={e => setStatus(e.target.value)} className="w-full max-w-56">
            <option value="">Tous les statuts</option>
            {Object.entries(PENALTY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Badge tone="amber">Total en attente : {fmtMoney(total)}</Badge>
        </div>
        <Btn variant="primary" onClick={() => setModal(true)}>
          <Plus size={15} /> Nouvelle pénalité
        </Btn>
      </Card>

      {penalties.length === 0 ? (
        <EmptyState icon={HandCoins} title="Aucune pénalité" description="Les retards sont générés automatiquement lors des retours." />
      ) : (
        <TableShell>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[12px]">
              <thead className="border-b border-slate-200">
                <tr>
                  <Th>Lecteur</Th><Th>Type</Th><Th>Montant</Th><Th>Jours de retard</Th>
                  <Th>Description</Th><Th>Statut</Th><Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {penalties.map(p => (
                  <tr key={p.id} className="transition-colors hover:bg-slate-50/70">
                    <Td>
                      <p className="font-semibold text-slate-800">{p.reader_name ?? '—'}</p>
                      {p.book_title && <p className="text-[11px] text-slate-400">{p.book_title}</p>}
                    </Td>
                    <Td>{PENALTY_TYPE[p.penalty_type] ?? p.penalty_type}</Td>
                    <Td className="tabular-nums font-semibold">{fmtMoney(p.amount)}</Td>
                    <Td className="tabular-nums">{p.days_late}</Td>
                    <Td className="text-slate-500">{p.description ?? '—'}</Td>
                    <Td>{badge(PENALTY_STATUS, p.status)}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        {p.status === 'EN_ATTENTE' && (
                          <>
                            <Btn variant="subtle" size="sm" onClick={() => pay(p)}>
                              <Coins size={14} /> Payer
                            </Btn>
                            <Btn variant="ghost" size="sm" onClick={() => setConfirmWaive(p)}>
                              <ShieldCheck size={14} /> Remettre
                            </Btn>
                          </>
                        )}
                        {p.status === 'PAYEE' && (
                          <span className="text-[11px] text-slate-400">Payée le {fmtDate(p.paid_at)}</span>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableShell>
      )}

      {modal && (
        <Modal
          title="Nouvelle pénalité"
          onClose={() => setModal(false)}
          footer={
            <>
              <Btn onClick={() => setModal(false)}>Annuler</Btn>
              <Btn variant="primary" onClick={create}><CheckCircle2 size={15} /> Enregistrer</Btn>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Lecteur" required className="sm:col-span-2">
              <Select value={form.reader_id} onChange={e => setForm({ ...form, reader_id: e.target.value })}>
                <option value="">— Sélectionner un lecteur —</option>
                {readers.map(r => <option key={r.id} value={r.id}>{r.full_name} ({r.card_number})</option>)}
              </Select>
            </Field>
            <Field label="Type">
              <Select value={form.penalty_type} onChange={e => setForm({ ...form, penalty_type: e.target.value })}>
                {Object.entries(PENALTY_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Montant">
              <NumberInput value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Jours de retard">
              <NumberInput value={form.days_late} onChange={e => setForm({ ...form, days_late: e.target.value })} />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <TextInput value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}

      {confirmWaive && (
        <ConfirmDialog
          title="Remettre la pénalité"
          message={`La pénalité de ${fmtMoney(confirmWaive.amount)} sera remise. Confirmer ?`}
          confirmLabel="Remettre"
          onConfirm={waive}
          onCancel={() => setConfirmWaive(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ONGLET — RÉSERVATIONS
// ═══════════════════════════════════════════════════════════

function TabReservations({
  schoolId, onChanged, onError, onNotice,
}: {
  schoolId: string; onChanged: () => void; onError: (m: string) => void; onNotice: (m: string) => void;
}) {
  const [reservations, setReservations] = useState<LibraryReservation[]>([]);
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [readers, setReaders] = useState<LibraryReader[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ book_id: '', reader_id: '' });
  const [confirmCancel, setConfirmCancel] = useState<LibraryReservation | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, b, rd] = await Promise.all([
        invoke<LibraryReservation[]>('get_library_reservations', { schoolId, status: status || null }),
        invoke<LibraryBook[]>('get_library_books', { schoolId, categoryId: null, search: null }),
        invoke<LibraryReader[]>('get_library_readers', { schoolId, search: null, readerType: null }),
      ]);
      setReservations(r);
      setBooks(b);
      setReaders(rd);
    } catch (e: any) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  }, [schoolId, status]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.book_id || !form.reader_id) { onError('Choisissez un ouvrage et un lecteur.'); return; }
    try {
      await invoke('create_library_reservation', {
        schoolId, bookId: form.book_id, readerId: form.reader_id,
      });
      setModal(false);
      setForm({ book_id: '', reader_id: '' });
      onNotice('Réservation enregistrée.');
      load();
      onChanged();
    } catch (e: any) {
      onError(String(e));
    }
  };

  const cancel = async () => {
    if (!confirmCancel) return;
    try {
      await invoke('cancel_library_reservation', {
        id: confirmCancel.id, schoolId, reason: 'Annulée par la bibliothèque',
      });
      setConfirmCancel(null);
      load();
      onChanged();
    } catch (e: any) {
      onError(String(e));
      setConfirmCancel(null);
    }
  };

  const fulfill = async (r: LibraryReservation) => {
    try {
      await invoke('fulfill_library_reservation', { id: r.id, schoolId, copyId: null });
      onNotice('Réservation satisfaite : l’emprunt correspondant a été créé.');
      load();
      onChanged();
    } catch (e: any) {
      onError(String(e));
    }
  };

  if (loading) return <Loader label="Chargement des réservations…" />;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={status} onChange={e => setStatus(e.target.value)} className="w-full max-w-56">
            <option value="">Tous les statuts</option>
            {Object.entries(RESERVATION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        <Btn variant="primary" onClick={() => setModal(true)}>
          <Plus size={15} /> Nouvelle réservation
        </Btn>
      </Card>

      {reservations.length === 0 ? (
        <EmptyState icon={Bookmark} title="Aucune réservation" description="Réservez un ouvrage indisponible pour un lecteur." />
      ) : (
        <TableShell>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[12px]">
              <thead className="border-b border-slate-200">
                <tr>
                  <Th>Ouvrage</Th><Th>Lecteur</Th><Th>Réservée le</Th>
                  <Th>Exemplaires libres</Th><Th>Position</Th><Th>Statut</Th><Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reservations.map(r => (
                  <tr key={r.id} className="transition-colors hover:bg-slate-50/70">
                    <Td>
                      <p className="font-semibold text-slate-800">{r.book_title ?? '—'}</p>
                      {r.book_author && <p className="text-[11px] text-slate-400">{r.book_author}</p>}
                    </Td>
                    <Td>{r.reader_name ?? '—'}</Td>
                    <Td>{fmtDate(r.reserved_at)}</Td>
                    <Td className="tabular-nums">
                      {r.available_copies > 0
                        ? <Badge tone="emerald">{r.available_copies}</Badge>
                        : <span className="text-slate-300">0</span>}
                    </Td>
                    <Td className="tabular-nums">{r.queue_position}</Td>
                    <Td>{badge(RESERVATION_STATUS, r.status)}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        {(r.status === 'EN_ATTENTE' || r.status === 'DISPONIBLE') && (
                          <>
                            <Btn variant="subtle" size="sm" onClick={() => fulfill(r)} disabled={r.available_copies === 0}>
                              <CheckCircle2 size={14} /> Satisfaire
                            </Btn>
                            <Btn variant="ghost" size="sm" className="text-red-500" onClick={() => setConfirmCancel(r)}>
                              <XCircle size={14} />
                            </Btn>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableShell>
      )}

      {modal && (
        <Modal
          title="Nouvelle réservation"
          description="La réservation porte sur l’ouvrage ; un exemplaire sera attribué lors de la satisfaction."
          onClose={() => setModal(false)}
          footer={
            <>
              <Btn onClick={() => setModal(false)}>Annuler</Btn>
              <Btn variant="primary" onClick={create}><CheckCircle2 size={15} /> Réserver</Btn>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Ouvrage" required>
              <Select value={form.book_id} onChange={e => setForm({ ...form, book_id: e.target.value })}>
                <option value="">— Sélectionner un ouvrage —</option>
                {books.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.title} — {b.available_count}/{b.copy_count} disponible(s)
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Lecteur" required>
              <Select value={form.reader_id} onChange={e => setForm({ ...form, reader_id: e.target.value })}>
                <option value="">— Sélectionner un lecteur —</option>
                {readers.map(r => <option key={r.id} value={r.id}>{r.full_name} ({r.card_number})</option>)}
              </Select>
            </Field>
          </div>
        </Modal>
      )}

      {confirmCancel && (
        <ConfirmDialog
          title="Annuler la réservation"
          message="La réservation sera annulée et le lecteur retiré de la file d’attente. Confirmer ?"
          confirmLabel="Annuler la réservation"
          onConfirm={cancel}
          onCancel={() => setConfirmCancel(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MODALE — PARAMÈTRES
// ═══════════════════════════════════════════════════════════

function ModalSettings({
  settings, onClose, onSaved, onError,
}: {
  settings: LibrarySettings;
  onClose: () => void;
  onSaved: (s: LibrarySettings) => void;
  onError: (m: string) => void;
}) {
  const [form, setForm] = useState({
    loan_duration_days: String(settings.loan_duration_days),
    max_loans_per_reader: String(settings.max_loans_per_reader),
    fine_per_day: String(settings.fine_per_day),
    grace_days: String(settings.grace_days),
    reservation_expiry_days: String(settings.reservation_expiry_days),
  });

  const save = async () => {
    try {
      const saved = await invoke<LibrarySettings>('save_library_settings', {
        schoolId: settings.school_id,
        loanDurationDays: parseInt(form.loan_duration_days, 10) || 14,
        maxLoansPerReader: parseInt(form.max_loans_per_reader, 10) || 3,
        finePerDay: parseFloat(form.fine_per_day) || 0,
        graceDays: parseInt(form.grace_days, 10) || 0,
        reservationExpiryDays: parseInt(form.reservation_expiry_days, 10) || 7,
      });
      onSaved(saved);
    } catch (e: any) {
      onError(String(e));
    }
  };

  return (
    <Modal
      title="Paramètres de la bibliothèque"
      description="Ces règles s’appliquent à l’ensemble des emprunts de l’établissement."
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Annuler</Btn>
          <Btn variant="primary" onClick={save}><CheckCircle2 size={15} /> Enregistrer</Btn>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Durée d’un emprunt (jours)">
          <NumberInput value={form.loan_duration_days} onChange={e => setForm({ ...form, loan_duration_days: e.target.value })} min={1} />
        </Field>
        <Field label="Emprunts maximum par lecteur">
          <NumberInput value={form.max_loans_per_reader} onChange={e => setForm({ ...form, max_loans_per_reader: e.target.value })} min={1} />
        </Field>
        <Field label="Pénalité par jour de retard">
          <NumberInput value={form.fine_per_day} onChange={e => setForm({ ...form, fine_per_day: e.target.value })} min={0} />
        </Field>
        <Field label="Jours de tolérance">
          <NumberInput value={form.grace_days} onChange={e => setForm({ ...form, grace_days: e.target.value })} min={0} />
        </Field>
        <Field label="Validité d’une réservation (jours)">
          <NumberInput value={form.reservation_expiry_days} onChange={e => setForm({ ...form, reservation_expiry_days: e.target.value })} min={1} />
        </Field>
      </div>
    </Modal>
  );
}
