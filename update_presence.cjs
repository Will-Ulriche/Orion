const fs = require('fs');

let pdfTs = fs.readFileSync('src/lib/presenceListPdf.ts', 'utf8');

// 1. signature of buildPresenceListPdf
pdfTs = pdfTs.replace(
  'logoDataUrl?: string\n): Promise<Uint8Array>',
  'logoDataUrl?: string,\n  schoolName: string = "ORION COLLEGE EXPERIENCE"\n): Promise<Uint8Array>'
);

// 2. add cache and new title drawing in buildPresenceListPdf
pdfTs = pdfTs.replace(
  '        pdfPage.drawImage(embeddedLogo, {\r\n          x: offsetX,\r\n          y: offsetY,\r\n          width: w,\r\n          height: h,\r\n        });\r\n      }',
  `        pdfPage.drawImage(embeddedLogo, {
          x: offsetX,
          y: offsetY,
          width: w,
          height: h,
        });
      }

      pdfPage.drawRectangle({ x: 200, y: 535, width: 460, height: 45, color: rgb(1, 1, 1) });
      
      const rawTitle = (schoolName || 'ORION COLLEGE EXPERIENCE').toUpperCase();
      const titleLabel = winAnsi(rawTitle);
      const titleFont = bold;
      const titleSize = fitSize(titleLabel, titleFont, 460, 24, 10);
      const titleWidth = titleFont.widthOfTextAtSize(titleLabel, titleSize);
      pdfPage.drawText(titleLabel, {
        x: GEOM.yearField.centerX - titleWidth / 2,
        y: 550,
        size: titleSize,
        font: titleFont,
        color: rgb(0.08, 0.34, 0.75),
      });`
);
// Fallback for LF
pdfTs = pdfTs.replace(
  '        pdfPage.drawImage(embeddedLogo, {\n          x: offsetX,\n          y: offsetY,\n          width: w,\n          height: h,\n        });\n      }',
  `        pdfPage.drawImage(embeddedLogo, {
          x: offsetX,
          y: offsetY,
          width: w,
          height: h,
        });
      }

      pdfPage.drawRectangle({ x: 200, y: 535, width: 460, height: 45, color: rgb(1, 1, 1) });
      
      const rawTitle = (schoolName || 'ORION COLLEGE EXPERIENCE').toUpperCase();
      const titleLabel = winAnsi(rawTitle);
      const titleFont = bold;
      const titleSize = fitSize(titleLabel, titleFont, 460, 24, 10);
      const titleWidth = titleFont.widthOfTextAtSize(titleLabel, titleSize);
      pdfPage.drawText(titleLabel, {
        x: GEOM.yearField.centerX - titleWidth / 2,
        y: 550,
        size: titleSize,
        font: titleFont,
        color: rgb(0.08, 0.34, 0.75),
      });`
);

// 3. signature of buildPresenceListHtml
pdfTs = pdfTs.replace(
  'logoDataUrl?: string\n): string',
  'logoDataUrl?: string,\n  schoolName: string = "ORION COLLEGE EXPERIENCE"\n): string'
);

// 4. replace hardcoded html title
pdfTs = pdfTs.replace(
  '<h1>ORION COLLEGE EXPERIENCE</h1>',
  '<h1>${schoolName || "ORION COLLEGE EXPERIENCE"}</h1>'
);

fs.writeFileSync('src/lib/presenceListPdf.ts', pdfTs);

// ---- Update PresenceListModal.tsx ----
let modalTsx = fs.readFileSync('src/components/PresenceListModal.tsx', 'utf8');

modalTsx = modalTsx.replace(
  '  const [logoUrl, setLogoUrl] = useState<string | undefined>();\n\n  useEffect(() => {\n    invoke<any>(\'get_school_settings\').then(s => {\n      if (s && s.logo_url) setLogoUrl(s.logo_url);\n    }).catch(() => {});\n  }, []);',
  '  const [logoUrl, setLogoUrl] = useState<string | undefined>();\n  const [schoolName, setSchoolName] = useState<string>("ORION COLLEGE EXPERIENCE");\n\n  useEffect(() => {\n    invoke<any>(\'get_school_settings\').then(s => {\n      if (s && s.logo_url) setLogoUrl(s.logo_url);\n      if (s && s.name) setSchoolName(s.name);\n    }).catch(() => {});\n  }, []);'
);
modalTsx = modalTsx.replace(
  '  const [logoUrl, setLogoUrl] = useState<string | undefined>();\r\n\r\n  useEffect(() => {\r\n    invoke<any>(\'get_school_settings\').then(s => {\r\n      if (s && s.logo_url) setLogoUrl(s.logo_url);\r\n    }).catch(() => {});\r\n  }, []);',
  '  const [logoUrl, setLogoUrl] = useState<string | undefined>();\r\n  const [schoolName, setSchoolName] = useState<string>("ORION COLLEGE EXPERIENCE");\r\n\r\n  useEffect(() => {\r\n    invoke<any>(\'get_school_settings\').then(s => {\r\n      if (s && s.logo_url) setLogoUrl(s.logo_url);\r\n      if (s && s.name) setSchoolName(s.name);\r\n    }).catch(() => {});\r\n  }, []);'
);

modalTsx = modalTsx.replace(
  'const html = buildPresenceListHtml(selectedClasses, groupLabel, yearName, logoUrl);',
  'const html = buildPresenceListHtml(selectedClasses, groupLabel, yearName, logoUrl, schoolName);'
);

modalTsx = modalTsx.replace(
  'buildPresenceListPdf(selectedClasses, groupLabel, yearName, logoUrl)',
  'buildPresenceListPdf(selectedClasses, groupLabel, yearName, logoUrl, schoolName)'
);

fs.writeFileSync('src/components/PresenceListModal.tsx', modalTsx);
