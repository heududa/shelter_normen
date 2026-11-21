#!/usr/bin/env python3
"""Texterkennung für die gescannten Normen.

Liest jede gescannte Seite neu ein (Tesseract 5, Modell «deu» aus tessdata_best), trennt Skizzen und
Tabellen vom Lauftext und schreibt je PDF eine Datei daten/ocr/<dokId>.json. Die Original-PDF werden
nur gelesen. Die Ersterfassung (werkzeuge/ersterfassung.js) übernimmt diese Dateien.

Aufruf im Ordner des Repos:
  python3 werkzeuge/ocr.py --tessdata <Ordner mit deu.traineddata> [--nur dokId] [--seiten 3,7-9] [--neu]

Braucht: tesseract, pdftoppm, pdffonts (poppler), Python mit opencv, numpy, pytesseract.
"""
import argparse, json, os, re, subprocess, sys, tempfile
from concurrent.futures import ProcessPoolExecutor
import numpy as np, cv2, pytesseract

DPI = 300
ERZWUNGEN = {'d-tmb001-1', 'd-tmb002-1', 'd-tmb004-1'}  # Schrift ohne lesbare Zeichenzuordnung: Überschriften fehlen im PDF-Text
DESC = set('gjpqyQ,;()/§[]{}|_')


def seiten_art(pfad, n):
    """Je Seite: True, wenn sie nur aus einem Scan mit unsichtbarem OCR-Text besteht."""
    out = []
    for i in range(1, n + 1):
        f = subprocess.run(['pdffonts', '-f', str(i), '-l', str(i), pfad], capture_output=True, text=True).stdout.splitlines()[2:]
        namen = {z.split()[0] for z in f if z.strip()}
        out.append(not namen or namen <= {'GlyphLessFont'})
    return out


def lade_seite(pfad, i):
    with tempfile.TemporaryDirectory() as t:
        subprocess.run(['pdftoppm', '-r', str(DPI), '-gray', '-png', '-f', str(i), '-l', str(i), '-singlefile', pfad, os.path.join(t, 's')], check=True, capture_output=True)
        return cv2.imread(os.path.join(t, 's.png'), cv2.IMREAD_GRAYSCALE)


def tess(img, tessdata, psm):
    cfg = f'--tessdata-dir "{tessdata}" --psm {psm} -c preserve_interword_spaces=1'
    d = pytesseract.image_to_data(img, lang='deu', config=cfg, output_type=pytesseract.Output.DICT)
    worte = []
    for k in range(len(d['text'])):
        t = d['text'][k].strip()
        if not t or float(d['conf'][k]) < 0: continue
        worte.append(dict(t=t, x=d['left'][k], y=d['top'][k], w=d['width'][k], h=d['height'][k], c=float(d['conf'][k]),
                          l=(d['block_num'][k], d['par_num'][k], d['line_num'][k])))
    return worte


HOCH = re.compile(r'^(.*?(?:^|[/(\[\d])(?:m|cm|mm|dm|km))([?*’‘\'"”“°]|2|3)((?:/[a-zA-Z]+)?[.,;:)\]]*)$')


def hochzahl(img, bw, w, tessdata):
    """m² und m³: die hochgestellte Ziffer einzeln nachlesen, wenn sie unklar ist."""
    w['t'] = w['t'].replace('{', '(').replace('}', ')')
    m = HOCH.match(w['t'])
    if not m: return
    x0, y0, x1, y1 = w['x'], w['y'], w['x'] + w['w'], w['y'] + w['h']
    teil = bw[max(0, y0 - 6):y1, x0:x1 + 4]
    n, lab, st, _ = cv2.connectedComponentsWithStats(teil, connectivity=8)
    best = None
    for k in range(1, n):
        x, y, ww, hh, a = st[k]
        if a < 15 or y + hh > 6 + 0.72 * (y1 - y0) or hh < 0.3 * (y1 - y0): continue
        if best is None or x > st[best][0]: best = k
    z = ''
    if best is not None:
        x, y, ww, hh, a = st[best]
        g = 255 - (lab[y:y + hh, x:x + ww] == best).astype(np.uint8) * 255
        g = cv2.copyMakeBorder(cv2.resize(g, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC), 40, 40, 40, 40, cv2.BORDER_CONSTANT, value=255)
        try: z = pytesseract.image_to_string(g, lang='deu', config=f'--tessdata-dir "{tessdata}" --psm 10 -c tessedit_char_whitelist=23').strip()
        except Exception: z = ''
    if z not in ('2', '3') and best is None and n > 1:
        # kursive Schrift: die Hochzahl hängt am m. Oben rechts im grössten Zeichen nachlesen.
        k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])); x, y, ww, hh, a = st[k]
        if ww > 0.9 * hh:
            g = 255 - teil[y:y + int(0.62 * hh), x + int(0.66 * ww):x + ww + 2] * 255
            if g.size:
                g = cv2.copyMakeBorder(cv2.resize(g.astype(np.uint8), None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC), 40, 40, 40, 40, cv2.BORDER_CONSTANT, value=255)
                try: z = pytesseract.image_to_string(g, lang='deu', config=f'--tessdata-dir "{tessdata}" --psm 10 -c tessedit_char_whitelist=23').strip()
                except Exception: z = ''
    if z in ('2', '3'): w['t'] = m.group(1) + ('²' if z == '2' else '³') + m.group(3); w['c'] = max(w['c'], 60)
    elif m.group(2) in '23': return
    else: w['c'] = min(w['c'], 20); w['frag'] = True


def schnitt(a, b):
    return max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))


def grafik(bw):
    """Linien und Zeichnungen finden. Liefert Texthöhe, Linien-Maske, Gruppen grosser Formen."""
    H, W = bw.shape
    n, lab, st, _ = cv2.connectedComponentsWithStats(bw, connectivity=8)
    hs = st[1:, cv2.CC_STAT_HEIGHT]
    txt = hs[(hs > 14) & (hs < 90)]
    th = float(np.median(txt)) if len(txt) > 20 else 34.0
    th = min(max(th, 22.0), 48.0)
    gross = []
    for k in range(1, n):
        x, y, w, h, a = st[k]
        if w > 6 * th or h > 2.6 * th:
            art = 'h' if h <= max(8, 0.35 * th) else 'v' if w <= max(8, 0.35 * th) else 'x'
            gross.append(dict(k=k, b=[x, y, x + w, y + h], art=art, a=int(a)))
    return th, lab, st, gross


def gruppen(gross, th, W, H):
    """Grosse Formen, die nahe beieinander liegen, zu Bereichen fassen."""
    m = 0.9 * th
    g = [dict(b=list(q['b']), teile=[q]) for q in gross]
    neu = True
    while neu:
        neu = False
        for i in range(len(g)):
            if g[i] is None: continue
            for j in range(i + 1, len(g)):
                if g[j] is None: continue
                a, b = g[i]['b'], g[j]['b']
                if schnitt([a[0] - m, a[1] - m, a[2] + m, a[3] + m], b) > 0:
                    g[i]['b'] = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]
                    g[i]['teile'] += g[j]['teile']; g[j] = None; neu = True
    return [x for x in g if x]


BULLET = re.compile(r'^(e|se|ee|eo|oe|o|®|©|°|\*|»|«|\+|@|0|O|9|-|–|—|\.|·|•)$')


def zeilen_bauen(worte, th):
    """Wörter zu Zeilen (nach Tesseract-Zeile), Zeilen von oben nach unten."""
    z = {}
    for w in worte: z.setdefault(w['l'], []).append(w)
    out = []
    for ws in z.values():
        ws.sort(key=lambda w: w['x'])
        ws = [w for k, w in enumerate(ws) if k == 0 or not (w.get('bul') and w['c'] < 50)]  # Störzeichen mitten in der Zeile
        if len(ws) == 1 and ws[0].get('bul') and ws[0]['c'] < 60: continue
        # sehr weit auseinanderliegende Teile einer Tesseract-Zeile bleiben eine Zeile (Spaltenabstand wird als Lücke geschrieben)
        seg, t = [[ws[0]]], ''
        for i, w in enumerate(ws):
            if i:
                luecke = w['x'] - (ws[i - 1]['x'] + ws[i - 1]['w'])
                t += '   ' if luecke > 2.2 * th else ' '
                if i == 1 and luecke > 0.8 * th and ws[0].get('bul'): t = ('– ' if re.match(r'^[-–—]$', t.strip()) else '• '); seg[-1].append(w)
                elif luecke > 2.2 * th and re.match(r'^(\d{1,2}(\.\d{1,2}){0,3}\.?|[a-z]\)|[-–•])$', t.strip()) and len(seg) == 1: t = t.strip() + ' '; seg[-1].append(w)
                elif luecke > 2.2 * th: seg.append([w])
                else: seg[-1].append(w)
            t += w['t']
        x0 = ws[0]['x']; x1 = max(w['x'] + w['w'] for w in ws); y0 = min(w['y'] for w in ws); y1 = max(w['y'] + w['h'] for w in ws)
        kap = [w['h'] for w in ws if (w['t'][0].isupper() or w['t'][0].isdigit()) and not (set(w['t']) & DESC) and len(w['t']) > 1]
        out.append(dict(t=t, x0=x0, x1=x1, y0=y0, y1=y1, kap=float(np.median(kap)) if kap else 0, worte=ws, seg=seg))
    out.sort(key=lambda l: (l['y0'] + l['y1']) / 2)
    # Zeilen auf gleicher Höhe (zwei Tesseract-Blöcke nebeneinander) zusammenführen
    zus = []
    for l in out:
        p = zus[-1] if zus else None
        if p and min(p['y1'], l['y1']) - max(p['y0'], l['y0']) > 0.6 * min(p['y1'] - p['y0'], l['y1'] - l['y0']) and (l['x0'] > p['x1'] or p['x0'] > l['x1']):
            a, b = (p, l) if p['x0'] < l['x0'] else (l, p)
            zus[-1] = dict(t=a['t'] + '   ' + b['t'], x0=a['x0'], x1=b['x1'], y0=min(a['y0'], b['y0']), y1=max(a['y1'], b['y1']), kap=max(a['kap'], b['kap']), worte=a['worte'] + b['worte'], seg=a['seg'] + b['seg'])
        else: zus.append(l)
    return zus


def spaltenbloecke(zeilen, th):
    """Listen aus Bezeichnung und Angabe (zwei Spalten ohne Linien) als Tabelle fassen."""
    out, i, bloecke = [], 0, []
    sx = lambda ws: ws[0]['x']
    txt = lambda ws: ' '.join(w['t'] for w in ws)
    while i < len(zeilen):
        l = zeilen[i]
        if len(l.get('seg', [])) != 2: out.append(l); i += 1; continue
        L, X, reihen, j, n2 = l['x0'], sx(l['seg'][1]), [], i, 0
        while j < len(zeilen):
            q = zeilen[j]; sg = q.get('seg', [])
            if reihen and q['y0'] - zeilen[j - 1]['y1'] > 2.2 * th: break
            if len(sg) == 2 and abs(sx(sg[1]) - X) < 0.8 * th and abs(q['x0'] - L) < 1.5 * th: reihen.append([txt(sg[0]), txt(sg[1])]); n2 += 1
            elif len(sg) == 1 and reihen and -0.8 * th < q['x0'] - X and (q['x0'] - X < 4 * th or reihen[-1][1].endswith('-')):
                v = reihen[-1][1]; t = txt(sg[0])
                reihen[-1][1] = v[:-1] + t if re.search(r'[a-zäöüß]-$', v) and re.match(r'[a-zäöüß]', t) else v + '\n' + t
            else: break
            j += 1
        if n2 >= 1 and sum(1 for r in reihen if r[0].rstrip().endswith(':')) >= 0.6 * len(reihen):
            zl = zeilen[i:j]
            b = [min(q['x0'] for q in zl), min(q['y0'] for q in zl), max(q['x1'] for q in zl), max(q['y1'] for q in zl)]
            bloecke.append(dict(typ='tabelle', b=b, zeilen=reihen, ohneKopf=True, worte=[w for q in zl for w in q['worte']])); i = j
        else: out.append(l); i += 1
    return out, bloecke


def formelbloecke(zeilen, th):
    """Gesetzte Formeln liest die Texterkennung nicht zuverlässig: als Bild aus dem Original übernehmen."""
    def f(l): return len(l['worte']) <= 12 and re.match(r'^\S{1,10}(\s+\S{1,6})?\s*=', l['t']) is not None and not l['t'].endswith('-')
    def g(l, k): return f(l) or (len(l['t']) <= 16 and not KOPF.match(l['t']) and re.search(r'[\d+·/—-]', l['t']) is not None and not (k == 0 and re.match(r'^\d+$', l['t'])))
    out, bloecke, i = [], [], 0
    while i < len(zeilen):
        if not g(zeilen[i], i): out.append(zeilen[i]); i += 1; continue
        j = i
        while j < len(zeilen) and g(zeilen[j], j) and (j == i or zeilen[j]['y0'] - zeilen[j - 1]['y1'] < 3.5 * th): j += 1
        zl = zeilen[i:j]
        if sum(1 for l in zl if f(l)) >= 2 or any(re.match(r'^\S{1,8}\s{2,}=', l['t']) or l['t'].count('=') >= 2 for l in zl):
            m = int(0.4 * th)
            b = [min(q['x0'] for q in zl) - m, min(q['y0'] for q in zl) - m, max(q['x1'] for q in zl) + m, max(q['y1'] for q in zl) + m]
            bloecke.append(dict(typ='skizze', b=b, formel=True, text=' '.join(q['t'] for q in zl)[:600])); i = j
        else: out.append(zeilen[i]); i += 1
    return out, bloecke


def rasterbloecke(zeilen, th):
    """Tabellen ohne Linien: mehrere Zeilen hintereinander, deren Spalten an denselben Stellen beginnen."""
    out, bloecke, i = [], [], 0
    while i < len(zeilen):
        j = i
        def mehr(k): return k < len(zeilen) and len(zeilen[k].get('seg', [])) >= 2 and '=' not in zeilen[k]['t'] and not zeilen[k].get('kein')
        while j < len(zeilen) and (j == i or zeilen[j]['y0'] - zeilen[j - 1]['y1'] < 2.2 * th) and (mehr(j) or (j > i and mehr(j + 1) and len(zeilen[j]['t']) < 45 and len(zeilen[j].get('seg', [])) == 1 and not KOPF.match(zeilen[j]['t']))): j += 1
        zl = zeilen[i:j]
        letzte = [q['seg'][-1] for q in zl if len(q['seg']) >= 2]
        if sum(1 for sg in letzte if re.match(r'^\d{1,3}$', ' '.join(w['t'] for w in sg))) >= 0.6 * max(1, len(letzte)): out.append(zeilen[i]); i += 1; continue  # Inhaltsverzeichnis
        if sum(1 for q in zl if len(q['seg']) >= 2) < 3: out.append(zeilen[i]); i += 1; continue
        starts = sorted(sg[0]['x'] for q in zl for sg in q['seg'])
        anker = []
        for x in starts:
            if anker and x - anker[-1][-1] < 1.2 * th: anker[-1].append(x)
            else: anker.append([x])
        gut = [float(np.mean(a)) for a in anker if len(a) >= max(2, 0.4 * len(zl))]
        nah = sum(1 for x in starts if any(abs(x - a) < 1.5 * th for a in gut))
        if not (2 <= len(gut) <= 8 and nah >= 0.85 * len(starts)): out.append(zeilen[i]); i += 1; continue
        reihen = []
        for q in zl:
            z = [''] * len(gut)
            for sg in q['seg']:
                k = int(np.argmin([abs(sg[0]['x'] - a) for a in gut])); z[k] = (z[k] + ' ' if z[k] else '') + ' '.join(w['t'] for w in sg)
            reihen.append(z)
        b = [min(q['x0'] for q in zl), min(q['y0'] for q in zl), max(q['x1'] for q in zl), max(q['y1'] for q in zl)]
        e = dict(typ='tabelle', b=b, zeilen=reihen, worte=[w for q in zl for w in q['worte']])
        if not (all(reihen[0]) and not re.search(r'\d', ' '.join(reihen[0]))): e['ohneKopf'] = True
        bloecke.append(e); i = j
    return out, bloecke


KOPF = re.compile(r'^(\d{1,2}(\.\d{1,2}){0,3}\.?\s+\S|[-–•*]\s|[a-z]\)\s|\d{1,2}\)\s|Tabelle\s|Tab\.\s|Fig(ur|\.)\s|Bild\s|Abb(ildung|\.)\s|\[\[)')


def absaetze(zeilen, th):
    """Zeilen zu Absätzen fügen: volle Zeilen laufen weiter, Trennstriche am Zeilenende fallen weg."""
    if not zeilen: return ''
    lang = [l['x1'] for l in zeilen if l['x1'] - l['x0'] > 12 * th]
    R = float(np.percentile(lang, 85)) if lang else max(l['x1'] for l in zeilen)
    pitch = [zeilen[i + 1]['y0'] - zeilen[i]['y0'] for i in range(len(zeilen) - 1)]
    pitch = [p for p in pitch if 0.8 * th < p < 3 * th]
    P = float(np.median(pitch)) if pitch else 1.5 * th
    out = ''
    for i, a in enumerate(zeilen):
        b = zeilen[i + 1] if i + 1 < len(zeilen) else None
        if b is None: out += a['t']; break
        neu = ('kein' in a or 'kein' in b or '   ' in a['t'] or '   ' in b['t'] or KOPF.match(b['t']) or b['y0'] - a['y0'] > 1.35 * P or a['x1'] < R - 2.5 * th
               or abs(b['x0'] - a['x0']) > 1.6 * th and not KOPF.match(a['t']) or b['y0'] < a['y0'])
        if neu: out += a['t'] + '\n'
        elif re.search(r'[a-zäöüß]-$', a['t']) and re.match(r'[a-zäöüß]', b['t']) and not re.match(r'(und|oder|bzw|sowie)\b', b['t']): out += a['t'][:-1]
        else: out += a['t'] + ' '
    return re.sub(r'[ \t]{4,}', '   ', out).strip()


def tabelle_aus(worte, box, hlinien, vlinien, th):
    """Wörter in einem Tabellenbereich zu Zeilen und Spalten ordnen."""
    ws = [w for w in worte if box[0] - 6 <= w['x'] + w['w'] / 2 <= box[2] + 6 and box[1] - 6 <= w['y'] + w['h'] / 2 <= box[3] + 6]
    if len(ws) < 4: return None, ws
    ws.sort(key=lambda w: w['y'] + w['h'] / 2)
    reihen = []
    for w in ws:
        m = w['y'] + w['h'] / 2
        if reihen and abs(m - reihen[-1]['m']) < 0.85 * th: reihen[-1]['w'].append(w); reihen[-1]['m'] = float(np.mean([q['y'] + q['h'] / 2 for q in reihen[-1]['w']]))
        else: reihen.append(dict(m=m, w=[w]))
    # Bänder zwischen waagrechten Linien
    ys = sorted(set([box[1]] + [int(h) for h in hlinien if box[1] + th * 0.5 < h < box[3] - th * 0.5] + [box[3]]))
    baender = [[r for r in reihen if ys[i] <= r['m'] < ys[i + 1]] for i in range(len(ys) - 1)]
    baender = [b for b in baender if b]
    if not baender: return None, ws
    basis = [r for b in baender[1:] for r in b] if len(baender) > 1 else baender[0]
    if len(basis) < 2: basis = reihen
    grenzen = [float(x) for x in vlinien if box[0] + th < x < box[2] - th]
    if not grenzen:
        # Spaltengrenzen: Lücken, die in allen Datenzeilen frei sind
        belegt = np.zeros(int(box[2] - box[0]) + 40, bool)
        for r in basis:
            for w in r['w']: belegt[max(0, int(w['x'] - box[0])):int(w['x'] + w['w'] - box[0])] = True
        s = None
        for x in range(len(belegt)):
            if not belegt[x] and s is None: s = x
            if belegt[x] and s is not None:
                if x - s >= 0.9 * th and s > 0: grenzen.append((s + x) / 2 + box[0])
                s = None
    if not grenzen: return None, ws
    def spalte(w):
        m = w['x'] + min(w['w'], 3 * th) / 2
        return sum(1 for g in grenzen if m > g)
    def zeile(rs):
        z = [''] * (len(grenzen) + 1)
        for r in rs:
            teil = {}
            for w in sorted(r['w'], key=lambda w: w['x']): teil.setdefault(spalte(w), []).append(w['t'])
            for k, v in teil.items(): z[k] = (z[k] + ' ' if z[k] else '') + ' '.join(v)
        return [re.sub(r'([a-zäöüß])- (?!und |oder |bzw)([a-zäöüß])', r'\1\2', c) for c in z]
    zeilen = []
    for k, b in enumerate(baender):
        if len(baender) > 1 and k == 0: zeilen.append(zeile(b)); continue
        # innerhalb eines Bandes: Zeilen mit Abstand dazwischen sind eigene Tabellenzeilen, eng gesetzte gehören zu einer Zelle
        ab = [b[i + 1]['m'] - b[i]['m'] for i in range(len(b) - 1)]
        eng = min(ab) if ab else 0
        if ab and max(ab) > 1.3 * eng and eng < 3.2 * th:
            gr = [[b[0]]]
            for i, d in enumerate(ab):
                if d > 1.3 * eng: gr.append([b[i + 1]])
                else: gr[-1].append(b[i + 1])
            zeilen += [zeile(g) for g in gr]
        else: zeilen += [zeile([r]) for r in b]
    if len(zeilen) < 2 or len(zeilen[0]) < 2: return None, ws
    return zeilen, ws


def seite(arg):
    """Eine Seite lesen. Schlägt die Zerlegung fehl, wird die Seite ohne Tabellen und Skizzen gelesen und so vermerkt."""
    try: return seite_(arg)
    except Exception as ex:
        pfad, i, tessdata = arg
        img = lade_seite(pfad, i); H, W = img.shape
        zl = zeilen_bauen(tess(img, tessdata, 4), 30.0)
        alle = [w for l in zl for w in l['worte']]
        return dict(s=i, luecke=0, fehler=str(ex)[:120], lagen=[[w['t'], round(w['x'] / W, 4), round(w['y'] / H, 4), round(w['w'] / W, 4), round(w['h'] / H, 4)] for w in alle], text=absaetze(zl, 30.0), roh='\n'.join(l['t'] for l in zl), zeilen=[dict(t=re.sub(r'\s+', ' ', l['t']), g=10, x=round(l['x0'] * 72 / DPI), yy=round(l['y0'] / H, 3)) for l in zl],
                    elemente=[], unsicher=sorted({w['t'] for w in alle if w['c'] < 55 and re.search(r'\d', w['t'])}), conf=round(float(np.mean([w['c'] for w in alle])) if alle else 0, 1), worte=len(alle))


def seite_(arg):
    pfad, i, tessdata = arg
    img = lade_seite(pfad, i)
    H, W = img.shape
    bw = (img < 150).astype(np.uint8)
    # Rasterpunkte grauer Flächen entfernen (1 bis 7 Pixel), sie stören die Erkennung
    n0, lab0, st0, _ = cv2.connectedComponentsWithStats(bw, connectivity=8)
    klein = np.where(st0[:, cv2.CC_STAT_AREA] <= 7)[0]
    if len(klein) > 400:
        weg = np.isin(lab0, klein[klein > 0]); img = img.copy(); img[weg] = 255; bw[weg] = 0
    # Punktlinien von Formularen und Verzeichnissen entfernen (werden sonst als Buchstabensalat gelesen)
    kl = np.isin(lab0, np.where((st0[:, cv2.CC_STAT_AREA] <= 60) & (st0[:, cv2.CC_STAT_WIDTH] <= 12) & (st0[:, cv2.CC_STAT_HEIGHT] <= 12))[0]).astype(np.uint8)
    kl[bw == 0] = 0
    reihe = cv2.morphologyEx(kl, cv2.MORPH_CLOSE, np.ones((1, 45), np.uint8))
    n1, lab1, st1, _ = cv2.connectedComponentsWithStats(reihe, connectivity=8)
    lang = np.where((st1[:, cv2.CC_STAT_WIDTH] > 250) & (st1[:, cv2.CC_STAT_HEIGHT] <= 34) & (st1[:, cv2.CC_STAT_WIDTH] > 12 * st1[:, cv2.CC_STAT_HEIGHT]))[0]
    lang = lang[lang > 0]
    if len(lang):
        weg = np.isin(lab1, lang) & (kl > 0); img = img.copy(); img[weg] = 255; bw[weg] = 0
    th, lab, st, gross = grafik(bw)
    rein = img.copy()
    elemente, hl_alle = [], []
    for g in gruppen(gross, th, W, H):
        b = g['b']; bw_, bh_ = b[2] - b[0], b[3] - b[1]
        arten = [q['art'] for q in g['teile']]
        nur_linien = all(a in 'hv' for a in arten)
        def linien_weg():
            for q in g['teile']:
                if q['art'] in 'hv': rein[lab == q['k']] = 255
        if bh_ < 1.3 * th or (nur_linien and arten.count('h') < 2):
            linien_weg(); continue  # einzelne Linie: Kopf- oder Fusslinie, Unterstreichung, Trennstrich
        if all(q['art'] == 'x' for q in g['teile']) and bh_ < 14 * th:
            elemente.append(dict(typ='skizze', b=b, offen=True)); continue  # vielleicht grosse Buchstaben eines Titels: nach dem Lesen entscheiden
        maske = np.zeros((bh_, bw_), np.uint8)
        for q in g['teile']: maske |= (lab[b[1]:b[3], b[0]:b[2]] == q['k']).astype(np.uint8)
        kh = cv2.morphologyEx(maske, cv2.MORPH_OPEN, np.ones((1, int(3 * th)), np.uint8))
        kv = cv2.morphologyEx(maske, cv2.MORPH_OPEN, np.ones((int(2 * th), 1), np.uint8))
        achs = float((kh | kv).sum()) / max(1, float(maske.sum()))
        hl, vl = [], []
        for y in np.where(cv2.dilate(kh, np.ones((11, 1), np.uint8)).sum(axis=1) > 0.7 * bw_)[0]:
            if not hl or y + b[1] - hl[-1] > 14: hl.append(int(y + b[1]))
        for x in np.where(cv2.dilate(kv, np.ones((1, 11), np.uint8)).sum(axis=0) > 0.5 * bh_)[0]:
            if not vl or x + b[0] - vl[-1] > 14: vl.append(int(x + b[0]))
        ist_tab = False
        if achs > 0.9 and (len(hl) >= 2 or (len(hl) >= 1 and len(vl) >= 2)) and bw_ > 8 * th and bh_ > 2 * th:
            # Inhalt ohne die Linien: besteht er aus Schrift?
            innen = bw[b[1]:b[3], b[0]:b[2]].copy(); innen[maske > 0] = 0
            n2, _, st2, _ = cv2.connectedComponentsWithStats(innen, connectivity=8)
            fl = st2[1:, cv2.CC_STAT_AREA].astype(float); hh = st2[1:, cv2.CC_STAT_HEIGHT]; ww = st2[1:, cv2.CC_STAT_WIDTH]
            schrift = (hh < 2.4 * th) & (ww < 5 * th)
            ist_tab = len(fl) >= 15 and fl[schrift].sum() > 0.92 * max(1.0, fl.sum())
        if os.environ.get('NB_DEBUG'): print('gruppe', i, b, arten[:6], round(achs, 2), len(hl), len(vl), ist_tab)
        if ist_tab:
            for q in g['teile']: rein[lab == q['k']] = 255
            elemente.append(dict(typ='tabelle?', b=b, hl=hl, vl=vl))
            continue
        if nur_linien: linien_weg(); continue
        if bw_ < 3 * th and bh_ < 3 * th: continue
        elemente.append(dict(typ='skizze', b=b))
    # Skizzen wachsen um kleine Teile, die sie berühren (Schraffur, Masslinien)
    for e in elemente:
        if e['typ'] == 'skizze':
            b = e['b']; m = int(0.5 * th)
            e['b'] = [max(0, b[0] - m), max(0, b[1] - m), min(W, b[2] + m), min(H, b[3] + m)]
    # überlappende Skizzen vereinen
    sk = [e for e in elemente if e['typ'] == 'skizze']; neu = True
    while neu:
        neu = False
        for a in sk:
            for c in sk:
                if a is not c and a.get('b') and c.get('b') and schnitt([a['b'][0] - 2 * th, a['b'][1] - 2 * th, a['b'][2] + 2 * th, a['b'][3] + 2 * th], c['b']) > 0:
                    a['b'] = [min(a['b'][0], c['b'][0]), min(a['b'][1], c['b'][1]), max(a['b'][2], c['b'][2]), max(a['b'][3], c['b'][3])]; c['b'] = None; neu = True
    elemente = [e for e in elemente if e.get('b')]
    for e in elemente:
        if e['typ'] == 'tabelle?' and any(s['typ'] == 'skizze' and schnitt(s['b'], e['b']) > 0.5 * (e['b'][2] - e['b'][0]) * (e['b'][3] - e['b'][1]) for s in elemente): e['b'] = None
    elemente = [e for e in elemente if e.get('b')]
    ocrbild = rein.copy()
    for e in elemente:
        if e['typ'] == 'skizze' and not e.get('offen'): b = e['b']; ocrbild[b[1]:b[3], b[0]:b[2]] = 255
    worte = tess(ocrbild, tessdata, 4)
    # Zweiter Durchgang: Schrift, die der erste Durchgang ausgelassen hat, bereichsweise nachlesen
    def ungelesen(ws):
        frei = ((ocrbild < 150) & (schrift > 0)).astype(np.uint8)
        for w in ws: frei[max(0, w['y'] - 4):w['y'] + w['h'] + 4, max(0, w['x'] - 4):w['x'] + w['w'] + 4] = 0
        return frei
    hs = st[:, cv2.CC_STAT_HEIGHT]; fl = st[:, cv2.CC_STAT_AREA]; brt = st[:, cv2.CC_STAT_WIDTH]
    gut = np.where((hs > 0.45 * th) & (hs < 2.4 * th) & (brt < 5 * th) & (fl > 25))[0]; gut = gut[gut > 0]
    schrift = np.isin(lab, gut).astype(np.uint8)
    gesamt = max(1, int(((ocrbild < 150) & (schrift > 0)).sum()))
    rest_ = ungelesen(worte)
    if rest_.sum() > 0.02 * gesamt:
        dil = cv2.dilate(rest_, np.ones((int(0.9 * th), int(2.5 * th)), np.uint8))
        nr_, lr_, sr_, _ = cv2.connectedComponentsWithStats(dil, connectivity=8)
        for k in range(1, nr_):
            x, y, ww, hh, a = sr_[k]
            if ww < 2.5 * th or int(rest_[y:y + hh, x:x + ww].sum()) < 120: continue
            x0, y0, x1, y1 = max(0, x - 12), max(0, y - 12), min(W, x + ww + 12), min(H, y + hh + 12)
            stueck = ocrbild[y0:y1, x0:x1].copy()
            for w in worte:  # schon Gelesenes im Ausschnitt abdecken
                if w['x'] < x1 and w['x'] + w['w'] > x0 and w['y'] < y1 and w['y'] + w['h'] > y0: stueck[max(0, w['y'] - y0):max(0, w['y'] + w['h'] - y0), max(0, w['x'] - x0):max(0, w['x'] + w['w'] - x0)] = 255
            try: neu_ = tess(stueck, tessdata, 7 if hh < 2.6 * th else 6)
            except Exception: neu_ = []
            for w in neu_:
                if w['c'] < 40: continue
                w['x'] += x0; w['y'] += y0; w['l'] = ('n', k) + tuple(w['l']); worte.append(w)
    luecke_ = round(float(ungelesen(worte).sum()) / gesamt, 3)
    for w in worte: hochzahl(img, bw, w, tessdata)
    for w in worte:  # mögliche Aufzählungspunkte nicht als Störzeichen verwerfen; zeilen_bauen entscheidet
        if BULLET.match(w['t']) and w['w'] < 1.6 * th and w['h'] < 1.3 * th: w['bul'] = True
    worte = [w for w in worte if w.get('frag') or w.get('bul') or not ((w['c'] < 30 and not re.search(r'[A-Za-zÄÖÜäöü0-9]{2}', w['t'])) or re.match(r'^[_|~]+$', w['t']) or (w['c'] < 50 and re.match(r'^[-–—.,\'‘’"]+$', w['t'])))]
    for w in worte: w['t'] = re.sub(r'\bIll\b', 'III', re.sub(r'\bIl\b', 'II', w['t']))
    # kleine Formen ohne Linien: gut lesbare Schrift bleibt Text (Titel in grosser Schrift), sonst ist es eine Skizze
    for e in elemente:
        if not e.get('offen'): continue
        b = e['b']; drin = [w for w in worte if schnitt([w['x'], w['y'], w['x'] + w['w'], w['y'] + w['h']], b) > 0.5 * w['w'] * w['h']]
        lesbar = [w for w in drin if re.search(r'[A-Za-zÄÖÜäöü]{2}|^\d{1,3}\.?$', w['t'])]
        if lesbar and np.mean([w['c'] for w in lesbar]) >= 80 and len(lesbar) >= 0.7 * len(drin) and sum(w['w'] for w in lesbar) > 0.45 * (b[2] - b[0]): e['b'] = None
        else: ids = {id(w) for w in drin}; worte = [w for w in worte if id(w) not in ids]
    elemente = [e for e in elemente if e.get('b')]
    # Beschriftungen in der Skizze selbst lesen (für die Suche)
    for e in elemente:
        if e['typ'] != 'skizze': continue
        b = e['b']
        try: e['text'] = ' '.join(w['t'] for w in tess(img[b[1]:b[3], b[0]:b[2]], tessdata, 11) if w['c'] >= 70 and re.search(r'[A-Za-zÄÖÜäöü0-9]{2}', w['t']))[:600]
        except Exception: e['text'] = ''
    # Tabellen aus den Wörtern bauen
    frei = worte
    for e in elemente:
        if e['typ'] != 'tabelle?': continue
        zl, ws = tabelle_aus(frei, e['b'], e['hl'], e.get('vl', []), th)
        if zl:
            zellen = [c for z in zl for c in z]
            schlecht = [w for w in ws if w['c'] < 50 or not re.search(r'[A-Za-zÄÖÜäöü0-9]', w['t'])]
            if os.environ.get('NB_DEBUG'): print('tab', i, len(ws), len(schlecht), round(float(np.mean([w['c'] for w in ws])), 1), sum(1 for c in zellen if c), len(zellen), len(zl[0]))
            gut = len(schlecht) <= 0.1 * len(ws) and np.mean([w['c'] for w in ws]) >= 78 and sum(1 for c in zellen if c) >= 0.45 * len(zellen) and len(zl[0]) <= 10
            if not gut:
                # unsichere Tabelle: als Bild aus dem Original zeigen, nichts Falsches abschreiben
                ids = {id(w) for w in ws}; frei = [w for w in frei if id(w) not in ids]
                e['typ'] = 'skizze'; e['text'] = ' '.join(w['t'] for w in ws if w['c'] >= 70)[:600]; e['tab'] = True
                continue
        if zl:
            e['typ'] = 'tabelle'; e['zeilen'] = zl; e['worte'] = ws; ids = {id(w) for w in ws}; frei = [w for w in frei if id(w) not in ids]
            e['c'] = min([w['c'] for w in ws] or [0])
        else: e['b'] = None
    elemente = [e for e in elemente if e.get('b')]
    zeilen = zeilen_bauen(frei, th)
    # kurze Zeilen neben einer Skizze gehören zur Skizze
    rest = []; titel = {}
    for l in zeilen:
        zu = None
        for e in elemente:
            if e['typ'] != 'skizze': continue
            b = e.setdefault('b0', list(e['b'])); m = (l['y0'] + l['y1']) / 2
            if b[1] < m < b[3] and len(l['worte']) <= 4 and (l['x0'] >= b[2] - 5 or l['x1'] <= b[0] + 5) and min(abs(l['x0'] - b[2]), abs(b[0] - l['x1'])) < 5 * th: zu = e
            elif b[1] - 4 < m < b[3] + 4 and len(l['worte']) <= 6 and min(abs(l['x0'] - b[2]), abs(b[0] - l['x1'])) <= 6: zu = e  # vom Rand der Skizze angeschnitten
            elif len(l['worte']) <= 2 and len(l['t']) <= 6 and b[0] - th < l['x0'] and l['x1'] < b[2] + th and min(abs(l['y1'] - b[1]), abs(l['y0'] - b[3])) < 1.5 * th and not re.match(r'^\d+$', l['t']): zu = e
        if zu and (id(zu) in titel or re.match(r'(Figur|Fig\.|Bild|Abb)', l['t'])):
            titel.setdefault(id(zu), dict(l, e=zu, kein=True)); t = titel[id(zu)]
            if t['worte'] is not l['worte']: t['t'] += ' ' + l['t']
        elif zu:
            zu['b'] = [min(zu['b'][0], l['x0'] - 8), min(zu['b'][1], l['y0'] - 8), max(zu['b'][2], l['x1'] + 8), max(zu['b'][3], l['y1'] + 8)]
            zu['text'] = (zu.get('text', '') + ' ' + l['t']).strip()
        else: rest.append(l)
    # Beschriftungen rund um Skizzen (wenige Wörter, nahe an der Zeichnung) gehören zur Skizze
    def nahe(l, b, m): return schnitt([l['x0'] - m, l['y0'] - m, l['x1'] + m, l['y1'] + m], b) > 0
    aend = True
    while aend:
        aend = False
        for k, l in enumerate(rest):
            if l is None or max(len(sg) for sg in l['seg']) > 5 or len(l['worte']) > 10 or KOPF.match(l['t']) or re.match(r'^\d{1,3}$', l['t']) or id(l) in {id(t) for t in titel.values()}: continue
            vor = next((q for q in reversed(rest[:k]) if q is not None), None)
            if vor is not None and len(vor['worte']) >= 6 and l['y0'] - vor['y1'] < 1.2 * th and abs(l['x0'] - vor['x0']) < 1.5 * th: continue  # letzte Zeile eines Absatzes
            for e in elemente:
                if e['typ'] == 'skizze' and nahe(l, e['b'], 2.5 * th):
                    e['b'] = [min(e['b'][0], l['x0'] - 8), min(e['b'][1], l['y0'] - 8), max(e['b'][2], l['x1'] + 8), max(e['b'][3], l['y1'] + 8)]
                    e['text'] = (e.get('text', '') + ' ' + l['t']).strip(); rest[k] = None; aend = True; break
    rest = [l for l in rest if l is not None]
    # Skizzen, die sich nach dem Wachsen überlappen, sind eine
    sk = [e for e in elemente if e['typ'] == 'skizze']; neu = True
    while neu:
        neu = False
        for a in sk:
            for c in sk:
                if a is not c and a.get('b') and c.get('b') and (schnitt(a['b'], c['b']) > 0 or (min(a['b'][3], c['b'][3]) - max(a['b'][1], c['b'][1]) > 0.5 * min(a['b'][3] - a['b'][1], c['b'][3] - c['b'][1]) and max(a['b'][0], c['b'][0]) - min(a['b'][2], c['b'][2]) < 6 * th)):
                    a['b'] = [min(a['b'][0], c['b'][0]), min(a['b'][1], c['b'][1]), max(a['b'][2], c['b'][2]), max(a['b'][3], c['b'][3])]; a['text'] = (a.get('text', '') + ' ' + c.get('text', '')).strip(); c['b'] = None; neu = True
    elemente = [e for e in elemente if e.get('b')]
    for e in elemente: e['b'] = [max(0, int(e['b'][0])), max(0, int(e['b'][1])), min(W, int(e['b'][2])), min(H, int(e['b'][3]))]
    zeilen, bloecke = spaltenbloecke(rest, th)
    zeilen, b2 = formelbloecke(zeilen, th)
    zeilen, b3 = rasterbloecke(zeilen, th)
    for bl in bloecke + b2 + b3:
        bl['b'] = [max(0, int(bl['b'][0])), max(0, int(bl['b'][1])), min(W, int(bl['b'][2])), min(H, int(bl['b'][3]))]; elemente.append(bl)
    for t in titel.values():
        if t['e'].get('b'): t['y0'] = t['e']['b'][3] + 1; t['y1'] = t['y0'] + th
        zeilen.append(t)
    # Marken für Tabellen und Skizzen in die Lesereihenfolge setzen
    elemente.sort(key=lambda e: (e['b'][1], e['b'][0]))
    for k, e in enumerate(elemente):
        e['nr'] = k + 1
        zeilen.append(dict(t=f"[[{'Tabelle' if e['typ'] == 'tabelle' else 'Skizze'} {i}.{k + 1}]]", x0=e['b'][0], x1=e['b'][2], y0=e['b'][1], y1=e['b'][3], kap=0, worte=[], kein=True, marke=True))
    def lage(l): return l['y0'] + (0 if l.get('marke') else (l['y1'] - l['y0']) / 2)
    zeilen.sort(key=lage)
    text = absaetze(zeilen, th)
    echte = [l for l in zeilen if not l.get('marke')]
    kaps = [l['kap'] for l in echte if l['kap']]
    kmed = float(np.median(kaps)) if kaps else 0.7 * th
    zl = [dict(t=re.sub(r'\s+', ' ', l['t']), g=round((l['kap'] or kmed) * 72 / DPI / 0.72, 1), x=round(l['x0'] * 72 / DPI), yy=round(l['y0'] / H, 3)) for l in echte]
    alle = [w for l in echte for w in l['worte']] + [w for e in elemente for w in e.get('worte', [])]
    unsicher = sorted({w['t'] for w in alle if w.get('frag') or (w['c'] < 55 and re.search(r'\d', w['t'])) or (w['c'] < 35 and len(w['t']) > 2)})
    el = []
    for e in elemente:
        b = e['b']
        o = dict(nr=e['nr'], typ=e['typ'], box=[round(b[0] / W, 4), round(b[1] / H, 4), round((b[2] - b[0]) / W, 4), round((b[3] - b[1]) / H, 4)])
        if e['typ'] == 'tabelle':
            o['zeilen'] = e['zeilen']
            if e.get('ohneKopf'): o['ohneKopf'] = True
        else:
            o['text'] = e.get('text', '')
            if e.get('tab'): o['tab'] = True
            if e.get('formel'): o['formel'] = True
        el.append(o)
    conf = float(np.mean([w['c'] for w in alle])) if alle else 0
    lagen = [[w['t'], round(w['x'] / W, 4), round(w['y'] / H, 4), round(w['w'] / W, 4), round(w['h'] / H, 4)] for w in sorted(alle, key=lambda w: (round((w['y'] + w['h'] / 2) / (0.6 * th)), w['x']))]
    return dict(s=i, luecke=luecke_, lagen=lagen, text=text, roh='\n'.join(l['t'] for l in echte), zeilen=zl, elemente=el, unsicher=unsicher, conf=round(conf, 1), worte=len(alle))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tessdata', required=True); ap.add_argument('--nur', default=''); ap.add_argument('--seiten', default=''); ap.add_argument('--neu', action='store_true'); ap.add_argument('--aus', default='daten/ocr'); ap.add_argument('--prozesse', type=int, default=2)
    a = ap.parse_args()
    os.environ['OMP_THREAD_LIMIT'] = '1'
    lib = json.load(open('daten/bibliothek.json'))
    os.makedirs(a.aus, exist_ok=True)
    nur = set(a.nur.split(',')) if a.nur else None
    for dok in lib['dokumente']:
        if nur and dok['id'] not in nur: continue
        ziel = os.path.join(a.aus, dok['id'] + '.json')
        if os.path.exists(ziel) and not a.neu and not a.seiten: continue
        art = [True] * dok['seiten'] if dok['id'] in ERZWUNGEN else seiten_art(dok['pfad'], dok['seiten'])
        seiten = [i + 1 for i, s in enumerate(art) if s]
        if a.seiten:
            wahl = set()
            for t in a.seiten.split(','):
                x = t.split('-'); wahl |= set(range(int(x[0]), int(x[-1]) + 1))
            seiten = [s for s in seiten if s in wahl]
        if not seiten: continue
        print(dok['id'], len(seiten), 'Seiten', flush=True)
        with ProcessPoolExecutor(a.prozesse) as ex:
            erg = list(ex.map(seite, [(dok['pfad'], s, a.tessdata) for s in seiten]))
        if a.seiten and os.path.exists(ziel):
            alt = {e['s']: e for e in json.load(open(ziel))['seiten']}; alt.update({e['s']: e for e in erg}); erg = [alt[k] for k in sorted(alt)]
        json.dump(dict(dokId=dok['id'], datei=dok['datei'], pruefsumme=dok['pruefsumme'], werkzeug='tesseract 5 / deu (tessdata_best) / 300 dpi', seiten=erg), open(ziel, 'w'), ensure_ascii=False)
        print('  mittlere Sicherheit', round(sum(e['conf'] for e in erg) / len(erg), 1), flush=True)


if __name__ == '__main__':
    main()
