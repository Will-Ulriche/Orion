import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
/**
* Bande horizontale libre entre les images (qui s'arrêtent à 169,80 pt) et le
* bloc « CLASSE : » (694,54 pt). Le titre du modèle y est centré.
*/
var TITLE_BAND = {
	left: 169.8,
	right: 694.54
};
(TITLE_BAND.left + TITLE_BAND.right) / 2;
var deaccent = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/**
* Ramène la valeur de `students.gender` à « M », « F » ou ''.
* La base stocke 'M'/'F' ; on tolère les libellés complets et
* garçon/fille saisis à la main dans d'autres jeux de données.
*/
function genderCode(raw) {
	const v = deaccent((raw ?? "").trim()).toLowerCase();
	if (!v) return "";
	if (v.startsWith("m") || v.startsWith("g") || v === "h" || v === "homme") return "M";
	if (v.startsWith("f") || v === "fille") return "F";
	return "";
}
//#endregion
//#region src/lib/presenceListPdf.ts
var nominalListFileName = (classes, groupLabel, yearName, type) => {
	const safeGroup = groupLabel.replace(/[^a-z0-9]/gi, "_");
	const safeYear = yearName.replace(/[^a-z0-9]/gi, "_");
	return `Liste_${type}_${classes.length === 1 ? classes[0].name.replace(/[^a-z0-9]/gi, "_") : "Classes"}_${safeGroup}_${safeYear}.pdf`;
};
var GEOM = {
	/** Valeur après le « CLASSE : » du modèle (baseline 551,2 ; page à 841,92). */
	classField: {
		x: 718,
		baseline: 551.2,
		size: 11,
		maxW: 100
	},
	/** « Année : … » centré sous le titre, dans la bande libre 488…530 pt. */
	yearField: {
		centerX: 841.92 / 2,
		baseline: 510,
		size: 11,
		maxW: 240
	},
	/** Cellules de valeurs de l'encadré G / F / T (sous les lettres, baseline 516,6). */
	gft: {
		centers: [
			686.3,
			728.7,
			771.2
		],
		baseline: 516.6,
		size: 12
	},
	table: {
		/** Filet sous l'en-tête « N° + jours » et filet bas du cadre. */
		headerBottom: 448.1,
		bottomRule: 37.8,
		/** 28 lignes d'élèves entre ces deux filets (mesuré). */
		rows: 28,
		/** Colonne NOM : filets du modèle de 56,9 à 240,6 ; texte calé à 62. */
		nameX: 62,
		nameMaxW: 176,
		/** Colonne N° : 21,4 → 56,9 ; le numéro est centré à 43. */
		noCenterX: 43,
		size: 10.5,
		minSize: 7,
		/** baseline = bas de ligne + 4,5 (relevé sur les espaces du modèle). */
		baselineOffset: 4.5
	}
};
/** Pas vertical réel des lignes : (448,1 − 37,8) / 28 = 14,6536 pt. */
var ROW_STEP = (GEOM.table.headerBottom - GEOM.table.bottomRule) / GEOM.table.rows;
/** Baseline de la ligne `row` (0 = première ligne sous l'en-tête). */
var rowBaseline = (row) => GEOM.table.headerBottom - (row + 1) * ROW_STEP + GEOM.table.baselineOffset;
/**
* WinAnsi (polices standard pdf-lib) : normalise les caractères typographiques
* puis retire tout caractère non encodable pour éviter un plantage de drawText.
*/
var winAnsi = (s) => s.replace(/[\u2018\u2019\u201A]/g, "'").replace(/[\u201C\u201D\u201E]/g, "\"").replace(/[\u2013\u2014]/g, "-").replace(/\u2022/g, "-").replace(/\u2026/g, "...").replace(/[^\u0020-\u00FF]/g, "");
/** Réduit la taille (par pas de 0,25) jusqu'à faire tenir `text` dans `maxW`. */
var fitSize = (text, font, maxW, base, min) => {
	for (let s = base; s > min; s -= .25) if (font.widthOfTextAtSize(text, s) <= maxW) return s;
	return min;
};
/** Format MIME d'une data-URI image ('' si ce n'en est pas une). */
var dataUrlMime = (dataUrl) => /^data:image\/([a-z0-9.+-]+)[;,]/i.exec(dataUrl)?.[1]?.toLowerCase() ?? "";
/**
* pdf-lib n'intègre que du PNG ou du JPEG, alors que la page Réglages encode le
* logo en WebP (canvas.toDataURL('image/webp')). On repasse par un canvas pour
* obtenir un PNG ; sans DOM (smoke Node) on renvoie l'original et l'intégration
* échoue proprement.
*/
var toEmbeddableImage = async (logoDataUrl) => {
	const mime = dataUrlMime(logoDataUrl);
	if (mime === "png" || mime === "jpeg" || mime === "jpg") return logoDataUrl;
	if (typeof document === "undefined" || typeof Image === "undefined") throw new Error(`Format de logo non pris en charge (${mime || "inconnu"}).`);
	const img = await new Promise((resolve, reject) => {
		const el = new Image();
		el.onload = () => resolve(el);
		el.onerror = () => reject(/* @__PURE__ */ new Error("Logo illisible."));
		el.src = logoDataUrl;
	});
	const canvas = document.createElement("canvas");
	canvas.width = img.naturalWidth || 1;
	canvas.height = img.naturalHeight || 1;
	canvas.getContext("2d")?.drawImage(img, 0, 0);
	const png = canvas.toDataURL("image/png");
	if (dataUrlMime(png) !== "png") throw new Error("Conversion du logo en PNG impossible.");
	return png;
};
/** Coupe avec « ... » quand même la taille minimale ne tient pas. */
var truncate = (text, font, size, maxW) => {
	if (font.widthOfTextAtSize(text, size) <= maxW) return text;
	let lo = 0;
	let hi = text.length;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (font.widthOfTextAtSize(`${text.slice(0, mid).trimEnd()}...`, size) <= maxW) lo = mid;
		else hi = mid - 1;
	}
	return `${text.slice(0, lo).trimEnd()}...`;
};
var templatePromise = null;
var getTemplate = () => {
	if (!templatePromise) {
		const promise = (async () => {
			const response = await fetch("/liste_de_presence.pdf");
			if (!response.ok) throw new Error("Impossible de charger le modèle de liste de présence.");
			return PDFDocument.load(await response.arrayBuffer());
		})();
		templatePromise = promise;
		promise.catch(() => {
			if (templatePromise === promise) templatePromise = null;
		});
	}
	return templatePromise;
};
/**
* Génère le PDF de liste de présence : une page du modèle par tranche de
* 28 élèves (numérotation continue), en-tête + encadré G/F/T redessinés.
*/
var buildPresenceListPdf = async (classes, _groupLabel, yearName, logoDataUrl, schoolName = "ORION COLLEGE EXPERIENCE") => {
	const srcDoc = await getTemplate();
	const out = await PDFDocument.create();
	const regular = await out.embedFont(StandardFonts.Helvetica);
	const bold = await out.embedFont(StandardFonts.HelveticaBold);
	const black = rgb(0, 0, 0);
	let embeddedLogo = null;
	if (logoDataUrl) try {
		const embeddable = await toEmbeddableImage(logoDataUrl);
		embeddedLogo = dataUrlMime(embeddable) === "png" ? await out.embedPng(embeddable) : await out.embedJpg(embeddable);
	} catch (e) {
		console.warn("Could not embed logo", e);
	}
	const yearLabel = winAnsi(`Année : ${yearName}`);
	for (const cls of classes) {
		const students = [...cls.students].sort((a, b) => (a.lastName || "").localeCompare(b.lastName || "") || (a.firstName || "").localeCompare(b.firstName || ""));
		const className = winAnsi(cls.name);
		let boys = 0;
		let girls = 0;
		for (const st of students) {
			const g = genderCode(st.gender);
			if (g === "M") boys += 1;
			else if (g === "F") girls += 1;
		}
		const gftValues = [
			String(boys),
			String(girls),
			String(students.length)
		];
		const parts = Math.max(1, Math.ceil(students.length / GEOM.table.rows));
		for (let part = 0; part < parts; part += 1) {
			const [page] = await out.copyPages(srcDoc, [0]);
			const pdfPage = out.addPage(page);
			if (embeddedLogo) {
				pdfPage.drawRectangle({
					x: 35,
					y: 497,
					width: 300,
					height: 83,
					color: rgb(1, 1, 1)
				});
				const dims = embeddedLogo.scale(1);
				const maxPtW = 180;
				const maxPtH = 65;
				const ratio = Math.min(maxPtW / dims.width, maxPtH / dims.height);
				const w = dims.width * ratio;
				const h = dims.height * ratio;
				const offsetX = 40 + (maxPtW - w) / 2;
				const offsetY = 505 + (maxPtH - h) / 2;
				pdfPage.drawImage(embeddedLogo, {
					x: offsetX,
					y: offsetY,
					width: w,
					height: h
				});
			}
			pdfPage.drawRectangle({
				x: 200,
				y: 545,
				width: 460,
				height: 35,
				color: rgb(1, 1, 1)
			});
			const titleLabel = winAnsi((schoolName || "ORION COLLEGE EXPERIENCE").toUpperCase());
			const titleFont = bold;
			const PAGE_CENTER_X = 841.92 / 2;
			const titleSize = fitSize(titleLabel, titleFont, 460, 16, 10);
			const titleWidth = titleFont.widthOfTextAtSize(titleLabel, titleSize);
			pdfPage.drawText(titleLabel, {
				x: PAGE_CENTER_X - titleWidth / 2,
				y: 550,
				size: titleSize,
				font: titleFont,
				color: rgb(.08, .34, .75)
			});
			const classSize = fitSize(className, bold, GEOM.classField.maxW, GEOM.classField.size, 7.5);
			pdfPage.drawText(truncate(className, bold, classSize, GEOM.classField.maxW), {
				x: GEOM.classField.x,
				y: GEOM.classField.baseline,
				size: classSize,
				font: bold,
				color: black
			});
			pdfPage.drawRectangle({
				x: GEOM.yearField.centerX - 150,
				y: 497,
				width: 300,
				height: 33,
				color: rgb(1, 1, 1)
			});
			const yearSize = fitSize(yearLabel, regular, GEOM.yearField.maxW, GEOM.yearField.size, 7.5);
			const yearWidth = regular.widthOfTextAtSize(yearLabel, yearSize);
			pdfPage.drawText(yearLabel, {
				x: GEOM.yearField.centerX - yearWidth / 2,
				y: GEOM.yearField.baseline,
				size: yearSize,
				font: regular,
				color: black
			});
			gftValues.forEach((value, i) => {
				const w = bold.widthOfTextAtSize(value, GEOM.gft.size);
				pdfPage.drawText(value, {
					x: GEOM.gft.centers[i] - w / 2,
					y: GEOM.gft.baseline,
					size: GEOM.gft.size,
					font: bold,
					color: black
				});
			});
			const start = part * GEOM.table.rows;
			const end = Math.min(students.length, start + GEOM.table.rows);
			for (let k = start; k < end; k += 1) {
				const st = students[k];
				const label = winAnsi(`${(st.lastName || "").trim()} ${(st.firstName || "").trim()}`.replace(/\s+/g, " ").trim().toUpperCase()) || "—";
				const baseline = rowBaseline(k - start);
				const num = String(k + 1);
				const numWidth = regular.widthOfTextAtSize(num, GEOM.table.size);
				pdfPage.drawText(num, {
					x: GEOM.table.noCenterX - numWidth / 2,
					y: baseline,
					size: GEOM.table.size,
					font: regular,
					color: black
				});
				const size = fitSize(label, regular, GEOM.table.nameMaxW, GEOM.table.size, GEOM.table.minSize);
				pdfPage.drawText(truncate(label, regular, size, GEOM.table.nameMaxW), {
					x: GEOM.table.nameX,
					y: baseline,
					size,
					font: regular,
					color: black
				});
			}
		}
	}
	return out.save();
};
//#endregion
//#region smoke/run_presence.ts
var templatePath = resolve(process.cwd(), "public/liste_de_presence.pdf");
var outPath = resolve(process.cwd(), "smoke/presence_out.pdf");
var nativeFetch = globalThis.fetch;
globalThis.fetch = (async (input) => {
	if (String(input).startsWith("/")) {
		const buf = readFileSync(templatePath);
		return new Response(new Uint8Array(buf), { status: 200 });
	}
	return nativeFetch(input);
});
var LAST_NAMES = [
	"KPOVITCHE",
	"MBALLA",
	"OYANE",
	"ESSOMBA",
	"NKOLO ABENA",
	"FOUDA",
	"AMEGAN"
];
var FIRST_NAMES = [
	"GWEMENE GLORIA DE DIEU",
	"Marie-José",
	"Jean-Baptiste",
	"Aïcha",
	"Pierre Émile Bénédicte",
	"Louise"
];
var classes = [{
	id: "c1",
	name: "6ème A",
	students: Array.from({ length: 35 }, (_, i) => ({
		id: `s${i}`,
		lastName: `${LAST_NAMES[i % LAST_NAMES.length]}${i > 6 ? ` ${i}` : ""}`,
		firstName: FIRST_NAMES[i % FIRST_NAMES.length],
		gender: i % 3 === 0 ? null : i % 2 ? "M" : "F"
	}))
}, {
	id: "c2",
	name: "3ème B",
	students: [
		{
			id: "t1",
			lastName: "ZONGO",
			firstName: "Alice",
			gender: "F"
		},
		{
			id: "t2",
			lastName: "BATOGO",
			firstName: "Paul",
			gender: "M"
		},
		{
			id: "t3",
			lastName: "NGUEMA",
			firstName: "Serge",
			gender: "M"
		}
	]
}];
var bytes = await buildPresenceListPdf(classes, "Collège", "2025-2026");
writeFileSync(outPath, bytes);
var name = nominalListFileName(classes, "Collège", "2025-2026", "Presence");
console.log(`OK ${outPath} (${bytes.length} octets) — nom : ${name}`);
//#endregion
export {};
