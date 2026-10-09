// Harness : rejoue exactement le pipeline de NominalListModal
// (assets → buildNominalListPdf → output('blob') → iframe) et journalise tout.
import { loadNominalListAssets, buildNominalListPdf } from '../../src/lib/nominalListPdf';
import { buildNominalListData, type NominalListClassInput } from '../../src/lib/nominalListTemplate';

const logEl = document.getElementById('log')!;
const log = (msg: string, cls = '') => {
  const line = document.createElement('div');
  line.className = cls;
  line.textContent = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  logEl.appendChild(line);
  console.log(msg);
};

const students: NominalListClassInput[] = [{
  id: 'c1',
  name: '6ème A',
  students: [
    { id: 's1', lastName: 'KPOVITCHE', firstName: 'Alice', gender: 'F' },
    { id: 's2', lastName: 'MBALLA', firstName: 'Paul', gender: 'M' },
    { id: 's3', lastName: 'ESSOMBA', firstName: 'Aïcha', gender: 'F' },
  ],
}];

(async () => {
  try {
    log('1) chargement des assets…');
    const assets = await loadNominalListAssets();
    log(`   assets OK (logo ${assets.logo.slice(0, 30)}…)`, 'ok');

    log('2) buildNominalListPdf (avec logo BMP illisible = logo d’école importé)…');
    const pages = buildNominalListData(students);
    const BMP = 'data:image/bmp;base64,Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABAAQAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
    const doc = buildNominalListPdf({ pages, assets: { ...assets, logo: BMP }, groupLabel: 'Collège', documentType: 'nominative' });
    log(`   PDF OK (${doc.getNumberOfPages()} page) — le repli sur le logo par défaut s'est appliqué`, 'ok');

    log("3) doc.output('blob')…");
    const blob = doc.output('blob');
    log(`   blob OK type=${blob.type} size=${blob.size}`, 'ok');

    log('4) URL.createObjectURL + iframe…');
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.title = 'Aperçu';
    iframe.addEventListener('load', () => log('   iframe: événement load reçu', 'ok'));
    document.getElementById('preview')!.appendChild(iframe);
    log('   TERMINÉ — le PDF doit apparaître dans l’iframe ci-dessous', 'ok');
  } catch (e) {
    log(`ÉCHEC : ${e instanceof Error ? e.stack ?? e.message : String(e)}`, 'err');
  }
})();
