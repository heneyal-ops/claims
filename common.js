// Shared PDF logic for the Phoenix car claim notification form (300205004, May 2017).
// Coordinates are PDF points measured from the TOP of the page (page height 841.89).
const PAGE_H = 841.89;
const INK = [0.05, 0.12, 0.45];

// pdf-lib + fontkit lay Hebrew runs out right-to-left themselves; we only have to keep
// LTR runs (numbers, latin, emails) in the right internal order.
function visText(s) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (!/[֐-׿]/.test(s)) return s;
  const mir = { '(': ')', ')': '(', '[': ']', ']': '[' };
  s = [...s].map(ch => mir[ch] || ch).join('');
  return s.replace(/[A-Za-z0-9@._\-\/:+]+(?:[ ,][A-Za-z0-9@._\-\/:+]+)*/g, m => [...m].reverse().join(''));
}
function fmtDate(v) { if (!v) return ''; const p = v.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v; }

// Unicode-safe base64 for passing data in the link (#d=...)
function encodeData(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeData(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
}

async function loadForm() {
  const base = new URL('assets/', document.baseURI);
  const [pdfBytes, fontBytes] = await Promise.all([
    fetch(new URL('phoenix-car-claim.pdf', base)).then(r => r.arrayBuffer()),
    fetch(new URL('heb.ttf', base)).then(r => r.arrayBuffer()),
  ]);
  const doc = await PDFLib.PDFDocument.load(pdfBytes);
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes);
  if (doc.getPageCount() > 2) doc.removePage(2); // bank authorization page is not sent
  const pages = doc.getPages();
  const ink = PDFLib.rgb(...INK);

  const put = (pi, text, x, y, align = 'c', size = 10, maxW = null) => {
    if (text == null || String(text).trim() === '') return;
    const t = visText(text); let s = size;
    if (maxW) while (font.widthOfTextAtSize(t, s) > maxW && s > 5.5) s -= 0.5;
    const w = font.widthOfTextAtSize(t, s);
    const xx = align === 'r' ? x - w : align === 'c' ? x - w / 2 : x;
    pages[pi].drawText(t, { x: xx, y: PAGE_H - y, size: s, font, color: ink });
  };
  const dot = (pi, x, y) => pages[pi].drawCircle({ x, y: PAGE_H - y, size: 2.6, color: ink });
  const digits = (pi, num, edges, y, size = 10) => {
    const d = String(num || '').replace(/\D/g, ''); if (!d) return;
    const ds = d.padStart(edges.length - 1, '0').slice(-(edges.length - 1)).split('');
    ds.forEach((c, i) => put(pi, c, (edges[i] + edges[i + 1]) / 2, y, 'c', size));
  };
  // word-wrap Hebrew text into fixed lines (right aligned)
  const lines = (pi, text, xRight, width, ys, size = 9.5) => {
    text = String(text || '').replace(/\s+/g, ' ').trim(); if (!text) return;
    let s = size, out;
    const wrap = sz => {
      const words = text.split(' '); const res = []; let cur = '';
      for (const w of words) {
        const tryL = cur ? cur + ' ' + w : w;
        if (font.widthOfTextAtSize(visText(tryL), sz) <= width) cur = tryL;
        else { if (cur) res.push(cur); cur = w; }
      }
      if (cur) res.push(cur); return res;
    };
    do { out = wrap(s); if (out.length <= ys.length) break; s -= 0.5; } while (s >= 6.5);
    if (out.length > ys.length) { out = out.slice(0, ys.length); out[ys.length - 1] += '…'; }
    out.forEach((l, i) => put(pi, l, xRight, ys[i], 'r', s, width));
  };
  const image = async (pi, dataUrl, x0, top, x1, bottom) => {
    if (!dataUrl) return;
    const img = await doc.embedPng(dataUrl);
    const bw = x1 - x0, bh = bottom - top;
    const sc = Math.min(bw / img.width, bh / img.height);
    const w = img.width * sc, h = img.height * sc;
    pages[pi].drawImage(img, { x: x0 + (bw - w) / 2, y: PAGE_H - bottom + (bh - h) / 2, width: w, height: h });
  };
  return { doc, font, pages, put, dot, digits, lines, image };
}

const ID_EDGES_P1 = [22, 36, 51, 65, 79, 93, 107, 121, 136, 150];

// Fields the AGENT knows (page 1 header, insured, vehicle)
function fillAgent(f, d) {
  const { put, dot, digits } = f;
  put(0, d.policy, 484, 129, 'c', 11, 170);
  put(0, d.agent, 351, 129, 'c', 10, 86);
  put(0, d.name, 566, 178, 'r', 10.5, 142);
  put(0, d.address, 284.5, 178, 'c', 10, 262);
  digits(0, d.idno, ID_EDGES_P1, 179.5, 10.5);
  put(0, d.email, 428, 205, 'c', 10, 280);
  put(0, d.mobile, 217, 205, 'c', 10.5, 130);
  put(0, d.plate, 490, 291, 'c', 11, 158);
  put(0, d.maker, 333, 291, 'c', 10.5, 145);
  put(0, d.model, 197, 291, 'c', 10.5, 118);
  if (d.vtype) { const cx = { private: 121, commercial: 91, other: 55 }[d.vtype]; if (cx) dot(0, cx, 286); }
  put(0, d.year, 490, 315.5, 'c', 10.5);
  put(0, d.regTo, 215, 315.5, 'c', 10.5, 380);
  put(0, fmtDate(d.eventDate), 516, 431, 'c', 10.5);
}

// Fields the CLIENT fills (driver, event, third parties, injured, witnesses, signatures)
async function fillClient(f, c) {
  const { put, dot, digits, lines, image } = f;
  // ---- ב. driver ----
  put(0, c.drvName, 566, 363, 'r', 10.5, 142);
  put(0, c.drvAddress, 284.5, 363, 'c', 10, 262);
  digits(0, c.drvId, ID_EDGES_P1, 364, 10.5);
  put(0, c.drvRelation, 516.5, 388, 'c', 9.5, 106);
  put(0, fmtDate(c.drvBirth), 415, 388, 'c', 10);
  put(0, c.drvPhone, 311, 388, 'c', 10, 112);
  put(0, c.drvLicense, 187, 388, 'c', 10, 128);
  if (c.drvPermission === 'yes') dot(0, 91.5, 385.5);
  if (c.drvPermission === 'no') dot(0, 64.5, 385.5);
  // ---- ג. event ----
  put(0, fmtDate(c.evDate), 516, 431, 'c', 10.5);
  put(0, c.evTime, 415, 431, 'c', 10.5);
  put(0, c.evPlace, 311, 431, 'c', 9, 112);
  if (c.police === 'yes') dot(0, 205, 428.5);
  if (c.police === 'no') dot(0, 178.5, 428.5);
  put(0, c.policeStation, 71.5, 431, 'c', 9, 95);
  if (c.fault === 'me') dot(0, 478.5, 453);
  if (c.fault === 'third') dot(0, 451.5, 453);
  put(0, c.witnessSummary, 566, 479, 'r', 9, 248);
  lines(0, c.description, 566, 248, [509, 530.5, 552, 574, 595.5], 9.5);
  put(0, c.signInsured, 215, 602, 'r', 8.5, 100);
  put(0, c.signThird, 87, 602, 'r', 8.5, 62);
  // ---- ד. third parties (right column = 1, left column = 2) ----
  const rows = [635, 662, 689.5, 717, 744, 771, 798];
  const cols = [[504.5, 370], [224, 89.5]]; // [rightCell center, leftCell center]
  (c.third || []).slice(0, 2).forEach((t, i) => {
    const [a, b] = cols[i], wa = 130, wb = 130;
    put(0, t.ownerName, a, rows[0], 'c', 9.5, wa); put(0, t.ownerId, b, rows[0], 'c', 9.5, wb);
    put(0, t.ownerAddress, a, rows[1], 'c', 9, wa); put(0, t.ownerPhone, b, rows[1], 'c', 9.5, wb);
    put(0, t.driverName, a, rows[2], 'c', 9.5, wa); put(0, t.driverId, b, rows[2], 'c', 9.5, wb);
    put(0, t.driverAddress, a, rows[3], 'c', 9, wa); put(0, t.driverPhone, b, rows[3], 'c', 9.5, wb);
    put(0, t.plate, a, rows[4], 'c', 10, wa); put(0, t.maker, b, rows[4], 'c', 9.5, wb);
    put(0, t.color, a, rows[5], 'c', 9.5, wa); put(0, t.year, b, rows[5], 'c', 9.5, wb);
    put(0, t.insurer, a, rows[6], 'c', 9.5, wa); put(0, t.policy, b, rows[6], 'c', 9.5, wb);
  });
  // ---- page 2: ה. injured ----
  const inj = [{ r1: 220.5, r2: 246.5, ry: 238.7 }, { r1: 270.5, r2: 294.5, ry: 286.7 }, { r1: 318.5, r2: 342.5, ry: 334.7 }];
  (c.injured || []).slice(0, 3).forEach((p, i) => {
    const g = inj[i];
    put(1, p.name, 455.5, g.r1, 'c', 9.5, 175); put(1, p.id, 306, g.r1, 'c', 9.5, 116);
    put(1, p.address, 183.5, g.r1, 'c', 8.5, 122); put(1, p.phone, 72, g.r1, 'c', 9, 96);
    put(1, p.nature, 455.5, g.r2, 'c', 9, 175); put(1, p.hospital, 306, g.r2, 'c', 9, 116);
    const rx = { walker: 237.7, inCar: 151.7, otherCar: 71.7 }[p.role]; if (rx) dot(1, rx, g.ry);
  });
  const yn = (v, yesX, noX, y) => { if (v === 'yes') dot(1, yesX, y); if (v === 'no') dot(1, noX, y); };
  yn(c.qWork, 433.7, 408.7, 353.7); yn(c.qToWork, 291.7, 265.7, 353.7); yn(c.qFromWork, 133.7, 107.7, 353.7);
  yn(c.qTruck, 480.7, 455.7, 367.7); yn(c.qMoto, 336.7, 311.7, 367.7); yn(c.qTrailer, 196.7, 172.7, 367.7);
  put(1, c.trailerPlate, 86, 370, 'r', 8.5, 60);
  yn(c.qPaid, 468.7, 444.7, 380.7); yn(c.qParked, 309.7, 285.7, 380.7);
  put(1, c.parkedPlate, 171, 384, 'r', 8.5, 145);
  // ---- ו. witnesses ----
  [427, 441].forEach((y, i) => {
    const w = (c.witnesses || [])[i]; if (!w) return;
    put(1, w.name, 514.5, y, 'c', 9.5, 112); put(1, w.address, 357, y, 'c', 9, 196);
    put(1, w.phone, 198, y, 'c', 9.5, 115); put(1, w.id, 80.5, y, 'c', 9.5, 114);
  });
  put(1, c.witnessRelation, 470, 455, 'r', 9, 440);
  // ---- signatures & dates ----
  const today = c.signDate || '';
  put(1, today, 495.5, 135, 'c', 10);
  await image(1, c.sigInsured, 26, 120, 146, 139);
  await image(1, c.sigOwner || c.sigInsured, 160, 120, 410, 139);
  await image(1, c.sigInsured, 28, 705, 146, 727);
  put(1, today, 501, 722, 'c', 10);
  await image(1, c.sigOwner || c.sigInsured, 28, 777, 146, 799);
  put(1, today, 501, 794, 'c', 10);
}
