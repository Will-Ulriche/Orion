# Analyse structurelle d'un PDF (hors projet, outil temporaire)
import fitz

path = r'c:/Users/Resp_ Tech/Desktop/liste nominative de la classe.pdf'
doc = fitz.open(path)
page = doc[0]

# 1) Positions exactes : origine (ligne de base) de chaque span
print('--- SPANS WITH ORIGIN ---')
data = page.get_text('dict')
for b in data['blocks']:
    if b['type'] != 0:
        continue
    for line in b['lines']:
        for span in line['spans']:
            ox, oy = span['origin']
            print("x=%.1f base_y=%.1f size=%.1f font=%s | %r" % (ox, oy, span['size'], span['font'], span['text']))

# 2) Crop zoomé de la cellule « I1 » (en-tête T2) pour confirmer le texte
pix = page.get_pixmap(matrix=fitz.Matrix(8, 8), clip=fitz.Rect(505, 112, 545, 134))
pix.save(r'c:/Users/Resp_ Tech/Desktop/Orion/crop_i1.png')
print('crop saved')




