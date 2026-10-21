// ============================================================
// Orion — Générateur de jeu de données réalistes (déterministe)
// ============================================================
// Produit un dataset identique à chaque exécution (RNG seedé) pour
// l'établissement SAINT LOUIS (Local + miroir Cloud) et deux
// établissements supplémentaires (Cloud : AGORA, NOTRE-DAME).
//
// Contexte : Togo — Lomé, année scolaire 2026-2027, montants en
// centimes FCFA (XOF), programme collège / lycée.
// ============================================================

// ── RNG déterministe (mulberry32) ────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20261016);

function int(min, max) {
  return Math.floor(rnd() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[Math.floor(rnd() * arr.length)];
}
function chance(p) {
  return rnd() < p;
}
function pad(n, len) {
  return String(n).padStart(len, '0');
}

// ── Identifiants déterministes (UUID v4-like) ────────────────
let idCounter = 0;
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function makeId(namespace) {
  idCounter += 1;
  const seed = `${namespace}#${idCounter}`;
  let out = '';
  let x = hash32(seed);
  while (out.length < 32) {
    x = (Math.imul(x ^ (x >>> 15), 2246822519) ^ (x >>> 13)) >>> 0;
    out += x.toString(16).padStart(8, '0');
    x = hash32(out.slice(-8) + seed);
  }
  const h = out.slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ── Horodatage (canonique ISO, converti par les scripts) ─────
function ts(y, m, d, hh = 8, mm = 0) {
  return `${y}-${pad(m, 2)}-${pad(d, 2)}T${pad(hh, 2)}:${pad(mm, 2)}:00Z`;
}
// Toutes les lignes semées portent une date < curseur de sync
// (2026-10-16T15:58:36Z) pour être ignorées par le pull entrant.
let stampSeq = 0;
function seedStamp(day, month) {
  stampSeq += 1;
  const hh = 6 + (stampSeq % 12);
  const mm = (stampSeq * 7) % 60;
  return ts(2026, month, day, hh, mm);
}

// ── Pools de données réalistes (Togo) ────────────────────────
const MALE_NAMES = [
  'Kossi', 'Kodjo', 'Komlan', 'Koffi', 'Yao', 'Kouassi', 'Mensah', 'Sena', 'Essohanam',
  'Edem', 'Mawuli', 'Dela', 'Kossiwa', 'Folly', 'Aboudou', 'Alassane', 'Boubacar',
  'Rachidou', 'Samir', 'Ibrahim', 'Fabrice', 'Serge', 'Prince', 'Stephane', 'Bertrand',
  'Herve', 'Rodrigue', 'Samuel', 'Josue', 'Elie', 'Moise', 'Kodjovi', 'Kossigan',
  'Kwami', 'Akouete', 'Djibril', 'Bilal', 'Ouro', 'Tchaa', 'Nassirou',
];
const FEMALE_NAMES = [
  'Afi', 'Ama', 'Akouvi', 'Adjoa', 'Yawa', 'Akossiwa', 'Enyonam', 'Sitsope', 'Aku',
  'Prudence', 'Esperance', 'Danielle', 'Felicite', 'Grace', 'Esther', 'Ruth', 'Naomi',
  'Afisia', 'Afiwa', 'Emefa', 'Mawupemo', 'Esi', 'Adzo', 'Kafui', 'Emmanuella',
  'Chantal', 'Victoire', 'Cecile', 'Pauline', 'Sylvie', 'Vanessa', 'Prisca', 'Rachelle',
  'Aminata', 'Fatoumata', 'Khadija', 'Salimata', 'Zeinabou', 'Assana', 'Habiba',
];
const LAST_NAMES = [
  'AGBO', 'DOSSOU', 'AMEGAN', 'LATEY', 'DOSSOU-YOVO', 'SODJI', 'TCHALLA', 'GBENYO',
  'DJOSSOU', 'TOGLO', 'KUEVIDJIN', 'AWITO', 'BALOGOU', 'BEYIOME', 'TRAORE', 'KOFFI',
  'AMANI', 'KATAKA', 'MENSAH', 'ANOMA', 'BOUKARI', 'GARBA', 'SANI', 'BELLO', 'ADIGBLI',
  'AKAKPO', 'ASSIMA', 'BATOU', 'CHABI', 'DJOBO', 'EGBARE', 'GNAMI', 'HOUNKPATI',
  'ISSA', 'KOMLAN', 'LAWANI', 'MANSA', 'NASSARA', 'OURO-DJERI', 'PANA', 'SAMA',
];
const QUARTIERS = [
  'Adewi', 'Nyékonakpoè', 'Tokoin', 'Bè', 'Agoè', 'Adidogomé', 'Hédzranawoé', 'Djidjolé',
  'Aflao-Gakli', 'Baguida', 'Avénou', 'Kégué', 'Ampa', 'Bè-Kpota', 'Akodésséwa', 'Totsi',
  'Gbodjomé', 'Dekanmè', 'Zongo', 'Kodjoviakopé', 'Vakpossito', 'Hanoukopé', 'Abové',
];
const RUES = [
  'Rue 128', 'Boulevard du 13 Janvier', 'Rue des Aviateurs', 'Rue 45 Agoè',
  'Boulevard du 30 Août', 'Rue de la Kozah', 'Rue de la Gare', 'Rue 212',
  'Avenue de la Libération', 'Rue 8 Bè', 'Rue des Grands Marchés', 'Rue 60 Tokoin',
];
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const MEDICAL_NOTES = [
  'Asthmatique léger', 'Allergie à la poussière', 'Port de lunettes', 'Anémie légère',
  'Allergie aux arachides', 'Suivi médical régulier',
];
const EMERGENCY = ['Papa', 'Maman', 'Tuteur', 'Oncle', 'Tante'];

export const SUBJECT_CATALOG = [
  { code: 'FRA', name: 'Français', color: '#ef4444', coef: 4 },
  { code: 'MAT', name: 'Mathématiques', color: '#3b82f6', coef: 4 },
  { code: 'ANG', name: 'Anglais', color: '#10b981', coef: 2 },
  { code: 'HG', name: 'Histoire-Géographie', color: '#f59e0b', coef: 2 },
  { code: 'SVT', name: 'Sciences de la Vie et de la Terre', color: '#22c55e', coef: 2 },
  { code: 'PC', name: 'Physique-Chimie', color: '#8b5cf6', coef: 2 },
  { code: 'PHI', name: 'Philosophie', color: '#64748b', coef: 2 },
  { code: 'EPS', name: 'Éducation Physique et Sportive', color: '#f97316', coef: 1 },
  { code: 'ECM', name: 'Éducation Civique et Morale', color: '#14b8a6', coef: 1 },
  { code: 'INF', name: 'Informatique', color: '#0ea5e9', coef: 1 },
  { code: 'ARA', name: 'Arabe', color: '#a16207', coef: 1 },
  { code: 'ALL', name: 'Allemand', color: '#7c3aed', coef: 1 },
  { code: 'ART', name: 'Arts Plastiques', color: '#ec4899', coef: 1 },
  { code: 'MUS', name: 'Éducation Musicale', color: '#db2777', coef: 1 },
  { code: 'TEC', name: 'Technologie', color: '#0891b2', coef: 1 },
  { code: 'EPT', name: 'Études Pratiques', color: '#65a30d', coef: 1 },
];

const COLLEGE_SUBJECTS = ['FRA', 'MAT', 'ANG', 'HG', 'SVT', 'PC', 'EPS', 'ECM', 'INF', 'TEC'];
const SECONDE_SUBJECTS = ['FRA', 'MAT', 'ANG', 'HG', 'SVT', 'PC', 'EPS', 'INF', 'ARA', 'TEC'];
const PREMIERE_SUBJECTS = ['FRA', 'MAT', 'ANG', 'HG', 'SVT', 'PC', 'EPS', 'INF', 'ARA', 'ALL'];
const TERMINALE_SUBJECTS = ['FRA', 'MAT', 'ANG', 'HG', 'SVT', 'PC', 'EPS', 'PHI', 'INF', 'ARA'];

function levelOf(className) {
  if (className.startsWith('6ème')) return '6ème';
  if (className.startsWith('5ème')) return '5ème';
  if (className.startsWith('4ème')) return '4ème';
  if (className.startsWith('3ème')) return '3ème';
  if (className.startsWith('Seconde')) return 'Seconde';
  if (className.startsWith('Première')) return 'Première';
  return 'Terminale';
}
function subjectsForLevel(level) {
  if (['6ème', '5ème', '4ème', '3ème'].includes(level)) return COLLEGE_SUBJECTS;
  if (level === 'Seconde') return SECONDE_SUBJECTS;
  if (level === 'Première') return PREMIERE_SUBJECTS;
  return TERMINALE_SUBJECTS;
}
function seriesOf(className) {
  const m = className.match(/(A4|C1|D)\s*$/);
  return m ? m[1] : null;
}
function ageRangeForLevel(level) {
  if (['6ème', '5ème'].includes(level)) return [11, 14];
  if (['4ème', '3ème'].includes(level)) return [13, 17];
  if (level === 'Seconde') return [15, 18];
  if (level === 'Première') return [16, 19];
  return [17, 21];
}

// ── Définition des établissements ────────────────────────────
const SAINT_LOUIS_ID = '2930e1ad-570f-491f-9821-3d831487e754';
const SAINT_LOUIS_YEAR_ID = 'ebec981f-587f-4a39-8672-c5693d573366';
const SAINT_LOUIS_DIRECTION_USER = '51e0f187-9dc6-4d53-8ead-6418a89a13cd';
const EXISTING_DEVICE_ID = '8251c253-0567-46b6-aba2-cc8d0728b1db';

export const SCHOOL_DEFS = [
  {
    key: 'saint-louis',
    id: SAINT_LOUIS_ID,
    yearId: SAINT_LOUIS_YEAR_ID,
    name: 'SAINT LOUIS',
    shortName: 'SLOUIS',
    city: 'Lomé',
    country: 'Togo',
    address: 'Adewi, Rue 128',
    phonePrimary: '228 93355339',
    phoneSecondary: '228 93752726',
    email: 'directionn@gmail.com',
    website: 'www.saintlouis-tg.com',
    headTitle: 'Directeur',
    headName: 'KOSSI KOMI',
    slogan: 'Travail, Discipline, Succès',
    ministryName: "MINISTERE D'ENSEIGNEMENT PRIMAIRE SECONDAIRE\nTECHNIQUE ET DE L'ARTISANAT",
    registrationNumber: 'MEPS-234H-MMP2',
    prefix: 'SL',
    domain: 'saintlouis-tg.com',
    local: true,
    directionUser: SAINT_LOUIS_DIRECTION_USER,
    classes: [
      '6ème A', '6ème B', '6ème C', '6ème D', '5ème A', '5ème B', '5ème C',
      '4ème A', '4ème B', '3ème A', '3ème B',
      'Seconde A', 'Seconde B', 'Seconde C',
      'Première A4', 'Première C1', 'Première D',
      'Terminale A4', 'Terminale C1', 'Terminale D',
    ],
    studentTarget: 640,
    staffTarget: 22,
  },
  {
    key: 'agora',
    id: makeId('school-agora'),
    yearId: makeId('year-agora'),
    name: 'GROUPE SCOLAIRE AGORA',
    shortName: 'AGORA',
    city: 'Lomé',
    country: 'Togo',
    address: 'Nyékonakpoè, Boulevard du 30 Août',
    phonePrimary: '228 90112233',
    phoneSecondary: '228 90778899',
    email: 'contact@agora-lome.tg',
    website: 'www.agora-lome.tg',
    headTitle: 'Directeur Général',
    headName: 'AMEGAN Yao',
    slogan: 'Savoir, Exigence, Réussite',
    ministryName: "MINISTERE D'ENSEIGNEMENT PRIMAIRE SECONDAIRE\nTECHNIQUE ET DE L'ARTISANAT",
    registrationNumber: 'MEPS-771K-AGL7',
    prefix: 'AGO',
    domain: 'agora-lome.tg',
    local: false,
    classes: [
      '6ème A', '5ème A', '4ème A', '3ème A',
      'Seconde A', 'Première A4', 'Première D', 'Terminale A4', 'Terminale D',
    ],
    studentTarget: 250,
    staffTarget: 10,
  },
  {
    key: 'notre-dame',
    id: makeId('school-ndl'),
    yearId: makeId('year-ndl'),
    name: 'COLLÈGE NOTRE-DAME DE LOMÉ',
    shortName: 'NDL',
    city: 'Lomé',
    country: 'Togo',
    address: 'Adidogomé, Rue des Palmiers',
    phonePrimary: '228 90445566',
    phoneSecondary: '228 90889900',
    email: 'contact@ndl-lome.tg',
    website: 'www.ndl-lome.tg',
    headTitle: 'Directrice',
    headName: 'SŒUR GNAMI Bernadette',
    slogan: 'Foi, Travail, Excellence',
    ministryName: "MINISTERE D'ENSEIGNEMENT PRIMAIRE SECONDAIRE\nTECHNIQUE ET DE L'ARTISANAT",
    registrationNumber: 'MEPS-455N-NDL2',
    prefix: 'NDL',
    domain: 'ndl-lome.tg',
    local: false,
    classes: [
      '6ème A', '5ème A', '4ème A', '3ème A',
      'Seconde A', 'Première A4', 'Terminale A4',
    ],
    studentTarget: 180,
    staffTarget: 8,
  },
];

const YEAR = { name: '2026-2027', start: '2026-09-14', end: '2027-07-08' };
const PERIODS = [
  { name: 'Trimestre 1', order: 1, start: '2026-09-14', end: '2026-12-18', active: 1 },
  { name: 'Trimestre 2', order: 2, start: '2027-01-05', end: '2027-04-02', active: 0 },
  { name: 'Trimestre 3', order: 3, start: '2027-04-05', end: '2027-07-03', active: 0 },
];

function fullName(first, last) {
  return `${first} ${last}`;
}
function person(sex, lastNameOverride) {
  const first = sex === 'M' ? pick(MALE_NAMES) : pick(FEMALE_NAMES);
  const last = lastNameOverride || pick(LAST_NAMES);
  return { first, last, full: fullName(first, last), sex };
}
function phone() {
  return `228 9${int(0, 9)} ${pad(int(10, 99), 2)} ${pad(int(10, 99), 2)} ${pad(int(10, 99), 2)}`;
}
function placeOfBirth() {
  return chance(0.55) ? pick(['Lomé', 'Aného', 'Tsévié', 'Kpalimé', 'Atakpamé', 'Sokodé', 'Kara']) : pick(QUARTIERS) + ', Lomé';
}
function birthDateFor(ageMin, ageMax) {
  const year = 2026 - int(ageMin, ageMax);
  return `${year}-${pad(int(1, 12), 2)}-${pad(int(1, 28), 2)}`;
}
function emailFor(p, domain) {
  return `${p.first.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}.${p.last.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '')}@${domain}`;
}
function licenseKey() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const group = () => Array.from({ length: 4 }, () => A[int(0, A.length - 1)]).join('');
  return `ORION-${group()}-${group()}-${group()}`;
}

// ═════════════════════════════════════════════════════════════
// Génération principale
// ═════════════════════════════════════════════════════════════
export function generateDataset(options = {}) {
  const out = {
    schools: [],
    academicYears: [],
    sections: [],
    levels: [],
    series: [],
    subjects: [],
    gradeTypes: [],
    gradingPeriods: [],
    classes: [],
    staff: [],
    students: [],
    enrollments: [],
    enrollmentHistory: [],
    classSubjects: [],
    teacherAssignments: [],
    grades: [],
    feeStructures: [],
    payments: [],
    timetableSlots: [],
    licenses: [],
    devices: [],
    accounts: [],
    directionUserBySchool: { [SAINT_LOUIS_ID]: SAINT_LOUIS_DIRECTION_USER },
  };

  for (const def of SCHOOL_DEFS) {
    const school = {
      id: def.id,
      name: def.name,
      short_name: def.shortName,
      logo_url: '',
      address: def.address,
      city: def.city,
      country: def.country,
      phone_primary: def.phonePrimary,
      phone_secondary: def.phoneSecondary,
      email: def.email,
      website: def.website,
      currency: 'XOF',
      timezone: 'Africa/Lome',
      status: 'ACTIVE',
      stamp_url: '',
      signature_url: '',
      ministry_name: def.ministryName,
      head_title: def.headTitle,
      head_name: def.headName,
      slogan: def.slogan,
      registration_number: def.registrationNumber,
      created_at: seedStamp(20, 8),
      updated_at: seedStamp(20, 8),
    };
    out.schools.push(school);

    // Année scolaire 2026-2027 (ACTIVE + courante)
    out.academicYears.push({
      id: def.yearId,
      school_id: def.id,
      name: YEAR.name,
      start_date: YEAR.start,
      end_date: YEAR.end,
      status: 'ACTIVE',
      is_current: 1,
      closed_at: null,
      created_by: def.directionUser || null,
      created_at: seedStamp(25, 8),
      updated_at: seedStamp(25, 8),
    });

    // Sections / Niveaux / Séries
    const sectionCollege = { id: makeId(`${def.key}-section`), school_id: def.id, name: 'Collège', created_at: seedStamp(26, 8), updated_at: seedStamp(26, 8) };
    const sectionLycee = { id: makeId(`${def.key}-section`), school_id: def.id, name: 'Lycée', created_at: seedStamp(26, 8), updated_at: seedStamp(26, 8) };
    out.sections.push(sectionCollege, sectionLycee);

    const levelDefs = [
      { name: '6ème', order: 1, section: sectionCollege },
      { name: '5ème', order: 2, section: sectionCollege },
      { name: '4ème', order: 3, section: sectionCollege },
      { name: '3ème', order: 4, section: sectionCollege },
      { name: 'Seconde', order: 5, section: sectionLycee },
      { name: 'Première', order: 6, section: sectionLycee },
      { name: 'Terminale', order: 7, section: sectionLycee },
    ];
    const levelBy = {};
    for (const ld of levelDefs) {
      const lv = {
        id: makeId(`${def.key}-level-${ld.name}`),
        school_id: def.id,
        section_id: ld.section.id,
        name: ld.name,
        level_order: ld.order,
        created_at: seedStamp(26, 8),
        updated_at: seedStamp(26, 8),
      };
      out.levels.push(lv);
      levelBy[ld.name] = lv;
    }
    const seriesBy = {};
    for (const [levelName, names] of [['Seconde', ['Générale']], ['Première', ['A4', 'C1', 'D']], ['Terminale', ['A4', 'C1', 'D']]]) {
      for (const sname of names) {
        const se = {
          id: makeId(`${def.key}-series-${levelName}-${sname}`),
          school_id: def.id,
          level_id: levelBy[levelName].id,
          name: sname,
          created_at: seedStamp(26, 8),
          updated_at: seedStamp(26, 8),
        };
        out.series.push(se);
        seriesBy[`${levelName}:${sname}`] = se;
      }
    }

    // Matières
    const subjectBy = {};
    for (const cat of SUBJECT_CATALOG) {
      const subj = {
        id: makeId(`${def.key}-subject-${cat.code}`),
        school_id: def.id,
        name: cat.name,
        code: cat.code,
        color: cat.color,
        created_at: seedStamp(27, 8),
        updated_at: seedStamp(27, 8),
      };
      out.subjects.push(subj);
      subjectBy[cat.code] = subj;
    }

    // Types d'évaluation
    const gradeTypeDefs = [
      { name: 'Devoir 1', max: 20, weight: 1 },
      { name: 'Devoir 2', max: 20, weight: 1 },
      { name: 'Interrogation', max: 20, weight: 0.5 },
      { name: 'Examen', max: 20, weight: 2 },
    ];
    const gradeTypeBy = {};
    for (const gtd of gradeTypeDefs) {
      const gt = {
        id: makeId(`${def.key}-gtype-${gtd.name}`),
        school_id: def.id,
        name: gtd.name,
        max_score: gtd.max,
        weight: gtd.weight,
        created_at: seedStamp(27, 8),
        updated_at: seedStamp(27, 8),
      };
      out.gradeTypes.push(gt);
      gradeTypeBy[gtd.name] = gt;
    }

    // ── Personnel ────────────────────────────────────────────
    const teacherCodes = ['FRA', 'MAT', 'ANG', 'HG', 'SVT', 'PC', 'PHI', 'EPS', 'INF', 'ARA'];
    const target = def.staffTarget;
    const adminSeats = [
      { fonction: def.headTitle, type: 'Administratif', sex: def.headName.includes('SŒUR') ? 'F' : 'M', head: true },
      { fonction: 'Censeur', type: 'Administratif', sex: 'M' },
    ];
    const supportSeats = [
      { fonction: 'Secrétaire Principal', type: 'Administratif', sex: 'F' },
      { fonction: 'Secrétaire', type: 'Administratif', sex: 'F' },
      { fonction: 'Comptable', type: 'Administratif', sex: 'M' },
      { fonction: 'Économe / Intendant', type: 'Administratif', sex: 'M' },
      { fonction: 'Surveillant Général', type: 'Administratif', sex: 'M' },
    ];
    const teacherSeats = [];
    const nTeachers = Math.max(5, target - adminSeats.length - supportSeats.length);
    for (let i = 0; i < nTeachers; i++) {
      const code = teacherCodes[i % teacherCodes.length];
      const cat = SUBJECT_CATALOG.find((c) => c.code === code);
      teacherSeats.push({ fonction: cat.name, type: 'Enseignant', sex: chance(0.4) ? 'F' : 'M', matiere: cat, second: chance(0.35) ? pick(teacherCodes.filter((c) => c !== code)) : null });
    }
    const staffBySubject = {};
    const staffRecords = [];
    let staffSeq = 0;
    const allSeats = [...adminSeats, ...teacherSeats, ...supportSeats];
    for (const seat of allSeats) {
      staffSeq += 1;
      const p = person(seat.sex, seat.head ? def.headName.split(' ').slice(1).join(' ') || undefined : undefined);
      const isTeacher = seat.type === 'Enseignant';
      const rec = {
        id: makeId(`${def.key}-staff`),
        school_id: def.id,
        matricule: `${def.prefix}-P-${pad(staffSeq, 4)}`,
        nom: p.last,
        prenoms: p.first,
        sexe: p.sex,
        date_naissance: birthDateFor(isTeacher ? 27 : 35, isTeacher ? 47 : 58),
        lieu_naissance: placeOfBirth(),
        nationalite: 'Togolaise',
        photo_url: null,
        situation_matrimoniale: chance(0.7) ? 'Marié(e)' : 'Célibataire',
        nombre_enfants: int(0, 5),
        telephone_principal: phone(),
        telephone_secondaire: chance(0.4) ? phone() : null,
        email: emailFor(p, def.domain),
        adresse: `${pick(QUARTIERS)}, ${pick(RUES)}, Lomé`,
        region: 'Maritime',
        prefecture: 'Golfe',
        commune: 'Lomé',
        quartier: pick(QUARTIERS),
        urgence_nom: `${pick(EMERGENCY)} ${p.last}`,
        urgence_telephone: phone(),
        type_personnel: seat.type,
        fonction: seat.fonction,
        statut_professionnel: seat.head || chance(0.6) ? 'Fonctionnaire' : 'Contractuel',
        matricule_professionnel: `TG-${pad(int(10000, 99999), 5)}`,
        categorie: isTeacher ? pick(['A1', 'A2', 'B1', 'B2']) : pick(['C', 'D', 'E']),
        grade: isTeacher ? pick(['Professeur Certifié', 'Professeur Licencié', 'Maître Assistant']) : pick(['Secrétaire Principal', 'Administrateur Civil', 'Adjoint Administratif']),
        classe_grade: isTeacher ? pick(['1ère classe', '2ème classe', '3ème classe']) : pick(['1ère classe', '2ème classe']),
        echelon: `Échelon ${int(1, 6)}`,
        indice: int(280, 950),
        diplome_academique: isTeacher ? pick(['Licence', 'Master', 'Maîtrise']) : pick(['BTS', 'Licence', 'Baccalauréat']),
        diplome_professionnel: isTeacher ? pick(['CAPES', 'CAP-CEG', 'ENI']) : null,
        specialite: isTeacher ? seat.matiere.name : 'Administration scolaire',
        date_recrutement: `${int(2010, 2024)}-${pad(int(1, 12), 2)}-${pad(int(1, 28), 2)}`,
        date_entree_fonction_pub: `${int(2008, 2023)}-${pad(int(1, 12), 2)}-${pad(int(1, 28), 2)}`,
        etablissement: def.name,
        annee_scolaire_id: def.yearId,
        fonction_etablissement: seat.fonction,
        decision_affectation_num: `N°${pad(int(100, 999), 3)}/MPTA/${int(2015, 2024)}`,
        date_affectation: `${int(2015, 2024)}-${pad(int(1, 12), 2)}-${pad(int(1, 28), 2)}`,
        date_prise_service: `${int(2016, 2024)}-${pad(int(1, 12), 2)}-${pad(int(1, 28), 2)}`,
        date_arrivee_region: `${int(2016, 2024)}-${pad(int(1, 12), 2)}-${pad(int(1, 28), 2)}`,
        date_arrivee_etablissement: `${int(2016, 2024)}-${pad(int(1, 12), 2)}-${pad(int(1, 28), 2)}`,
        ancien_etablissement: chance(0.5) ? pick(['CEG Tokoin', 'Lycée de Bè', 'CEG Adidogomé', 'Collège Saint-Joseph']) : null,
        service_direction: seat.type === 'Administratif' ? seat.fonction : 'Enseignement',
        matiere_principale: isTeacher ? seat.matiere.name : null,
        matieres_secondaires: isTeacher && seat.second ? JSON.stringify([SUBJECT_CATALOG.find((c) => c.code === seat.second).name]) : null,
        classes_principales: null,
        volume_horaire_hebdo: isTeacher ? pick([18, 20, 22, 24]) : null,
        est_prof_principal: 0,
        est_responsable_classe: 0,
        heures_prevues: isTeacher ? pick([400, 450, 500]) : null,
        heures_effectuees: isTeacher ? pick([60, 80, 100]) : null,
        statut_administratif: 'Actif',
        observations: null,
        est_actif: 1,
        created_by: def.directionUser || null,
        updated_by: null,
        created_at: seedStamp(28, 8),
        updated_at: seedStamp(28, 8),
      };
      staffRecords.push(rec);
      if (isTeacher) {
        setPush(staffBySubject, seat.matiere.code, { id: rec.id, matiere: seat.matiere.code });
        if (seat.second) {
          setPush(staffBySubject, seat.second, { id: rec.id, matiere: seat.second });
        }
      }
    }
    out.staff.push(...staffRecords);
    const teacherPool = staffRecords.filter((s) => s.type_personnel === 'Enseignant');
    const directionStaff = staffRecords[0];
    const nextTeacher = (() => {
      let i = 0;
      return () => teacherPool[i++ % teacherPool.length];
    })();
    const teacherForSubject = (code) => {
      const list = staffBySubject[code];
      if (list && list.length) return pick(list).id;
      return nextTeacher().id;
    };

    // ── Classes ──────────────────────────────────────────────
    const classRecords = [];
    const homeroomSeats = [...teacherPool];
    let homeroomIdx = 0;
    for (const cname of def.classes) {
      const lvl = levelOf(cname);
      const ser = seriesOf(cname);
      const seriesId = ser ? (seriesBy[`${lvl}:${ser}`] || {}).id ?? null : (lvl === 'Seconde' ? (seriesBy['Seconde:Générale'] || {}).id ?? null : null);
      const homeroom = teacherPool.length ? homeroomSeats[homeroomIdx++ % homeroomSeats.length] : null;
      const cls = {
        id: makeId(`${def.key}-class-${cname}`),
        school_id: def.id,
        academic_year_id: def.yearId,
        name: cname,
        level: lvl,
        level_id: levelBy[lvl].id,
        series_id: seriesId,
        homeroom_teacher_id: homeroom ? homeroom.id : null,
        max_students: 45,
        created_at: seedStamp(29, 8),
        updated_at: seedStamp(29, 8),
      };
      classRecords.push(cls);
      if (homeroom) {
        homeroom.est_prof_principal = 1;
        const arr = homeroom.classes_principales ? JSON.parse(homeroom.classes_principales) : [];
        arr.push(cname);
        homeroom.classes_principales = JSON.stringify(arr);
        homeroom.est_responsable_classe = 1;
      }
    }
    out.classes.push(...classRecords);

    // ── Périodes d'évaluation (une série par classe) ─────────
    // L'application charge les périodes par classe via
    // `get_grading_periods(classId)` : les périodes doivent donc porter
    // le `class_id` de la classe à laquelle elles appartiennent.
    const periodByClass = {};
    for (const cls of classRecords) {
      periodByClass[cls.id] = {};
      for (const p of PERIODS) {
        const gp = {
          id: makeId(`${def.key}-period-${cls.name}-${p.order}`),
          school_id: def.id,
          academic_year_id: def.yearId,
          class_id: cls.id,
          name: p.name,
          period_order: p.order,
          start_date: p.start,
          end_date: p.end,
          is_active: p.active,
          created_at: seedStamp(27, 8),
          updated_at: seedStamp(27, 8),
        };
        out.gradingPeriods.push(gp);
        periodByClass[cls.id][p.order] = gp;
      }
    }

    // ── Affectations matière × classe ────────────────────────
    const classSubjectByClass = {};
    for (const cls of classRecords) {
      const codes = subjectsForLevel(cls.level);
      classSubjectByClass[cls.id] = [];
      codes.forEach((code, idx) => {
        const cat = SUBJECT_CATALOG.find((c) => c.code === code);
        const teacherId = teacherForSubject(code);
        const cs = {
          id: makeId(`${def.key}-cs-${cls.name}-${code}`),
          school_id: def.id,
          academic_year_id: def.yearId,
          class_id: cls.id,
          subject_id: subjectBy[code].id,
          teacher_id: teacherId,
          coefficient: cat.coef,
          weekly_hours: cat.coef >= 4 ? 5 : cat.coef === 2 ? 3 : 2,
          subject_type: cat.coef >= 4 ? 'principal' : 'secondaire',
          is_mandatory: code === 'ARA' || code === 'ALL' || code === 'MUS' || code === 'ART' ? 0 : 1,
          order_index: idx,
          color_icon: cat.color,
          created_at: seedStamp(30, 8),
          updated_at: seedStamp(30, 8),
        };
        out.classSubjects.push(cs);
        classSubjectByClass[cls.id].push(cs);
        out.teacherAssignments.push({
          id: makeId(`${def.key}-ta-${cls.name}-${code}`),
          school_id: def.id,
          academic_year_id: def.yearId,
          teacher_id: teacherId,
          class_subject_id: cs.id,
          created_at: seedStamp(30, 8),
          updated_at: seedStamp(30, 8),
        });
      });
    }

    // ── Élèves + inscriptions ────────────────────────────────
    const perClass = Math.max(8, Math.round(def.studentTarget / classRecords.length));
    let studentSeq = 0;
    let enrollmentSeq = 0;
    let receiptSeq = 0;
    const studentsByClass = {};
    const schoolStudents = [];
    for (const cls of classRecords) {
      studentsByClass[cls.id] = [];
      const [ageMin, ageMax] = ageRangeForLevel(cls.level);
      for (let i = 0; i < perClass; i++) {
        studentSeq += 1;
        const sex = chance(0.5) ? 'M' : 'F';
        const p = person(sex);
        const sid = makeId(`${def.key}-student-${studentSeq}`);
        const st = {
          id: sid,
          school_id: def.id,
          first_name: p.first,
          last_name: p.last,
          birth_date: birthDateFor(ageMin, ageMax),
          birth_place: placeOfBirth(),
          gender: sex,
          photo_url: null,
          matricule: `${def.prefix}-2026-${pad(studentSeq, 4)}`,
          address: `${pick(QUARTIERS)}, ${pick(RUES)}`,
          phone: chance(0.3) ? phone() : null,
          parent_name: `${pick(EMERGENCY)} ${p.last}`,
          parent_phone: phone(),
          parent_email: chance(0.6) ? `${p.last.toLowerCase()}@gmail.com` : null,
          blood_type: pick(BLOOD_TYPES),
          medical_notes: chance(0.06) ? pick(MEDICAL_NOTES) : null,
          created_at: seedStamp(2, 9),
          updated_at: seedStamp(2, 9),
        };
        out.students.push(st);
        schoolStudents.push(st);
        studentsByClass[cls.id].push(st);

        enrollmentSeq += 1;
        const enr = {
          id: makeId(`${def.key}-enrollment-${enrollmentSeq}`),
          school_id: def.id,
          academic_year_id: def.yearId,
          student_id: sid,
          class_id: cls.id,
          enrollment_number: `${def.prefix}-2026-${pad(enrollmentSeq, 4)}`,
          enrollment_date: '2026-09-14',
          status: 'ACTIVE',
          enrollment_type: chance(0.85) ? 'NEW' : 'TRANSFER_CLASS',
          previous_class_id: null,
          created_at: seedStamp(2, 9),
          updated_at: seedStamp(2, 9),
        };
        out.enrollments.push(enr);
        st._enrollment = enr;
      }
    }

    // ── Historique d'inscription (réorientations) ────────────
    const historyCount = def.local ? 32 : 8;
    for (let i = 0; i < historyCount; i++) {
      const st = schoolStudents[schoolStudents.length - 1 - i];
      if (!st || !st._enrollment) continue;
      const cls = classRecords.find((c) => c.id === st._enrollment.class_id);
      const siblings = classRecords.filter((c) => c.id !== cls.id && c.level === cls.level);
      const target = siblings.length ? pick(siblings) : cls;
      out.enrollmentHistory.push({
        id: makeId(`${def.key}-hist-${i}`),
        enrollment_id: st._enrollment.id,
        student_id: st.id,
        academic_year_id: def.yearId,
        from_class_id: cls.id,
        to_class_id: target.id,
        reason: pick(['Changement de classe', 'Réorientation pédagogique', 'Décision du conseil de classe']),
        changed_by: def.directionUser || null,
        changed_at: seedStamp(5, 9),
      });
    }

    // ── Notes ────────────────────────────────────────────────
    const recordedBy = def.directionUser || null; // résolu côté cloud si null
    const subjectCodeById = Object.fromEntries(out.subjects.map((s) => [s.id, s.code]));
    const evalDates = {
      1: ['2026-10-05', '2026-10-28'],
      2: ['2027-02-10', '2027-03-12'],
      3: ['2027-05-10', '2027-06-08'],
    };
    const evaluationTypes = ['Devoir 1', 'Interrogation'];
    for (const cls of classRecords) {
      const students = studentsByClass[cls.id];
      for (const cs of classSubjectByClass[cls.id]) {
        const subjCode = subjectCodeById[cs.subject_id];
        for (const enr of students.map((s) => s._enrollment)) {
          const baseAbility = 9 + rnd() * 8; // 9..17
          for (const period of PERIODS) {
            evaluationTypes.forEach((evType, evIdx) => {
              const absent = chance(0.012);
              const subjAdj = (subjCode === 'MAT' || subjCode === 'PC' || subjCode === 'SVT') ? -0.8 : (subjCode === 'EPS' ? 2.5 : 0.4);
              let score = baseAbility + subjAdj + (rnd() * 3 - 1.5);
              score = Math.max(0, Math.min(20, Math.round(score * 2) / 2));
              const evalDate = evalDates[period.order][evIdx];
              out.grades.push({
                id: makeId(`${def.key}-grade-${cs.id}-${enr.id}-${period.order}-${evIdx}`),
                school_id: def.id,
                academic_year_id: def.yearId,
                enrollment_id: enr.id,
                student_id: enr.student_id,
                class_subject_id: cs.id,
                grading_period_id: periodByClass[cls.id][period.order].id,
                grade_type_id: gradeTypeBy[evType].id,
                score: absent ? 0 : score,
                max_score: 20,
                evaluation_date: evalDate,
                notes: chance(0.04) ? pick(['Bon travail', 'Peut mieux faire', 'Élève sérieux', 'Doit fournir plus d’efforts', 'Bonne participation']) : null,
                recorded_by: recordedBy,
                is_absent: absent ? 1 : 0,
                created_at: seedStamp(12, 10),
                updated_at: seedStamp(12, 10),
              });
            });
          }
        }
      }
    }

    // ── Grille tarifaire ─────────────────────────────────────
    const feeDefs = [
      { name: "Frais d'inscription", amount: 1500000, type: 'INSCRIPTION', applies: 'ALL', due: '2026-09-20', mandatory: 1 },
      { name: 'Frais de dossier scolaire', amount: 500000, type: 'INSCRIPTION', applies: 'ALL', due: '2026-09-20', mandatory: 1 },
      { name: 'Scolarité – Trimestre 1 (Collège)', amount: 3500000, type: 'SCOLARITE', applies: 'ALL', due: '2026-10-05', mandatory: 1 },
      { name: 'Scolarité – Trimestre 1 (Lycée)', amount: 4500000, type: 'SCOLARITE', applies: 'ALL', due: '2026-10-05', mandatory: 1 },
      { name: 'Scolarité – Trimestre 2', amount: 3500000, type: 'SCOLARITE', applies: 'ALL', due: '2027-01-15', mandatory: 1 },
      { name: 'Scolarité – Trimestre 3', amount: 3500000, type: 'SCOLARITE', applies: 'ALL', due: '2027-04-15', mandatory: 1 },
      { name: 'Fournitures scolaires', amount: 800000, type: 'AUTRE', applies: 'ALL', due: '2026-09-25', mandatory: 1 },
      { name: 'Tenue de sport (EPS)', amount: 500000, type: 'AUTRE', applies: 'ALL', due: '2026-09-30', mandatory: 0 },
      { name: 'Cantine – Trimestre', amount: 1800000, type: 'CANTINE', applies: 'ALL', due: '2026-10-01', mandatory: 0 },
      { name: 'Transport scolaire – Trimestre', amount: 2500000, type: 'TRANSPORT', applies: 'ALL', due: '2026-10-01', mandatory: 0 },
      { name: "Frais d'examen (BCECOG)", amount: 1200000, type: 'AUTRE', applies: 'LEVEL', level: '3ème', due: '2027-04-10', mandatory: 1 },
    ];
    const feeBy = {};
    for (const fd of feeDefs) {
      const f = {
        id: makeId(`${def.key}-fee-${fd.name}`),
        school_id: def.id,
        academic_year_id: def.yearId,
        name: fd.name,
        amount: fd.amount,
        fee_type: fd.type,
        applies_to: fd.applies,
        class_id: null,
        level: fd.level || null,
        due_date: fd.due,
        is_mandatory: fd.mandatory,
        created_at: seedStamp(1, 9),
        updated_at: seedStamp(1, 9),
      };
      out.feeStructures.push(f);
      feeBy[fd.name] = f;
    }

    // ── Paiements (jusqu'au 14/10/2026) ──────────────────────
    const methods = ['ESPECES', 'MOBILE_MONEY', 'MOBILE_MONEY', 'VIREMENT', 'CHEQUE'];
    const recUser = def.directionUser || null;
    const payDay = () => {
      const month = chance(0.6) ? '2026-09' : '2026-10';
      const maxDay = chance(0.6) ? 28 : 14;
      return `${month}-${pad(int(1, month === '2026-10' ? 14 : maxDay), 2)} ${pad(int(7, 16), 2)}:${pad(int(0, 59), 2)}:00`;
    };
    for (const st of schoolStudents) {
      const enr = st._enrollment;
      const cls = classRecords.find((c) => c.id === enr.class_id);
      const fees = [];
      const isCollege = ['6ème', '5ème', '4ème', '3ème'].includes(cls.level);
      fees.push(['Frais d\'inscription', 0.92], ['Frais de dossier scolaire', 0.85]);
      fees.push([isCollege ? 'Scolarité – Trimestre 1 (Collège)' : 'Scolarité – Trimestre 1 (Lycée)', 0.65]);
      fees.push(['Fournitures scolaires', 0.35]);
      fees.push(['Tenue de sport (EPS)', 0.25]);
      fees.push(['Cantine – Trimestre', 0.12]);
      fees.push(['Transport scolaire – Trimestre', 0.1]);
      for (const [fname, prob] of fees) {
        if (!chance(prob)) continue;
        const fee = feeBy[fname];
        receiptSeq += 1;
        const partial = chance(0.12);
        const method = pick(methods);
        const cancelled = chance(0.012);
        const dt = payDay();
        out.payments.push({
          id: makeId(`${def.key}-payment-${st.id}-${fname}`),
          school_id: def.id,
          academic_year_id: def.yearId,
          enrollment_id: enr.id,
          student_id: st.id,
          fee_structure_id: fee.id,
          amount: partial ? Math.round(fee.amount / 2) : fee.amount,
          payment_date: dt.slice(0, 10),
          payment_method: method,
          reference: method === 'MOBILE_MONEY' ? `T-Money ${phone().replace(/\s/g, '').slice(0, 10)}` : method === 'CHEQUE' ? `CHQ-${pad(int(1000, 9999), 4)}` : method === 'VIREMENT' ? `VIR-${pad(int(100000, 999999), 6)}` : null,
          receipt_number: `REC-${def.prefix}-${pad(receiptSeq, 5)}`,
          notes: partial ? 'Acompte – solde à régler' : null,
          recorded_by: recUser,
          status: cancelled ? 'CANCELLED' : 'VALID',
          cancelled_at: cancelled ? dt : null,
          cancel_reason: cancelled ? pick(['Erreur de saisie', 'Double paiement', 'Chèque impayé']) : null,
          created_at: dt,
          updated_at: dt,
        });
      }
    }

    // ── Emploi du temps (local uniquement) ───────────────────
    if (def.local) {
      for (const cls of classRecords) {
        const subjects = classSubjectByClass[cls.id].map((cs) => cs.subject_id);
        for (let day = 1; day <= 5; day++) {
          for (let slot = 0; slot < 8; slot++) {
            const empty = chance(0.08);
            out.timetableSlots.push({
              id: makeId(`${def.key}-tt-${cls.name}-${day}-${slot}`),
              school_id: def.id,
              academic_year_id: def.yearId,
              class_id: cls.id,
              day_of_week: day,
              slot_index: slot,
              subject_id: empty ? null : subjects[(day * 8 + slot) % subjects.length],
              created_at: seedStamp(4, 9),
              updated_at: seedStamp(4, 9),
            });
          }
        }
      }
    }
  }

  // ── Appareils ───────────────────────────────────────────────
  const deviceDefs = [
    { id: EXISTING_DEVICE_ID, school: 'saint-louis', identifier: 'd361825a-2c84-4271-a5f6-e6a6d7f24fae', name: 'DESKTOP-N4SHUCT', platform: 'Windows', status: 'ACTIVE', seen: ts(2026, 10, 14, 16, 0) },
    { school: 'saint-louis', identifier: 'PC-SECRETARIAT-01', name: 'PC-SECRETARIAT-01', platform: 'Windows', status: 'ACTIVE', seen: ts(2026, 10, 15, 9, 30) },
    { school: 'saint-louis', identifier: 'TABLETTE-SALLE-INFO', name: 'TABLETTE-SALLE-INFO', platform: 'Android', status: 'IDLE', seen: ts(2026, 10, 12, 11, 0) },
    { school: 'agora', identifier: 'PC-DIRECTION-AGORA', name: 'PC-DIRECTION-AGORA', platform: 'Windows', status: 'ACTIVE', seen: ts(2026, 10, 15, 8, 15) },
    { school: 'agora', identifier: 'TABLETTE-PORTIER-AGORA', name: 'TABLETTE-PORTIER-AGORA', platform: 'Android', status: 'OFFLINE', seen: ts(2026, 10, 5, 17, 45) },
    { school: 'notre-dame', identifier: 'PC-DIRECTION-NDL', name: 'PC-DIRECTION-NDL', platform: 'Windows', status: 'ACTIVE', seen: ts(2026, 10, 14, 14, 20) },
    { school: 'notre-dame', identifier: 'PC-SALLE-INFO-NDL', name: 'PC-SALLE-INFO-NDL', platform: 'Windows', status: 'IDLE', seen: ts(2026, 10, 10, 10, 5) },
  ];
  for (const dd of deviceDefs) {
    const school = SCHOOL_DEFS.find((s) => s.key === dd.school);
    out.devices.push({
      id: dd.id || makeId(`device-${dd.identifier}`),
      school_id: school.id,
      device_identifier: dd.identifier,
      device_name: dd.name,
      platform: dd.platform,
      status: dd.status,
      last_seen_at: dd.seen,
      created_at: seedStamp(22, 8),
      updated_at: dd.seen,
    });
  }

  // ── Licences ────────────────────────────────────────────────
  const slSchool = SCHOOL_DEFS.find((s) => s.key === 'saint-louis');
  const agoraSchool = SCHOOL_DEFS.find((s) => s.key === 'agora');
  const ndlSchool = SCHOOL_DEFS.find((s) => s.key === 'notre-dame');
  out.licenses.push(
    {
      id: makeId('license-agora-suspended'),
      school_id: agoraSchool.id,
      license_key: licenseKey(),
      status: 'SUSPENDED',
      issued_at: ts(2026, 8, 1, 10, 0),
      starts_at: ts(2026, 8, 1, 0, 0),
      expires_at: ts(2026, 12, 31, 23, 59),
      max_devices: 4,
      created_at: ts(2026, 8, 1, 10, 0),
      updated_at: ts(2026, 8, 1, 10, 0),
    },
    {
      id: makeId('license-agora-active'),
      school_id: agoraSchool.id,
      license_key: licenseKey(),
      status: 'ACTIVE',
      issued_at: ts(2026, 10, 1, 9, 0),
      starts_at: ts(2026, 10, 1, 0, 0),
      expires_at: ts(2026, 11, 5, 23, 59),
      max_devices: 6,
      created_at: ts(2026, 10, 1, 9, 0),
      updated_at: ts(2026, 10, 1, 9, 0),
    },
    {
      id: makeId('license-ndl-active'),
      school_id: ndlSchool.id,
      license_key: licenseKey(),
      status: 'ACTIVE',
      issued_at: ts(2026, 9, 1, 8, 30),
      starts_at: ts(2026, 9, 1, 0, 0),
      expires_at: ts(2027, 8, 31, 23, 59),
      max_devices: 8,
      created_at: ts(2026, 9, 1, 8, 30),
      updated_at: ts(2026, 9, 1, 8, 30),
    }
  );

  // ── Comptes (Cloud uniquement) ──────────────────────────────
  // Les mots de passe ne sont JAMAIS stockés dans le dépôt : ils sont lus
  // dans l'environnement (fichier .env, ignoré par git). Chaque compte pointe
  // sur sa variable ; voir .env.example pour la liste complète.
  const accountDefs = [
    { school: 'saint-louis', role: 'SECRETAIRE', first: 'Ahoefa', last: 'SODJI', email: 'secretaire.saintlouis@saintlouis-tg.com', pwEnv: 'SEED_PW_SAINT_LOUIS_SECRETARY', phone: '228 90123456' },
    { school: 'saint-louis', role: 'COMPTABLE', first: 'Kodjo', last: 'TCHALLA', email: 'comptable.saintlouis@saintlouis-tg.com', pwEnv: 'SEED_PW_SAINT_LOUIS_COMPTABLE', phone: '228 90345678' },
    { school: 'saint-louis', role: 'PROFESSEUR', first: 'Kossi', last: 'AGBO', email: 'kossi.agbo@saintlouis-tg.com', pwEnv: 'SEED_PW_SAINT_LOUIS_PROF_KOSSI', phone: '228 90567890' },
    { school: 'saint-louis', role: 'PROFESSEUR', first: 'Afi', last: 'DOSSOU', email: 'afi.dossou@saintlouis-tg.com', pwEnv: 'SEED_PW_SAINT_LOUIS_PROF_AFI', phone: '228 90789012' },
    { school: 'agora', role: 'DIRECTION', first: 'Yao', last: 'AMEGAN', email: 'direction@agora-lome.tg', pwEnv: 'SEED_PW_AGORA_DIRECTION', phone: '228 90112233' },
    { school: 'agora', role: 'SECRETAIRE', first: 'Enyonam', last: 'GBENYO', email: 'secretaire@agora-lome.tg', pwEnv: 'SEED_PW_AGORA_SECRETARY', phone: '228 90445588' },
    { school: 'notre-dame', role: 'DIRECTION', first: 'Bernadette', last: 'GNAMI', email: 'direction@ndl-lome.tg', pwEnv: 'SEED_PW_NDL_DIRECTION', phone: '228 90445566' },
    { school: 'notre-dame', role: 'SECRETAIRE', first: 'Akouvi', last: 'ANOMA', email: 'secretaire@ndl-lome.tg', pwEnv: 'SEED_PW_NDL_SECRETARY', phone: '228 90887766' },
  ];

  // Résolution des mots de passe : exigée uniquement quand les comptes sont
  // réellement créés (seed cloud). Le seed local n'a pas besoin des comptes.
  const missingPwEnv = accountDefs
    .filter((ad) => !(process.env[ad.pwEnv] || '').trim())
    .map((ad) => ad.pwEnv);
  if (missingPwEnv.length && options.requireAccountPasswords) {
    console.error('Variables de mot de passe manquantes : ' + missingPwEnv.join(', '));
    console.error('Renseignez-les dans le fichier .env (voir .env.example).');
    process.exit(1);
  }

  for (const ad of accountDefs) {
    const school = SCHOOL_DEFS.find((s) => s.key === ad.school);
    const password = (process.env[ad.pwEnv] || '').trim();
    out.accounts.push({
      schoolId: school.id,
      schoolKey: ad.school,
      role: ad.role,
      first_name: ad.first,
      last_name: ad.last,
      email: ad.email,
      password,
      phone: ad.phone,
      metadata: { school_id: school.id, first_name: ad.first, last_name: ad.last, role: ad.role, initial_password: password },
    });
  }

  return out;
}

function setPush(obj, key, value) {
  if (!obj[key]) obj[key] = [];
  obj[key].push(value);
  return true;
}
