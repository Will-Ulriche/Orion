# Analyse structurelle du PDF "emploi du temps" (hors projet, outil temporaire)
import fitz

path = r'c:/Users/Resp_ Tech/Desktop/Orion DOC/emploi du temps.pdf'
out = r'c:/Users/Resp_ Tech/Desktop/Orion/.tmp_edt_analysis.txt'
doc = fitz.open(path)
page = doc[0]
lines = []
lines.append('PAGE SIZE: %s' % (page.rect,))

# 1) Positions exactes : origine (ligne de base) de chaque span
lines.append('--- SPANS WITH ORIGIN ---')
data = page.get_text('dict')
for b in data['blocks']:
    if b['type'] != 0:
        continue
    for line in b['lines']:
        for span in line['spans']:
            ox, oy = span['origin']
            x0, y0, x1, y1 = span['bbox']
            lines.append("x=%.1f base_y=%.1f size=%.1f font=%s color=%s bbox=(%.1f,%.1f,%.1f,%.1f) | %r" % (
                ox, oy, span['size'], span['font'], hex(span['color']), x0, y0, x1, y1, span['text']))

# 2) Images
lines.append('--- IMAGES ---')
for img in page.get_image_info(xrefs=True):
    lines.append('bbox= %s xref= %s w= %s h= %s' % ([round(v, 2) for v in img['bbox']], img.get('xref'), img['width'], img['height']))

# 3) Dessins (rectangles / lignes / fills)
lines.append('--- DRAWINGS ---')
for d in page.get_drawings():
    r = d['rect']
    lines.append('type=%s rect=(%.1f,%.1f,%.1f,%.1f) fill=%s stroke=%s width=%s items=%s' % (
        d['type'], r.x0, r.y0, r.x1, r.y1,
        d.get('fill'), d.get('color'), d.get('width'),
        [it[0] for it in d['items']]))

with open(out, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
print('written', len(lines), 'lines')
