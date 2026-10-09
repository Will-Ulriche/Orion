import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { jsPDF } from "jspdf";
//#region src/lib/nominalListTemplate.ts
/** Format de la page : A4 paysage. */
var PAGE = {
	width: 841.92,
	height: 595.32
};
/** Épaisseur des filets de tableau (Word dessine un rectangle plein de 0,48 pt). */
var BORDER = .48;
/**
* Word ancre le bord sur sa coordonnée et l'étend vers la droite/le bas ;
* pour un tracé au centre du chemin il faut donc décaler de la moitié.
*/
var BORDER_SHIFT = BORDER / 2;
var IMAGES = {
	logo: {
		x: 14.2,
		y: 9.6,
		w: 128.39,
		h: 64.2
	},
	qr: {
		x: 135.6,
		y: 25.8,
		w: 34.2,
		h: 34.2
	},
	watermark: {
		x: 224.3,
		y: 154.78,
		w: 383.15,
		h: 364.2
	}
};
/**
* Bande horizontale libre entre les images (qui s'arrêtent à 169,80 pt) et le
* bloc « CLASSE : » (694,54 pt). Le titre du modèle y est centré.
*/
var TITLE_BAND = {
	left: 169.8,
	right: 694.54
};
var TITLE_BAND_CENTER = (TITLE_BAND.left + TITLE_BAND.right) / 2;
var TEXT = {
	brand: {
		label: "ORION COLLEGE EXPERIENCE",
		size: 20.04,
		baseline: 41.76,
		color: [
			0,
			51,
			204
		],
		/**
		* Centre (430,74) relevé sur le modèle. Anton est bien plus étroit que le
		* substitut jsPDF : on garde le centre du modèle mais on compose à
		* l'espacement naturel (comme la liste de présence) — le corps est seulement
		* réduit si le texte dépasse la bande libre, l'interlettrage n'est jamais
		* écrasé (voir fitSize dans nominalListPdf).
		*/
		center: 430.74
	},
	classLabel: {
		label: "CLASSE :",
		size: 11.04,
		baseline: 44.16,
		x: 694.54
	},
	title: {
		label: "LISTE NOMINATIVE DE LA CLASSE",
		size: 15.96,
		baseline: 62.54,
		/**
		* Bord gauche du titre, relevé sur le modèle. Le titre y est centré, mais on
		* l'ancre ici plutôt que de le recalculer : les Times du modèle et celles des
		* deux rendus (Times New Roman puis Times-Roman) ont des métriques quasi
		* identiques, donc cette position est reproductible au dixième de point.
		* C'est l'inverse du bandeau, dont le substitut (Arial Narrow) est bien plus
		* large qu'Anton et doit rester centré.
		*/
		x: 298.61,
		/**
		* Filet noir qui souligne le titre dans le modèle.
		* `dy` est mesuré depuis la ligne de base du titre ; `width` est la largeur
		* du texte en Times New Roman (police de référence du modèle). Le PDF
		* (Times-Roman) mesure la sienne, qui diffère de quelques points.
		*/
		underline: {
			dy: 1.68,
			thickness: .72,
			width: 263.9
		}
	},
	footer: {
		label: "Orion Exp",
		size: 12,
		baseline: 580.32,
		x: 32.04
	}
};
var GFT = {
	colEdges: [
		694.42,
		736.78,
		779.26,
		821.76
	],
	rowEdges: [
		52.92,
		68.06,
		83.18
	],
	/** Fonds des trois colonnes, dans l'ordre G / F / T. */
	fills: [
		[
			213,
			220,
			228
		],
		[
			251,
			228,
			213
		],
		[
			255,
			242,
			204
		]
	],
	labels: [
		"G",
		"F",
		"T"
	],
	labelBaseline: 64.82,
	valueBaseline: 79.94,
	size: 12
};
var TRIMESTERS = {
	colEdges: [
		360.53,
		502.87,
		651.94,
		821.76
	],
	rowEdges: [97.94, 111.86],
	fill: [
		242,
		242,
		242
	],
	labels: [
		"TRIMESTRE 1",
		"TRIMESTRE 2",
		"TRIMESTRE 3"
	],
	baseline: 108.86,
	size: 11.04,
	/**
	* Marge latérale du libellé dans chaque cellule : le texte reste centré à
	* l'espacement naturel (seul le corps baisse s'il doit tenir — fitSize).
	*/
	padX: 8
};
/** 16 lignes verticales → 15 colonnes. */
var COL_EDGES = [
	30.36,
	65.52,
	320.81,
	356.21,
	391.73,
	427.13,
	462.55,
	502.75,
	538.27,
	573.67,
	609.19,
	651.7,
	694.18,
	736.78,
	779.26,
	821.76
];
/**
* 29 lignes horizontales : la 1ʳᵉ est le bord haut de l'en-tête de colonnes, la
* 2ᵉ son bord bas, les 27 suivantes délimitent les 27 lignes d'élèves du modèle.
*/
var ROW_EDGES = [
	117.14,
	131.06,
	146.18,
	161.3,
	176.42,
	191.69,
	206.81,
	221.93,
	237.05,
	252.17,
	267.41,
	282.53,
	297.65,
	312.79,
	328.03,
	343.15,
	358.27,
	373.39,
	388.63,
	403.75,
	418.87,
	433.99,
	449.26,
	464.38,
	479.5,
	494.62,
	509.86,
	524.98,
	540.1
];
/** Lignes de base des 27 lignes d'élèves du modèle. */
var ROW_BASELINES = [
	142.94,
	158.06,
	173.18,
	188.33,
	203.57,
	218.69,
	233.81,
	248.93,
	264.17,
	279.29,
	294.41,
	309.53,
	324.79,
	339.91,
	355.03,
	370.15,
	385.39,
	400.51,
	415.63,
	430.75,
	445.9,
	461.14,
	476.26,
	491.38,
	506.5,
	521.74,
	536.86
];
/** Nombre d'élèves que le modèle Printing tient sur une page. */
var ROWS_PER_PAGE = ROW_BASELINES.length;
/** Marge intérieure des cellules (alignement à gauche). */
var PAD_X = 5.64;
/** Taille de police de l'en-tête de colonnes. */
var HEAD_SIZE = 11.04;
/** Lignes de base de l'en-tête de colonnes : deux polices dans le modèle. */
var HEAD_BASELINE = {
	serif: 127.82,
	sans: 128.06
};
/**
* Le « e » de « MG » : le document d'origine le place 0,96 pt *plus bas* que la
* ligne de base de « MG » (et non en exposant) — valeur relevée, à reproduire.
*/
var SUPERSCRIPT = {
	size: 6.96,
	dy: .96
};
/**
* Les 15 colonnes du modèle, dans l'ordre.
*
* Deux particularités du document d'origine sont reproduites telles quelles :
*   • la colonne 8 est libellée « I1 » (et non « I ») ;
*   • les « I » du 1er et du 2e trimestre sont en Times, celui du 3e en Calibri —
*     incohérence de saisie dans le modèle, conservée volontairement.
*
* Les colonnes 4 à 15 restent vides : elles sont destinations des notes.
*/
var HEAD_COLUMNS = [
	{
		label: "N°",
		align: "center",
		font: "serif"
	},
	{
		label: "NOM ET PRENOM",
		align: "left",
		font: "serif"
	},
	{
		label: "Sexe",
		align: "left",
		font: "serif"
	},
	{
		label: "I",
		align: "center",
		font: "serif"
	},
	{
		label: "D",
		align: "center",
		font: "sans"
	},
	{
		label: "C",
		align: "center",
		font: "sans"
	},
	{
		label: "MG",
		superscript: "e",
		align: "center",
		font: "sans"
	},
	{
		label: "I1",
		align: "center",
		font: "serif"
	},
	{
		label: "D",
		align: "center",
		font: "sans"
	},
	{
		label: "C",
		align: "center",
		font: "sans"
	},
	{
		label: "MG",
		superscript: "e",
		align: "center",
		font: "sans"
	},
	{
		label: "I",
		align: "center",
		font: "sans"
	},
	{
		label: "D",
		align: "center",
		font: "sans"
	},
	{
		label: "C",
		align: "center",
		font: "sans"
	},
	{
		label: "MG",
		superscript: "e",
		align: "center",
		font: "sans"
	}
];
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
var upperFr = (s) => s.toLocaleUpperCase("fr-FR");
/**
* Construit les lignes d'une classe : tri par nom puis prénom (ordre français),
* nom en capitales comme dans le reste de l'application.
* Le genre absent devient « » pour que l'élève reste visible dans la liste.
*/
function buildNominalListRows(students) {
	return [...students].sort((a, b) => (a.lastName ?? "").localeCompare(b.lastName ?? "", "fr") || (a.firstName ?? "").localeCompare(b.firstName ?? "", "fr")).map((s, i) => {
		const last = (s.lastName ?? "").trim();
		const first = (s.firstName ?? "").trim();
		const fullName = `${last ? upperFr(last) : ""}${first ? ` ${first}` : ""}`.trim();
		return {
			studentId: s.id ?? "",
			number: String(i + 1),
			fullName: fullName || "—",
			gender: genderCode(s.gender)
		};
	});
}
/** Prépare l'ensemble des pages (une par classe), avec les effectifs G/F/T. */
function buildNominalListData(classes) {
	return classes.map((c) => {
		const rows = buildNominalListRows(c.students);
		const boys = rows.filter((r) => r.gender === "M").length;
		const girls = rows.filter((r) => r.gender === "F").length;
		return {
			id: c.id,
			name: c.name,
			rows,
			boys,
			girls,
			total: rows.length
		};
	});
}
/**
* Valeurs de l'encadré G / F / T : garçons, filles, total.
* Le total prend tous les élèves, y compris ceux dont le sexe est inconnu.
*/
function gftValues(page) {
	return [
		String(page.boys),
		String(page.girls),
		String(page.total)
	];
}
/** Nom de fichier sûr pour Windows (le projet impose déjà ce filtrage). */
var ILLEGAL_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
function sanitizeFileName(value, maxLength = 60) {
	return value.replace(ILLEGAL_FILE_CHARS, "").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, maxLength).trim();
}
/**
* Nom du PDF : `Liste_nominative_6eme_A_2025-2026.pdf` pour une classe,
* `Listes_nominatives_College_2025-2026.pdf` pour un export groupé.
*/
function nominalListFileName(pages, groupLabel, yearName, documentType) {
	const year = sanitizeFileName(yearName, 30) || "annee";
	const prefix = documentType === "notes" ? "Liste_de_notes_" : "Liste_nominative_";
	const groupPrefix = documentType === "notes" ? "Listes_de_notes_" : "Listes_nominatives_";
	if (pages.length === 1) return `${prefix}${sanitizeFileName(pages[0].name) || "classe"}_${year}.pdf`;
	return `${groupPrefix}${sanitizeFileName(groupLabel) || "ecole"}_${year}.pdf`;
}
//#endregion
//#region src/lib/nominalListPdf.ts
/** Data-URI du logo Orion (repli si le logo de l'école est illisible par jsPDF). */
var defaultLogoDataUrl = "";
/** Nombre de pages pour une seule classe (toujours ≥ 1). */
function pageCountFor(classData) {
	return Math.max(1, Math.ceil(classData.rows.length / ROWS_PER_PAGE));
}
/**
* Aplatit la liste des classes en pages. C'est l'unique source de vérité du
* découpage : l'aperçu étant le PDF lui-même (mêmes octets que le fichier
* téléchargé), le nombre de feuilles affiché est toujours celui obtenu.
*/
function layoutNominalList(pages) {
	return pages.flatMap((data) => {
		const parts = pageCountFor(data);
		return Array.from({ length: parts }, (_, i) => ({
			data,
			offset: i * ROWS_PER_PAGE,
			part: i + 1,
			parts
		}));
	});
}
var gftBottom = GFT.rowEdges[GFT.rowEdges.length - 1];
var trimesterBottom = TRIMESTERS.rowEdges[TRIMESTERS.rowEdges.length - 1];
var tableBottom = ROW_EDGES[ROW_EDGES.length - 1];
/** Anton et Calibri n'existent pas dans jsPDF : on pose la police la plus proche. */
var PDF_FONT = {
	serif: "times",
	sans: "helvetica"
};
var useFont = (doc, family, style = "normal") => {
	doc.setFont(PDF_FONT[family], style);
};
/**
* jsPDF ne propose pas A4 au dixième de point près (il utilise 841,89 × 595,28) ;
* on impose les dimensions exactes du modèle.
*/
var FORMAT = [PAGE.width, PAGE.height];
/** Centre `text` dans [from, to] sur la ligne de base `baseline`. */
function drawCentered(doc, text, from, to, baseline) {
	doc.text(text, (from + to) / 2, baseline, { align: "center" });
}
/**
* Réduit le corps (par pas de 0,25 pt) jusqu'à faire tenir `text` dans `maxW`.
*
* Même approche que la liste de présence : seule la taille de police baisse,
* l'interlettrage reste naturel. L'ancienne compression d'espacement
* (drawCondensed) collait les lettres, Anton/Calibri du modèle étant bien
* plus étroits que les substituts jsPDF (Helvetica/Times).
*/
function fitSize(doc, text, maxW, base, min) {
	for (let s = base; s > min; s -= .25) {
		doc.setFontSize(s);
		if (doc.getTextWidth(text) <= maxW) return s;
	}
	doc.setFontSize(min);
	return min;
}
/** Filet ancré sur sa coordonnée, comme Word (le trait part vers la droite/bas). */
function stroke(doc, x1, y1, x2, y2) {
	doc.line(x1 + BORDER_SHIFT, y1 + BORDER_SHIFT, x2 + BORDER_SHIFT, y2 + BORDER_SHIFT);
}
/** Aplat entre les filets d'une bande (la couleur est posée par l'appelant). */
function drawFill(doc, x, xNext, top, bottom) {
	doc.rect(x + BORDER_SHIFT, top + BORDER_SHIFT, xNext - x - BORDER_SHIFT, bottom - top - BORDER_SHIFT, "F");
}
/** Bandeau des trimestres : trois cellules centrées sur fond gris. */
var drawTrimesters = (doc) => {
	TRIMESTERS.colEdges.slice(0, -1).forEach((x, i) => {
		doc.setFillColor(TRIMESTERS.fill[0], TRIMESTERS.fill[1], TRIMESTERS.fill[2]);
		drawFill(doc, x, TRIMESTERS.colEdges[i + 1], TRIMESTERS.rowEdges[0], trimesterBottom);
	});
	TRIMESTERS.colEdges.forEach((x) => stroke(doc, x, TRIMESTERS.rowEdges[0], x, trimesterBottom + BORDER));
	TRIMESTERS.rowEdges.forEach((y) => stroke(doc, TRIMESTERS.colEdges[0], y, TRIMESTERS.colEdges[TRIMESTERS.colEdges.length - 1] + BORDER, y));
	useFont(doc, "sans", "bold");
	TRIMESTERS.labels.forEach((l, i) => {
		const from = TRIMESTERS.colEdges[i];
		const to = TRIMESTERS.colEdges[i + 1];
		fitSize(doc, l, to - from - TRIMESTERS.padX * 2, TRIMESTERS.size, 8);
		drawCentered(doc, l, from, to, TRIMESTERS.baseline);
	});
};
/** En-tête de colonnes : « MG » centré, suivi du « e » en exposant. */
function drawHeadCell(doc, col, from, to) {
	useFont(doc, col.font);
	doc.setFontSize(HEAD_SIZE);
	const baseline = HEAD_BASELINE[col.font];
	if (col.align === "center") {
		if (!col.superscript) {
			drawCentered(doc, col.label, from, to, baseline);
			return;
		}
		const wLabel = doc.getTextWidth(col.label);
		doc.setFontSize(SUPERSCRIPT.size);
		const wSup = doc.getTextWidth(col.superscript);
		doc.setFontSize(HEAD_SIZE);
		const x0 = (from + to) / 2 - (wLabel + wSup) / 2;
		doc.text(col.label, x0, baseline);
		doc.setFontSize(SUPERSCRIPT.size);
		doc.text(col.superscript, x0 + wLabel, baseline + SUPERSCRIPT.dy);
		return;
	}
	doc.text(col.label, from + PAD_X, baseline);
}
/**
* Pose une image en conservant son ratio dans le cadre du modèle.
* Un logo importé en format que jsPDF ne sait pas décoder (BMP, corrompu…)
* ne doit JAMAIS bloquer la génération du document : on renvoie `false` et
* l'appelant bascule sur un repli (ou continue sans image).
*/
function addImageSafe(doc, dataUrl, x, y, w, h) {
	if (!dataUrl) return false;
	try {
		const props = doc.getImageProperties(dataUrl);
		const ratio = Math.min(w / props.width, h / props.height);
		const finalW = props.width * ratio;
		const finalH = props.height * ratio;
		doc.addImage(dataUrl, props.fileType || "PNG", x + (w - finalW) / 2, y + (h - finalH) / 2, finalW, finalH, void 0, "FAST");
		return true;
	} catch {
		return false;
	}
}
/** Dessine une page complète : images, titres, encadrés, trame, élèves, filigrane. */
function drawPage(doc, page, assets, opts) {
	const { data, offset } = page;
	if (!addImageSafe(doc, assets.logo, IMAGES.logo.x, IMAGES.logo.y, IMAGES.logo.w, IMAGES.logo.h)) {
		if (defaultLogoDataUrl && defaultLogoDataUrl !== assets.logo) addImageSafe(doc, defaultLogoDataUrl, IMAGES.logo.x, IMAGES.logo.y, IMAGES.logo.w, IMAGES.logo.h);
	}
	addImageSafe(doc, assets.qr, IMAGES.qr.x, IMAGES.qr.y, IMAGES.qr.w, IMAGES.qr.h);
	useFont(doc, "sans", "bold");
	doc.setTextColor(...TEXT.brand.color);
	fitSize(doc, TEXT.brand.label, TITLE_BAND.right - TITLE_BAND.left, TEXT.brand.size, 10);
	const brandW = doc.getTextWidth(TEXT.brand.label);
	doc.text(TEXT.brand.label, TEXT.brand.center - brandW / 2, TEXT.brand.baseline);
	doc.setTextColor(0, 0, 0);
	useFont(doc, "serif");
	doc.setFontSize(TEXT.title.size);
	if (opts.documentType === "notes") {
		const titleText = "LISTE DE NOTES";
		drawCentered(doc, titleText, TITLE_BAND.left, TITLE_BAND.right, TEXT.title.baseline);
		const w = doc.getTextWidth(titleText);
		const x0 = TITLE_BAND_CENTER - w / 2;
		doc.setFillColor(0, 0, 0);
		doc.rect(x0, TEXT.title.baseline + TEXT.title.underline.dy, w, TEXT.title.underline.thickness, "F");
	} else {
		doc.text(TEXT.title.label, TEXT.title.x, TEXT.title.baseline);
		doc.setFillColor(0, 0, 0);
		doc.rect(TEXT.title.x, TEXT.title.baseline + TEXT.title.underline.dy, doc.getTextWidth(TEXT.title.label), TEXT.title.underline.thickness, "F");
	}
	useFont(doc, "serif", "bold");
	doc.setFontSize(TEXT.classLabel.size);
	const labelWidth = doc.getTextWidth(TEXT.classLabel.label);
	doc.text(TEXT.classLabel.label, TEXT.classLabel.x, TEXT.classLabel.baseline);
	doc.text(data.name, TEXT.classLabel.x + labelWidth, TEXT.classLabel.baseline);
	useFont(doc, "serif", "italic");
	doc.setFontSize(TEXT.footer.size);
	doc.text(TEXT.footer.label, TEXT.footer.x, TEXT.footer.baseline);
	if (opts.documentType === "notes" && opts.subjectName) {
		useFont(doc, "sans", "bold");
		doc.setFontSize(12);
		const textStr = `Matière : ${opts.subjectName}`;
		doc.text(textStr, COL_EDGES[1] + PAD_X, TRIMESTERS.baseline);
	}
	doc.setDrawColor(0, 0, 0);
	doc.setLineWidth(BORDER);
	GFT.fills.forEach((color, i) => {
		doc.setFillColor(color[0], color[1], color[2]);
		drawFill(doc, GFT.colEdges[i], GFT.colEdges[i + 1], GFT.rowEdges[0], gftBottom);
	});
	GFT.colEdges.forEach((x) => stroke(doc, x, GFT.rowEdges[0], x, gftBottom + BORDER));
	GFT.rowEdges.forEach((y) => stroke(doc, GFT.colEdges[0], y, GFT.colEdges[GFT.colEdges.length - 1] + BORDER, y));
	drawTrimesters(doc);
	COL_EDGES.forEach((x) => stroke(doc, x, ROW_EDGES[0], x, tableBottom + BORDER));
	ROW_EDGES.forEach((y) => stroke(doc, COL_EDGES[0] + BORDER, y, COL_EDGES[COL_EDGES.length - 1], y));
	useFont(doc, "sans", "bold");
	doc.setFontSize(GFT.size);
	GFT.labels.forEach((l, i) => drawCentered(doc, l, GFT.colEdges[i], GFT.colEdges[i + 1], GFT.labelBaseline));
	gftValues(data).forEach((v, i) => drawCentered(doc, v, GFT.colEdges[i], GFT.colEdges[i + 1], GFT.valueBaseline));
	HEAD_COLUMNS.forEach((col, i) => drawHeadCell(doc, col, COL_EDGES[i], COL_EDGES[i + 1]));
	useFont(doc, "sans");
	doc.setFontSize(12);
	const count = Math.min(ROWS_PER_PAGE, data.rows.length - offset);
	for (let i = 0; i < count; i += 1) {
		const row = data.rows[offset + i];
		const baseline = ROW_BASELINES[i];
		drawCentered(doc, row.number, COL_EDGES[0], COL_EDGES[1], baseline);
		doc.text(row.fullName, COL_EDGES[1] + PAD_X, baseline);
		drawCentered(doc, row.gender, COL_EDGES[2], COL_EDGES[3], baseline);
		if (row.periodGrades) for (let p = 1; p <= 3; p++) {
			const pGrades = row.periodGrades[p];
			if (pGrades) {
				const colOffset = 3 + (p - 1) * 4;
				if (pGrades.i) drawCentered(doc, pGrades.i, COL_EDGES[colOffset], COL_EDGES[colOffset + 1], baseline);
				if (pGrades.d) drawCentered(doc, pGrades.d, COL_EDGES[colOffset + 1], COL_EDGES[colOffset + 2], baseline);
				if (pGrades.c) drawCentered(doc, pGrades.c, COL_EDGES[colOffset + 2], COL_EDGES[colOffset + 3], baseline);
				if (pGrades.mg) {
					useFont(doc, "sans", "bold");
					doc.setTextColor(220, 38, 38);
					drawCentered(doc, pGrades.mg, COL_EDGES[colOffset + 3], COL_EDGES[colOffset + 4], baseline);
					doc.setTextColor(0, 0, 0);
					useFont(doc, "sans");
				}
			}
		}
	}
	addImageSafe(doc, assets.watermark, IMAGES.watermark.x, IMAGES.watermark.y, IMAGES.watermark.w, IMAGES.watermark.h);
}
/** Construit le document : une page par tranche d'élèves, une tranche par classe. */
function buildNominalListPdf(opts) {
	const { pages, assets } = opts;
	const doc = new jsPDF({
		unit: "pt",
		format: FORMAT,
		orientation: "landscape"
	});
	doc.setProperties({
		title: pages.length === 1 ? `Liste nominative — ${pages[0].name}` : `Listes nominatives — ${opts.groupLabel}`,
		subject: opts.documentType === "notes" ? "Liste de notes" : "Liste nominative de la classe"
	});
	layoutNominalList(pages).forEach((page, i) => {
		if (i > 0) doc.addPage(FORMAT, "landscape");
		drawPage(doc, page, assets, opts);
	});
	return doc;
}
//#endregion
//#region smoke/run_nominal.ts
var dataUri = (p) => `data:image/png;base64,${readFileSync(resolve(process.cwd(), p)).toString("base64")}`;
var assets = {
	logo: dataUri("src/assets/orion_logo.png"),
	qr: dataUri("src/assets/orion_qr.png"),
	watermark: dataUri("src/assets/orion_watermark.png")
};
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
var bigClass = {
	id: "c1",
	name: "6ème A",
	students: Array.from({ length: 35 }, (_, i) => ({
		id: `s${i}`,
		lastName: `${LAST_NAMES[i % LAST_NAMES.length]}${i > 6 ? ` ${i}` : ""}`,
		firstName: FIRST_NAMES[i % FIRST_NAMES.length],
		gender: i % 3 === 0 ? null : i % 2 ? "M" : "F"
	}))
};
var pages = buildNominalListData([bigClass, {
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
}]);
var doc = buildNominalListPdf({
	pages,
	assets,
	groupLabel: "Collège",
	documentType: "nominative"
});
var outPath = resolve(process.cwd(), "smoke/nominal_out.pdf");
writeFileSync(outPath, Buffer.from(doc.output("arraybuffer")));
var name = nominalListFileName(pages, "Collège", "2025-2026", "nominative");
console.log(`OK ${outPath} — nom : ${name}`);
var only = buildNominalListData([bigClass]);
var doc2 = buildNominalListPdf({
	pages: only,
	assets,
	groupLabel: "Collège",
	documentType: "nominative"
});
var outPath2 = resolve(process.cwd(), "smoke/nominal_out_single.pdf");
writeFileSync(outPath2, Buffer.from(doc2.output("arraybuffer")));
console.log(`OK ${outPath2} — nom : ${nominalListFileName(only, "Collège", "2025-2026", "nominative")}`);
var doc3 = buildNominalListPdf({
	pages: only,
	assets,
	groupLabel: "Collège",
	documentType: "notes",
	subjectName: "Mathématiques"
});
var outPath3 = resolve(process.cwd(), "smoke/nominal_out_notes.pdf");
writeFileSync(outPath3, Buffer.from(doc3.output("arraybuffer")));
console.log(`OK ${outPath3} — nom : ${nominalListFileName(only, "Collège", "2025-2026", "notes")}`);
var doc4 = buildNominalListPdf({
	pages: buildNominalListData([{
		id: "c0",
		name: "",
		students: []
	}]),
	assets,
	groupLabel: "Collège",
	documentType: "nominative"
});
var outPath4 = resolve(process.cwd(), "smoke/nominal_out_ref.pdf");
writeFileSync(outPath4, Buffer.from(doc4.output("arraybuffer")));
console.log(`OK ${outPath4} (gabarit nu)`);
//#endregion
export {};
