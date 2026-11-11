/**
 * KACHIER PDF engine.
 *
 * This draws the invoice with real text and vector shapes (jsPDF + autoTable). It is NOT a
 * screenshot of the page, so the text stays sharp, can be selected and searched, and the file
 * stays small. It reads the same data, totals and wording as the on-screen preview
 * (calc.ts, docModel.ts, theme.ts), so the PDF and the preview always agree.
 *
 * Everything runs in the browser. Nothing is uploaded.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CellHookData, HookData } from 'jspdf-autotable';
import type { DocData, SummaryRow } from '../types';
import { buildSummary, computeTotals } from '../lib/calc';
import { formatMoney } from '../lib/currency';
import { buildModel, itemCells } from '../lib/docModel';
import { STATUS_COLORS, THEMES, hexToRgb } from '../lib/theme';

/* ------------------------------------------------------------------ fonts */

const FONT_KEYS = ['SnapSans-Regular', 'SnapSans-Bold', 'SnapSerif-Regular', 'SnapSerif-Bold'] as const;
type FontKey = (typeof FONT_KEYS)[number];

interface FontFile {
  base64: string;
  /** Code points the font can draw. null = unknown (then nothing is filtered). */
  glyphs: Set<number> | null;
}

let fontsPromise: Promise<Record<FontKey, FontFile>> | null = null;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + step)));
  }
  return btoa(bin);
}

/** Reads which characters a TrueType font really contains (cmap format 4). */
function readGlyphs(buf: ArrayBuffer): Set<number> | null {
  try {
    const v = new DataView(buf);
    const numTables = v.getUint16(4);
    let cmapOffset = -1;
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      const tag = String.fromCharCode(v.getUint8(rec), v.getUint8(rec + 1), v.getUint8(rec + 2), v.getUint8(rec + 3));
      if (tag === 'cmap') cmapOffset = v.getUint32(rec + 8);
    }
    if (cmapOffset < 0) return null;

    const count = v.getUint16(cmapOffset + 2);
    let sub = -1;
    for (let i = 0; i < count; i++) {
      const rec = cmapOffset + 4 + i * 8;
      const platform = v.getUint16(rec);
      const encoding = v.getUint16(rec + 2);
      const off = cmapOffset + v.getUint32(rec + 4);
      if (v.getUint16(off) !== 4) continue;
      if ((platform === 3 && encoding === 1) || platform === 0) {
        sub = off;
        break;
      }
    }
    if (sub < 0) return null;

    const segCount = v.getUint16(sub + 6) / 2;
    const endBase = sub + 14;
    const startBase = endBase + segCount * 2 + 2;
    const deltaBase = startBase + segCount * 2;
    const rangeBase = deltaBase + segCount * 2;
    const set = new Set<number>();
    for (let s = 0; s < segCount; s++) {
      const end = v.getUint16(endBase + s * 2);
      const start = v.getUint16(startBase + s * 2);
      const delta = v.getInt16(deltaBase + s * 2);
      const ro = v.getUint16(rangeBase + s * 2);
      for (let c = start; c <= end && c < 0xffff; c++) {
        let gid: number;
        if (ro === 0) gid = (c + delta) & 0xffff;
        else {
          gid = v.getUint16(rangeBase + s * 2 + ro + (c - start) * 2);
          if (gid !== 0) gid = (gid + delta) & 0xffff;
        }
        if (gid !== 0) set.add(c);
      }
    }
    return set.size ? set : null;
  } catch {
    return null;
  }
}

function loadFonts(): Promise<Record<FontKey, FontFile>> {
  if (!fontsPromise) {
    const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    fontsPromise = Promise.all(
      FONT_KEYS.map(async (key) => {
        const res = await fetch(`${base}fonts/${key}.ttf`);
        if (!res.ok) throw new Error(`Could not load font ${key}`);
        const buf = await res.arrayBuffer();
        return [key, { base64: toBase64(buf), glyphs: readGlyphs(buf) }] as const;
      }),
    )
      .then((entries) => Object.fromEntries(entries) as Record<FontKey, FontFile>)
      .catch((err) => {
        fontsPromise = null; // allow a retry on the next click
        throw err;
      });
  }
  return fontsPromise;
}

/** Loads the fonts ahead of time so the first download is instant. */
export async function warmUp(): Promise<void> {
  await loadFonts();
}

/* ---------------------------------------------------------------- constants */

const PT = 0.3528; // millimetres per point
const LH = 1.4; // line-height used everywhere, same as the on-screen document
const lh = (pt: number) => pt * PT * LH;

const PAGE_W = 210;
const PAGE_H = 297;
const ML = 15;
const MR = 15;
const CW = PAGE_W - ML - MR; // 180
const TOP = 14;
const TOP_CONT = 24; // where content starts on pages 2, 3, ...
const BOTTOM = PAGE_H - 20; // lowest point content may reach
const PLACEHOLDER = '#b7bdc9';

type RGB = [number, number, number];
const rgb = (hex: string): RGB => hexToRgb(hex);

/* -------------------------------------------------------------------- build */

/**
 * Builds the PDF. Documents are laid out normally first. When that spills onto extra pages
 * (for example a waybill whose signature boxes would sit alone on page 2), the document is laid
 * out again with slightly tighter vertical gaps and the shorter result is kept.
 */
/**
 * Turns the QR image the user supplied (uploaded file or web link) into a crisp PNG that can be placed in the PDF.
 * Returns null when the image cannot be read, for example when the web link blocks other websites from using it.
 * It never creates a QR code: it only re-draws the user's own image, with sharp edges so it stays scannable.
 */
async function loadQrPng(src: string): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error('load')); img.src = src; });
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    const scale = Math.min(8, Math.max(1, Math.round(600 / Math.max(w, h))));
    const c = document.createElement('canvas');
    c.width = w * scale;
    c.height = h * scale;
    const g = c.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png'); // throws if the image came from a site that does not allow it
  } catch {
    return null;
  }
}

export async function buildPdf(data: DocData): Promise<Blob> {
  const normal = await render(data, false);
  if (normal.pages === 1) return normal.blob;
  const compact = await render(data, true);
  return compact.pages < normal.pages ? compact.blob : normal.blob;
}

async function render(data: DocData, compact: boolean): Promise<{ blob: Blob; pages: number }> {
  const fonts = await loadFonts();
  /** Vertical gap between sections, in millimetres (tighter in compact mode). */
  const G = (mm: number) => (compact ? mm * 0.45 : mm);
  const theme = THEMES[data.template];
  const totals = computeTotals(data);
  const summary = buildSummary(data, totals);
  const model = buildModel(data);
  const sc = model.statusKey ? STATUS_COLORS[model.statusKey] : null;
  const cur = data.currency;
  const money = (cents: number) => formatMoney(cents, cur);
  const bodyPt = data.template === 'classic' ? 10 : 9.5;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setLineHeightFactor(LH);

  const reg = fonts[`${theme.font}-Regular` as FontKey];
  FONT_KEYS.forEach((key) => {
    const family = key.startsWith('SnapSerif') ? 'SnapSerif' : 'SnapSans';
    const style = key.endsWith('Bold') ? 'bold' : 'normal';
    doc.addFileToVFS(`${key}.ttf`, fonts[key].base64);
    doc.addFont(`${key}.ttf`, family, style, undefined, 'Identity-H');
  });

  const title = `${model.title.charAt(0)}${model.title.slice(1).toLowerCase()} ${data.number.trim()}`.trim();
  doc.setProperties({
    title,
    subject: title,
    author: data.businessName.trim() || 'KACHIER',
    creator: 'KACHIER',
  });

  /* ---------- small drawing helpers ---------- */

  /** Keeps only characters the font can draw, so nothing turns into empty boxes. */
  const clean = (s: string): string => {
    const glyphs = reg.glyphs;
    let out = '';
    for (const ch of String(s ?? '').normalize('NFC').replace(/\r/g, '').replace(/ /g, ' ').replace(/\t/g, ' ')) {
      const cp = ch.codePointAt(0) ?? 0;
      if (ch === '\n') out += ch;
      else if (cp < 32) continue;
      else if (!glyphs || glyphs.has(cp)) out += ch;
    }
    return out;
  };

  const setF = (bold: boolean, pt: number) => {
    doc.setFont(theme.font, bold ? 'bold' : 'normal');
    doc.setFontSize(pt);
  };
  const tw = (text: string, pt: number, bold = false) => {
    setF(bold, pt);
    return doc.getTextWidth(text);
  };

  /** Baseline that visually centres capital letters inside a line box starting at `top`. */
  const base = (top: number, pt: number, boxH = lh(pt)) => top + boxH / 2 + 0.36 * pt * PT;

  interface PutOpt {
    pt?: number;
    bold?: boolean;
    color?: string;
    align?: 'left' | 'right' | 'center';
    boxH?: number;
  }
  /** Draws one line of text whose line box starts at `top`. */
  const put = (text: string, x: number, top: number, o: PutOpt = {}) => {
    const pt = o.pt ?? bodyPt;
    setF(!!o.bold, pt);
    doc.setTextColor(...rgb(o.color ?? theme.text));
    doc.text(clean(text), x, base(top, pt, o.boxH), { align: o.align ?? 'left' });
  };

  /** Letter-spaced text (used for small capitals labels and titles). */
  const spacedWidth = (text: string, pt: number, bold: boolean, spacing: number) => {
    setF(bold, pt);
    const chars = Array.from(clean(text));
    return chars.reduce((a, c) => a + doc.getTextWidth(c), 0) + spacing * Math.max(0, chars.length - 1);
  };
  const putSpaced = (text: string, x: number, top: number, o: PutOpt & { spacing: number }) => {
    const pt = o.pt ?? 7;
    const bold = !!o.bold;
    const total = spacedWidth(text, pt, bold, o.spacing);
    let cx = o.align === 'right' ? x - total : o.align === 'center' ? x - total / 2 : x;
    setF(bold, pt);
    doc.setTextColor(...rgb(o.color ?? theme.muted));
    const y = base(top, pt, o.boxH);
    for (const ch of Array.from(clean(text))) {
      doc.text(ch, cx, y);
      cx += doc.getTextWidth(ch) + o.spacing;
    }
  };

  /** Wraps text to a width. Honours line breaks and splits very long words. */
  const wrap = (text: string, w: number, pt: number, bold = false): string[] => {
    setF(bold, pt);
    const out: string[] = [];
    for (const para of clean(text).split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) {
        out.push('');
        continue;
      }
      let line = '';
      for (const word of words) {
        const trial = line ? `${line} ${word}` : word;
        if (doc.getTextWidth(trial) <= w) {
          line = trial;
          continue;
        }
        if (line) {
          out.push(line);
          line = '';
        }
        if (doc.getTextWidth(word) <= w) {
          line = word;
          continue;
        }
        let chunk = '';
        for (const ch of Array.from(word)) {
          if (chunk && doc.getTextWidth(chunk + ch) > w) {
            out.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        line = chunk;
      }
      if (line) out.push(line);
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    return out;
  };

  const fillRect = (x: number, y: number, w: number, h: number, hex: string, r = 0) => {
    doc.setFillColor(...rgb(hex));
    if (r > 0) doc.roundedRect(x, y, w, h, r, r, 'F');
    else doc.rect(x, y, w, h, 'F');
  };
  const hline = (x1: number, x2: number, y: number, hex: string, width: number) => {
    doc.setDrawColor(...rgb(hex));
    doc.setLineWidth(width);
    doc.line(x1, y, x2, y);
  };

  /** Places the logo inside a max box (never enlarged beyond its natural size). */
  const logoSize = (maxW: number, maxH: number): { w: number; h: number } | null => {
    const l = data.logo;
    if (!l || !l.width || !l.height) return null;
    const natW = l.width * 0.2646;
    const natH = l.height * 0.2646;
    const s = Math.min(1, maxW / natW, maxH / natH);
    return { w: natW * s, h: natH * s };
  };
  const drawLogo = (x: number, y: number, size: { w: number; h: number }) => {
    if (!data.logo) return;
    try {
      doc.addImage(data.logo.dataUrl, data.logo.format, x, y, size.w, size.h);
    } catch {
      /* a logo that cannot be embedded is skipped; the rest of the invoice is unaffected */
    }
  };

  const bizText = data.businessName.trim() || 'Your Business Name';
  const bizColor = (onDark = false) => (data.businessName.trim() ? (onDark ? '#ffffff' : theme.ink) : PLACEHOLDER);

  let y = TOP;

  /* ---------- running header on pages 2+ ---------- */
  const runningHeader = () => {
    put(bizText, ML, 10, { pt: 8.5, bold: true, color: data.businessName.trim() ? theme.ink : PLACEHOLDER });
    const right = `${model.title} ${data.number.trim()}`.trim();
    put(right, ML + CW, 10, { pt: 8, color: theme.muted, align: 'right' });
    hline(ML, ML + CW, 16, theme.rule, 0.2);
  };
  const newPage = () => {
    doc.addPage();
    runningHeader();
    y = TOP_CONT;
  };
  // Compact layouts may use the last 3 mm above the footer rule; normal layouts keep the usual margin.
  const ensure = (h: number) => {
    if (y + h > (compact ? BOTTOM + 3 : BOTTOM)) newPage();
  };

  /* =================================================================== HEADER */

  const statusPill = (right: number, top: number): number => {
    if (!sc) return 0;
    const label = model.statusText;
    const w = spacedWidth(label, 7.5, true, 0.75) + 6;
    const h = 0.9 * 2 + 7.5 * PT * 1.3;
    doc.setFillColor(...rgb(sc.bg));
    doc.setDrawColor(...rgb(sc.fg));
    doc.setLineWidth(0.25);
    doc.roundedRect(right - w, top, w, h, h / 2, h / 2, 'FD');
    putSpaced(label, right - w / 2, top, { pt: 7.5, bold: true, color: sc.fg, align: 'center', spacing: 0.75, boxH: h });
    return h;
  };

  const TS = model.title.length > 9 ? 0.7 : 1; // long titles are set smaller so they fit the header
  if (data.template === 'classic') {
    const rightW = Math.max(62, spacedWidth(model.title, 24 * TS, true, 0.16 * 24 * TS * PT) + 2);
    const leftW = CW - rightW - 10;
    // left: logo + name
    let ly = TOP;
    const lg = logoSize(42, 18);
    if (lg) {
      drawLogo(ML, ly, lg);
      ly += lg.h + 3;
    }
    const nameLines = wrap(bizText, leftW, 17, true);
    nameLines.forEach((line, i) => put(line, ML, ly + i * 17 * PT * 1.15, { pt: 17, bold: true, color: bizColor(), boxH: 17 * PT * 1.15 }));
    ly += nameLines.length * 17 * PT * 1.15;

    // right: title, meta, badge
    let ry = TOP;
    putSpaced(model.title, ML + CW, ry, { pt: 24 * TS, bold: true, color: theme.ink, align: 'right', spacing: 0.16 * 24 * TS * PT, boxH: 24 * TS * PT });
    ry += 24 * TS * PT + 4.5;
    model.fields.forEach(([k, v]) => {
      const rowH = lh(9);
      const ddW = Math.max(26, tw(clean(v), 9, true));
      put(v, ML + CW, ry + 0.5, { pt: 9, bold: true, color: theme.ink, align: 'right' });
      put(k, ML + CW - ddW - 5, ry + 0.5, { pt: 9, color: theme.muted, align: 'right' });
      ry += rowH + 1;
    });
    if (sc) {
      ry += 3;
      ry += statusPill(ML + CW, ry);
    }

    y = Math.max(ly, ry) + G(6);
    hline(ML, ML + CW, y + 0.25, theme.ink, 0.5);
    hline(ML, ML + CW, y + 1.0, theme.accent, 0.2);
    y += 1.1 + G(7);
  } else if (data.template === 'minimal') {
    const titleW = spacedWidth(model.title, 22 * TS, false, 0.2 * 22 * TS * PT) + 4;
    const leftW = CW - titleW - 10;
    let ly = TOP;
    const lg = logoSize(42, 18);
    if (lg) {
      drawLogo(ML, ly, lg);
      ly += lg.h + 3;
    }
    const nameLines = wrap(bizText, leftW, 16, true);
    nameLines.forEach((line, i) => put(line, ML, ly + i * 16 * PT * 1.15, { pt: 16, bold: true, color: bizColor(), boxH: 16 * PT * 1.15 }));
    ly += nameLines.length * 16 * PT * 1.15;
    putSpaced(model.title, ML + CW, TOP, { pt: 22 * TS, color: theme.muted, align: 'right', spacing: 0.2 * 22 * TS * PT, boxH: 22 * TS * PT });
    y = Math.max(ly, TOP + 22 * TS * PT) + G(8);

    const cells: Array<[string, string, string]> = [
      ...model.fields.map(([k, v]) => [k, v, theme.ink] as [string, string, string]),
      ...(sc ? [['Status', model.statusText, sc.fg] as [string, string, string]] : []),
    ];
    const stripH = 4 + (lh(7) + 0.8) + lh(10) + 4;
    fillRect(ML, y, CW, stripH, theme.soft, 2.5);
    const gap = 4;
    const cw = (CW - 10 - gap * (cells.length - 1)) / cells.length;
    cells.forEach(([k, v, color], i) => {
      const x = ML + 5 + i * (cw + gap);
      putSpaced(k.toUpperCase(), x, y + 4, { pt: 7, bold: true, color: theme.muted, spacing: 0.14 * 7 * PT });
      put(v, x, y + 4 + lh(7) + 0.8, { pt: 10, bold: true, color });
    });
    y += stripH + G(8);
  } else {
    // bold
    const padX = 8;
    const padY = 7;
    const rightBlockH = 22 * TS * PT + 2 + lh(10);
    const tile = logoSize(30, 14);
    const tileW = tile ? tile.w + 4 : 0;
    const tileH = tile ? tile.h + 4 : 0;
    const titleW = spacedWidth(model.title, 22 * TS, true, 0.14 * 22 * TS * PT);
    const noW = tw(clean(model.fields[0][1]), 10, true);
    const rightW = Math.max(titleW, noW);
    const nameW = CW - padX * 2 - rightW - 8 - (tile ? tileW + 5 : 0);
    const nameLines = wrap(bizText, nameW, 16, true);
    const nameH = nameLines.length * 16 * PT * 1.15;
    const inner = Math.max(rightBlockH, tileH, nameH);
    const blockH = padY * 2 + inner;
    fillRect(ML, y, CW, blockH, theme.ink, 3);

    let lx = ML + padX;
    if (tile) {
      const ty = y + padY + (inner - tileH) / 2;
      fillRect(lx, ty, tileW, tileH, '#ffffff', 2);
      drawLogo(lx + 2, ty + 2, tile);
      lx += tileW + 5;
    }
    const ny = y + padY + (inner - nameH) / 2;
    nameLines.forEach((line, i) => put(line, lx, ny + i * 16 * PT * 1.15, { pt: 16, bold: true, color: '#ffffff', boxH: 16 * PT * 1.15 }));

    const ryTop = y + padY + (inner - rightBlockH) / 2;
    putSpaced(model.title, ML + CW - padX, ryTop, { pt: 22 * TS, bold: true, color: '#ffffff', align: 'right', spacing: 0.14 * 22 * TS * PT, boxH: 22 * TS * PT });
    put(model.fields[0][1], ML + CW - padX, ryTop + 22 * TS * PT + 2, { pt: 10, bold: true, color: '#a9bdf5', align: 'right' });
    y += blockH + 4;

    const cards: Array<[string, string, string]> = [
      ...model.fields.slice(1).map(([k, v]) => [k, v, theme.ink] as [string, string, string]),
      ...(sc ? [['Status', model.statusText, sc.fg] as [string, string, string]] : []),
    ];
    const gap = 3;
    const cw = (CW - gap * (cards.length - 1)) / cards.length;
    const cardH = 3 + (lh(7) + 0.6) + lh(10) + 3;
    cards.forEach(([k, v, color], i) => {
      const x = ML + i * (cw + gap);
      fillRect(x, y, cw, cardH, theme.soft, 2.2);
      putSpaced(k.toUpperCase(), x + 4, y + 3, { pt: 7, bold: true, color: theme.muted, spacing: 0.14 * 7 * PT });
      put(v, x + 4, y + 3 + lh(7) + 0.6, { pt: 10, bold: true, color });
    });
    y += cardH + G(7);
  }

  /* ================================================================== PARTIES */

  interface Party {
    label: string;
    lines: Array<{ text: string; ph?: boolean }>;
    nameLines: number;
  }
  const decorPad = data.template === 'bold' ? { l: 1.2 + 4, r: 4, v: 3 } : { l: 0, r: 0, v: data.template === 'classic' ? 2.5 : 0 };
  const colW = (CW - 10) / 2;
  const textW = colW - decorPad.l - decorPad.r;

  const makeParty = (label: string, name: string, namePh: string, address: string, phone: string, email: string, ids: string[] = []): Party => {
    const lines: Party['lines'] = [];
    const nm = wrap(name.trim() || namePh, textW, 10.5, true);
    nm.forEach((t) => lines.push({ text: t, ph: !name.trim() }));
    const rest = [address.trim(), phone.trim(), email.trim(), ...ids].filter(Boolean).join('\n');
    if (rest) wrap(rest, textW, bodyPt).forEach((t) => lines.push({ text: t }));
    return { label, lines, nameLines: nm.length };
  };
  const tax = (label: string, v?: string) => (v?.trim() ? `${label}: ${v.trim()}` : '');
  const from = makeParty(model.fromLabel, data.businessName, 'Your Business Name', data.businessAddress, data.businessPhone, data.businessEmail, [tax('Tax ID', data.businessTaxId), tax('RC No.', data.businessRegNo)]);
  const to = makeParty(model.toLabel, data.customerName, model.toPlaceholder, data.customerAddress, data.customerPhone, data.customerEmail, [tax('Tax ID', data.customerTaxId)]);

  const partyContentH = (p: Party) => lh(7) + 1.8 + p.nameLines * lh(10.5) + 0.8 + (p.lines.length - p.nameLines) * lh(bodyPt);
  const partyH = Math.max(partyContentH(from), partyContentH(to)) + decorPad.v * 2;
  ensure(partyH + G(7));

  [from, to].forEach((p, i) => {
    const x = ML + i * (colW + 10);
    if (data.template === 'bold') {
      fillRect(x, y, colW, partyH, theme.soft, 2.2);
      fillRect(x, y, 1.2, partyH, theme.accent);
    } else if (data.template === 'classic') {
      hline(x, x + colW, y + 0.125, theme.rule, 0.25);
    }
    const tx = x + decorPad.l;
    let ty = y + decorPad.v;
    putSpaced(p.label.toUpperCase(), tx, ty, { pt: 7, bold: true, color: data.template === 'minimal' ? theme.accent : theme.muted, spacing: 0.14 * 7 * PT });
    ty += lh(7) + 1.8;
    p.lines.forEach((l, idx) => {
      if (idx < p.nameLines) {
        put(l.text, tx, ty, { pt: 10.5, bold: true, color: l.ph ? PLACEHOLDER : theme.ink });
        ty += lh(10.5);
        if (idx === p.nameLines - 1) ty += 0.8;
      } else {
        put(l.text, tx, ty, { pt: bodyPt, color: theme.text });
        ty += lh(bodyPt);
      }
    });
  });
  y += partyH + G(7);

  /* ============================================================ ROUTE (waybills) */

  if (model.route) {
    const placePt = 12;
    const padV = 3.2;
    const padX = data.template === 'classic' ? 0 : 4;
    const placeW = CW / 2 - padX - 12;
    const fromLines = wrap(model.route.from, placeW, placePt, true);
    const toLines = wrap(model.route.to, placeW, placePt, true);
    const nLines = Math.max(fromLines.length, toLines.length);
    const routeH = padV * 2 + lh(7) + 1 + nLines * lh(placePt);
    ensure(routeH + G(7));
    if (data.template === 'classic') {
      hline(ML, ML + CW, y + 0.125, theme.rule, 0.25);
      hline(ML, ML + CW, y + routeH - 0.125, theme.rule, 0.25);
    } else {
      fillRect(ML, y, CW, routeH, theme.soft, 2.5);
    }
    const labelColor = data.template === 'minimal' ? theme.accent : theme.muted;
    putSpaced('FROM', ML + padX, y + padV, { pt: 7, bold: true, color: labelColor, spacing: 0.14 * 7 * PT });
    putSpaced('TO', ML + CW - padX, y + padV, { pt: 7, bold: true, color: labelColor, align: 'right', spacing: 0.14 * 7 * PT });
    fromLines.forEach((t, i) => put(t, ML + padX, y + padV + lh(7) + 1 + i * lh(placePt), { pt: placePt, bold: true, color: theme.ink }));
    toLines.forEach((t, i) => put(t, ML + CW - padX, y + padV + lh(7) + 1 + i * lh(placePt), { pt: placePt, bold: true, color: theme.ink, align: 'right' }));
    // arrow between the two places
    const cx = ML + CW / 2;
    const cy = y + routeH / 2 + 1;
    doc.setDrawColor(...rgb(theme.accent));
    doc.setLineWidth(0.35);
    doc.line(cx - 7, cy, cx + 7, cy);
    doc.line(cx + 4.2, cy - 1.8, cx + 7, cy);
    doc.line(cx + 4.2, cy + 1.8, cx + 7, cy);
    y += routeH + G(7);
  }

  /* ================================================================ ITEMS TABLE */

  const qtyW = 16;
  const priceW = 33;
  const amtW = 36;
  const descW = CW - qtyW - priceW - amtW;
  const minimal = data.template === 'minimal';
  const headPt = minimal ? 7 : 7.5;
  const headColor = data.template === 'bold' ? '#ffffff' : minimal ? theme.muted : theme.ink;
  const HEAD = ['DESCRIPTION', ...model.columns.map((c) => c.toUpperCase())];

  interface RowDraw {
    name: string[];
    details: string[];
    qty: string;
    price: string;
    amt: string;
  }
  const rows: RowDraw[] = data.items.map((_, i) => {
    const cells = itemCells(data, totals, i); // quantity, unit price / unit, amount / weight
    return { name: [], details: [], qty: cells[0], price: cells[1], amt: cells[2] };
  });
  const detPt = 8.5;
  const nameBold = data.template !== 'minimal'; // same rule as the on-screen document

  const colPad = (col: number) => ({
    top: 2.6,
    bottom: 2.6,
    left: minimal && col === 0 ? 0 : 2.5,
    right: minimal && col === 3 ? 0 : 2.5,
  });

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR, top: TOP_CONT, bottom: PAGE_H - BOTTOM },
    tableWidth: CW,
    theme: 'plain',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    head: [['', '', '', '']],
    body: data.items.map(() => ['', '', '', '']),
    styles: {
      font: theme.font,
      fontSize: bodyPt,
      cellPadding: { top: 2.6, bottom: 2.6, left: 2.5, right: 2.5 },
      lineWidth: 0,
      valign: 'top',
      overflow: 'linebreak',
      textColor: rgb(theme.ink),
    },
    headStyles: {
      fontStyle: 'bold',
      fontSize: headPt,
      fillColor: data.template === 'bold' ? rgb(theme.ink) : false,
      cellPadding: { top: 2.4, bottom: 2.4, left: 2.5, right: 2.5 },
    },
    columnStyles: {
      0: { cellWidth: descW, cellPadding: { ...colPad(0), top: 2.5, bottom: 2.5 } },
      1: { cellWidth: qtyW },
      2: { cellWidth: priceW },
      3: { cellWidth: amtW, cellPadding: { ...colPad(3), top: 2.5, bottom: 2.5 } },
    },
    didParseCell: (h: CellHookData) => {
      if (h.section === 'body') {
        if (data.template === 'bold' && h.row.index % 2 === 1) h.cell.styles.fillColor = rgb(theme.soft);
        if (h.column.index === 0) {
          const it = data.items[h.row.index];
          const w = descW - h.cell.padding('left') - h.cell.padding('right');
          const r = rows[h.row.index];
          r.name = wrap(it.description.trim() || 'Item description', w, bodyPt, nameBold);
          r.details = it.details.trim() ? wrap(it.details, w, detPt) : [];
          h.cell.text = new Array(Math.max(1, r.name.length + r.details.length)).fill('');
        }
      }
    },
    didDrawCell: (h: CellHookData) => {
      const c = h.cell;
      const col = h.column.index;
      const padL = c.padding('left');
      const padR = c.padding('right');
      const padT = c.padding('top');
      const left = c.x + padL;
      const right = c.x + c.width - padR;

      if (h.section === 'head') {
        const top = c.y + padT;
        const boxH = headPt * PT * LH;
        const spacing = 0.1 * headPt * PT;
        if (col === 0) putSpaced(HEAD[col], left, top, { pt: headPt, bold: true, color: headColor, spacing, boxH });
        else putSpaced(HEAD[col], right, top, { pt: headPt, bold: true, color: headColor, align: 'right', spacing, boxH });
        if (data.template === 'classic') {
          hline(c.x, c.x + c.width, c.y + 0.2, theme.ink, 0.4);
          hline(c.x, c.x + c.width, c.y + c.height - 0.2, theme.ink, 0.4);
        } else if (minimal) {
          hline(c.x, c.x + c.width, c.y + c.height - 0.15, theme.ink, 0.3);
        }
        return;
      }

      if (h.section === 'body') {
        const r = rows[h.row.index];
        const top = c.y + padT;
        const pitch = lh(bodyPt);
        if (col === 0) {
          r.name.forEach((line, i) =>
            put(line, left, top + i * pitch, { pt: bodyPt, bold: nameBold, color: theme.ink, boxH: pitch }),
          );
          r.details.forEach((line, i) =>
            put(line, left, top + (r.name.length + i) * pitch, { pt: detPt, color: theme.muted, boxH: pitch }),
          );
        } else {
          const text = col === 1 ? r.qty : col === 2 ? r.price : r.amt;
          put(text, right, top, { pt: bodyPt, color: theme.ink, align: 'right', bold: col === 3 && data.template === 'bold', boxH: pitch });
        }
        if (data.template !== 'bold') hline(c.x, c.x + c.width, c.y + c.height - 0.1, theme.rule, 0.2);
      }
    },
    didDrawPage: (h: HookData) => {
      if (h.pageNumber > 1) runningHeader();
    },
  });

  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + G(5);

  /* ============================================================ SUMMARY BLOCK */

  // --- left: payment details
  const payW = CW - 78 - 10;
  const payPadH = data.template === 'minimal' ? 5 : data.template === 'bold' ? 4 : 0;
  const payPadV = data.template === 'minimal' ? 4 : data.template === 'bold' ? 3 : 2.5;
  const payInnerW = payW - payPadH * 2 - (data.template === 'bold' ? 1.2 : 0);
  const valW = payInnerW - 24 - 3;

  interface PayDraw {
    label: string;
    lines: string[];
    strong: boolean;
  }
  let payRows: PayDraw[] = [];
  let payNote: string[] = [];
  let payH = 0;
  if (model.pay) {
    payRows = model.pay.rows.map((r) => ({
      label: r.label,
      lines: wrap(r.value, valW, r.strong ? 11 : bodyPt, true),
      strong: !!r.strong,
    }));
    payNote = model.pay.note ? wrap(model.pay.note, payInnerW, 8.5) : [];
    payH = payPadV * 2 + lh(7) + 1.8;
    payRows.forEach((r) => (payH += Math.max(1, r.lines.length) * lh(r.strong ? 11 : bodyPt) + 1.2));
    if (payNote.length) payH += 1.6 + payNote.length * lh(8.5);
  }

  // --- right: totals
  const TX = ML + CW - 78;
  const TW = 78;
  const rowLayout = (r: SummaryRow): { mt: number; h: number } => {
    if (r.kind === 'row') return { mt: 0, h: 2.6 + lh(bodyPt) };
    if (data.template === 'classic') {
      return r.kind === 'grand' ? { mt: 2, h: 4.8 + lh(13.5) } : { mt: 0, h: 3.5 + lh(11) };
    }
    if (data.template === 'minimal') {
      return r.kind === 'grand' ? { mt: 2, h: 4.3 + lh(18) } : { mt: 0, h: 1.8 + lh(12) };
    }
    return { mt: 2, h: 6.4 + lh(14) };
  };
  let totalsH = 0;
  summary.forEach((r) => {
    const l = rowLayout(r);
    totalsH += l.mt + l.h;
  });

  const summaryH = Math.max(payH, totalsH);
  ensure(summaryH + G(7));

  // payment block
  if (model.pay) {
    const px = ML;
    if (data.template === 'minimal') fillRect(px, y, payW, payH, theme.soft, 2.5);
    else if (data.template === 'bold') {
      fillRect(px, y, payW, payH, theme.soft, 2.2);
      fillRect(px, y, 1.2, payH, theme.accent);
    } else hline(px, px + payW, y + 0.125, theme.rule, 0.25);

    const tx = px + payPadH + (data.template === 'bold' ? 1.2 : 0);
    let ty = y + payPadV;
    putSpaced(model.pay.title.toUpperCase(), tx, ty, { pt: 7, bold: true, color: minimal ? theme.accent : theme.muted, spacing: 0.14 * 7 * PT });
    ty += lh(7) + 1.8;
    payRows.forEach((r) => {
      const pt = r.strong ? 11 : bodyPt;
      put(r.label, tx, ty + 0.6, { pt: bodyPt, color: theme.muted, boxH: lh(pt) });
      r.lines.forEach((line, i) => {
        if (r.strong) putSpaced(line, tx + 27, ty + 0.6 + i * lh(pt), { pt, bold: true, color: theme.ink, spacing: 0.05 * pt * PT, boxH: lh(pt) });
        else put(line, tx + 27, ty + 0.6 + i * lh(pt), { pt, bold: true, color: theme.ink, boxH: lh(pt) });
      });
      ty += Math.max(1, r.lines.length) * lh(pt) + 1.2;
    });
    if (payNote.length) {
      ty += 1.6;
      payNote.forEach((line, i) => put(line, tx, ty + i * lh(8.5), { pt: 8.5, color: theme.muted }));
    }
  }

  // totals block
  let ry = y;
  summary.forEach((r) => {
    const l = rowLayout(r);
    ry += l.mt;
    const amount = r.text !== undefined ? r.text : `${r.negative ? '−' : ''}${money(r.amount)}`;
    const midTop = (pt: number) => ry + (l.h - lh(pt)) / 2;

    if (r.kind === 'row') {
      put(r.label, TX, ry + 1.3, { pt: bodyPt, color: theme.text });
      put(amount, TX + TW, ry + 1.3, { pt: bodyPt, color: theme.ink, align: 'right' });
    } else if (data.template === 'classic') {
      if (r.kind === 'grand') {
        hline(TX, TX + TW, ry + 0.25, theme.ink, 0.5);
        hline(TX, TX + TW, ry + l.h - 0.25, theme.ink, 0.5);
        put(r.label, TX, midTop(12), { pt: 12, bold: true, color: theme.ink });
        put(amount, TX + TW, midTop(13.5), { pt: 13.5, bold: true, color: theme.ink, align: 'right' });
      } else {
        put(r.label, TX, ry + 2.2, { pt: 11, bold: true, color: theme.accent });
        put(amount, TX + TW, ry + 2.2, { pt: 11, bold: true, color: theme.accent, align: 'right' });
      }
    } else if (data.template === 'minimal') {
      if (r.kind === 'grand') {
        hline(TX, TX + TW, ry + 0.125, theme.rule, 0.25);
        const top = ry + 3 + (l.h - 3 - 1.3 - lh(18)) / 2;
        put(r.label, TX, top + (lh(18) - lh(9.5)) / 2, { pt: 9.5, color: theme.muted });
        put(amount, TX + TW, top, { pt: 18, bold: true, color: theme.accent, align: 'right' });
      } else {
        put(r.label, TX, ry + 0.5 + (l.h - 0.5 - 1.3 - lh(12)) / 2 + (lh(12) - lh(bodyPt)) / 2, { pt: bodyPt, bold: true, color: theme.ink });
        put(amount, TX + TW, ry + 0.5, { pt: 12, bold: true, color: theme.ink, align: 'right' });
      }
    } else {
      fillRect(TX, ry, TW, l.h, r.kind === 'balance' ? theme.accent : theme.ink, 2.2);
      put(r.label, TX + 4, midTop(11), { pt: 11, bold: true, color: '#ffffff' });
      put(amount, TX + TW - 4, midTop(14), { pt: 14, bold: true, color: '#ffffff', align: 'right' });
    }
    ry += l.h;
  });

  y += summaryH + G(7);

  /* ================================================================ NOTES + TERMS */

  const blocks: Array<{ label: string; lines: string[] }> = [];
  const single = !(model.notes && model.terms);
  const nW = single ? CW : (CW - 10) / 2;
  if (model.notes) blocks.push({ label: model.notesLabel, lines: wrap(model.notes, nW, 8.8) });
  if (model.terms) blocks.push({ label: 'Terms & conditions', lines: wrap(model.terms, nW, 8.8) });
  if (blocks.length) {
    const nPadV = data.template === 'classic' ? 2.5 : 0;
    const h = Math.max(...blocks.map((b) => lh(7) + 1.8 + b.lines.length * lh(8.8))) + nPadV;
    ensure(h + G(8));
    blocks.forEach((b, i) => {
      const x = ML + i * (nW + 10);
      if (data.template === 'classic') hline(x, x + nW, y + 0.125, theme.rule, 0.25);
      let ty = y + nPadV;
      putSpaced(b.label.toUpperCase(), x, ty, { pt: 7, bold: true, color: theme.muted, spacing: 0.14 * 7 * PT });
      ty += lh(7) + 1.8;
      b.lines.forEach((line, k) => put(line, x, ty + k * lh(8.8), { pt: 8.8, color: theme.text }));
    });
    y += h + G(8);
  }

  if (model.taxInfo) {
    const tl = wrap(model.taxInfo, CW, 8.8);
    const th = lh(7) + 1.8 + tl.length * lh(8.8);
    ensure(th + G(8));
    putSpaced('TAX INFORMATION', ML, y, { pt: 7, bold: true, color: theme.muted, spacing: 0.14 * 7 * PT });
    tl.forEach((line, k) => put(line, ML, y + lh(7) + 1.8 + k * lh(8.8), { pt: 8.8, color: theme.text }));
    y += th + G(8);
  }

  /* Official NRS QR (user-supplied only — never generated by KACHIER) */
  if (data.nrsQrDataUrl?.trim()) {
    const qrSize = 36;
    const qrPng = await loadQrPng(data.nrsQrDataUrl.trim());
    ensure(qrSize + lh(7) + 6);
    putSpaced('NRS QR CODE', ML, y, { pt: 7, bold: true, color: theme.muted, spacing: 0.14 * 7 * PT });
    y += lh(7) + 2;
    if (qrPng) {
      doc.addImage(qrPng, 'PNG', ML, y, qrSize, qrSize);
      y += qrSize + G(8);
    } else {
      put('The QR code image could not be loaded from the link. Please upload the QR image file instead.', ML, y + 4, { pt: 8.8, color: theme.muted });
      y += lh(8.8) + G(8);
    }
  }

  /* ============================================================= SIGNATURE BOXES */

  if (model.signatures.length) {
    const n = model.signatures.length;
    const gap = 8;
    const sw = (CW - gap * (n - 1)) / n;
    const signSpace = compact ? 9 : 13; // blank space to sign in
    const dateSpace = compact ? 4.5 : 7;
    const sigH = lh(7) + signSpace + 1 + lh(7.5) + dateSpace + 1 + lh(7.5);
    ensure(sigH + 3); // the boxes always stay together on one page
    model.signatures.forEach((label, i) => {
      const x = ML + i * (sw + gap);
      let ty = y;
      putSpaced(label.toUpperCase(), x, ty, { pt: 7, bold: true, color: data.template === 'minimal' ? theme.accent : theme.muted, spacing: 0.14 * 7 * PT });
      ty += lh(7) + signSpace;
      hline(x, x + sw, ty, theme.ink, 0.3);
      put('Name & signature', x, ty + 1, { pt: 7.5, color: theme.muted });
      ty += 1 + lh(7.5) + dateSpace;
      hline(x, x + sw, ty, theme.ink, 0.3);
      put('Date', x, ty + 1, { pt: 7.5, color: theme.muted });
    });
    y += sigH + 3;
  }

  /* ===================================================================== FOOTER */

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const fy = PAGE_H - 15;
    hline(ML, ML + CW, fy, theme.rule, 0.2);
    put(model.footer, PAGE_W / 2, fy + 3.2, { pt: 8, color: theme.muted, align: 'center' });
    if (pages > 1) put(`Page ${p} of ${pages}`, ML + CW, fy + 3.2, { pt: 8, color: theme.muted, align: 'right' });
  }

  return { blob: doc.output('blob'), pages: doc.getNumberOfPages() };
}
