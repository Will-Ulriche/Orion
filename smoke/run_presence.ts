/* Smoke « liste de présence » : génère smoke/presence_out.pdf (données fictives). */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPresenceListPdf, nominalListFileName } from '../src/lib/presenceListPdf';
import type { NominalListClassInput } from '../src/lib/nominalListTemplate';

const templatePath = resolve(process.cwd(), 'public/liste_de_presence.pdf');
const outPath = resolve(process.cwd(), 'smoke/presence_out.pdf');

// Le libellé fetch('/liste_de_presence.pdf') attend un serveur : en Node on sert
// le fichier depuis le disque.
const nativeFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
  if (String(input).startsWith('/')) {
    const buf = readFileSync(templatePath);
    return new Response(new Uint8Array(buf), { status: 200 });
  }
  return nativeFetch(input as RequestInfo);
}) as typeof fetch;

const LAST_NAMES = [
  'KPOVITCHE',
  'MBALLA',
  'OYANE',
  'ESSOMBA',
  'NKOLO ABENA',
  'FOUDA',
  'AMEGAN',
];
const FIRST_NAMES = [
  'GWEMENE GLORIA DE DIEU',
  'Marie-José',
  'Jean-Baptiste',
  'Aïcha',
  'Pierre Émile Bénédicte',
  'Louise',
];

// 35 élèves → 2 pages (28 + 7), noms longs + accents + genres mixtes.
const bigClass: NominalListClassInput = {
  id: 'c1',
  name: '6ème A',
  students: Array.from({ length: 35 }, (_, i) => ({
    id: `s${i}`,
    lastName: `${LAST_NAMES[i % LAST_NAMES.length]}${i > 6 ? ` ${i}` : ''}`,
    firstName: FIRST_NAMES[i % FIRST_NAMES.length],
    gender: i % 3 === 0 ? null : i % 2 ? 'M' : 'F',
  })),
};

// Petite classe → 1 page, contrôle du deuxième export.
const smallClass: NominalListClassInput = {
  id: 'c2',
  name: '3ème B',
  students: [
    { id: 't1', lastName: 'ZONGO', firstName: 'Alice', gender: 'F' },
    { id: 't2', lastName: 'BATOGO', firstName: 'Paul', gender: 'M' },
    { id: 't3', lastName: 'NGUEMA', firstName: 'Serge', gender: 'M' },
  ],
};

const classes = [bigClass, smallClass];
const bytes = await buildPresenceListPdf(classes, 'Collège', '2025-2026');
writeFileSync(outPath, bytes);

const name = nominalListFileName(classes, 'Collège', '2025-2026', 'Presence');
console.log(`OK ${outPath} (${bytes.length} octets) — nom : ${name}`);
