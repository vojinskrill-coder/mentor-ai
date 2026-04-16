#!/usr/bin/env node
/**
 * Wireframe Generator for Mentor AI — 4 Screens in App Shell
 * Theme: Dark (#0D0D0D base, #1A1A1A surface, #2A2A2A border, #FAFAFA text, #3B82F6 primary)
 * Grid: 20px snapping, Medium-High fidelity
 */
const fs = require('fs');
const path = require('path');

// === Theme ===
const T = {
  base: '#0D0D0D', surface: '#1A1A1A', elevated: '#242424',
  border: '#2A2A2A', text: '#FAFAFA', muted: '#888888',
  primary: '#3B82F6', primaryBg: '#1E3A5F',
  success: '#22C55E', warning: '#F59E0B', error: '#EF4444'
};

const GRID = 20;
const snap = v => Math.round(v / GRID) * GRID;
const tw = (s, fs) => snap((s.length * fs * 0.6) + 20);

let _seed = 1000;
const seed = () => _seed++;

// === Element Builders ===
function rect(id, x, y, w, h, o = {}) {
  return {
    id, type: 'rectangle',
    x: snap(x), y: snap(y), width: snap(w), height: snap(h),
    angle: 0, strokeColor: o.stroke || T.border,
    backgroundColor: o.bg || 'transparent',
    fillStyle: (o.bg && o.bg !== 'transparent') ? 'solid' : 'hachure',
    strokeWidth: o.sw || 1, roughness: 0, opacity: o.opacity || 100,
    groupIds: o.gids || [], boundElements: o.bound || null,
    roundness: o.r ? { type: 3, value: o.r } : null,
    seed: seed(), version: 1, versionNonce: seed(), isDeleted: false, updated: Date.now()
  };
}

function text(id, x, y, content, fontSize, o = {}) {
  const lines = content.split('\n');
  const longest = lines.reduce((a, b) => a.length > b.length ? a : b, '');
  return {
    id, type: 'text',
    x: snap(x), y: snap(y),
    width: tw(longest, fontSize),
    height: snap(lines.length * fontSize * 1.25),
    angle: 0, strokeColor: o.color || T.text, backgroundColor: 'transparent',
    fillStyle: 'solid', strokeWidth: 1, roughness: 0, opacity: 100,
    text: content, fontSize, fontFamily: 1,
    textAlign: o.align || 'left', verticalAlign: o.valign || 'top',
    containerId: o.cid || null, groupIds: o.gids || [],
    boundElements: null,
    seed: seed(), version: 1, versionNonce: seed(), isDeleted: false, updated: Date.now()
  };
}

function labeled(pfx, x, y, w, h, label, fs, o = {}) {
  const sid = pfx + '-s', tid = pfx + '-t', gid = pfx + '-g';
  const parentGids = o.pgids || [];
  const shape = rect(sid, x, y, w, h, {
    ...o, gids: [gid, ...parentGids],
    bound: [{ type: 'text', id: tid }]
  });
  const txt = text(tid, snap(x + (w - tw(label, fs)) / 2), snap(y + (h - fs * 1.25) / 2),
    label, fs, {
      align: 'center', valign: 'middle', cid: sid,
      gids: [gid, ...parentGids], color: o.textColor || T.text
    });
  return [shape, txt];
}

// === App Shell (reused per screen) ===
function shell(si, ox, oy, activeIdx) {
  const p = `sh${si}`, els = [];

  // Frame
  els.push(rect(`${p}-frame`, ox, oy, 1200, 900, { stroke: T.border, sw: 2 }));
  // TopBar
  els.push(rect(`${p}-top`, ox, oy, 1200, 60, { bg: T.surface, stroke: T.border }));
  // Logo
  els.push(text(`${p}-logo`, ox + 20, oy + 16, 'Mentor AI', 20, { color: T.primary }));
  // Avatar placeholder
  els.push(rect(`${p}-avatar`, ox + 1140, oy + 12, 40, 40, { bg: T.elevated, stroke: T.border, r: 20 }));
  // Sidebar
  els.push(rect(`${p}-side`, ox, oy + 60, 220, 840, { bg: T.surface, stroke: T.border }));

  // Nav items
  const nav = ['Dashboard', 'Zadaci', 'Caskanje', 'Memorija', 'Mozak', 'Koncepti', 'Podesavanja'];
  nav.forEach((item, i) => {
    const ny = oy + 80 + i * 48;
    if (i === activeIdx) {
      els.push(rect(`${p}-nav-hi`, ox + 8, ny - 4, 204, 40, { bg: T.primaryBg, stroke: T.primary, r: 8 }));
    }
    els.push(text(`${p}-nav${i}`, ox + 24, ny + 2, item, 15, {
      color: i === activeIdx ? T.primary : T.muted
    }));
  });

  // Divider below nav
  els.push(rect(`${p}-divider`, ox + 16, oy + 420, 188, 1, { stroke: T.border }));

  return els;
}

// === SCREEN 1: Dashboard ===
function screen1() {
  const ox = 0, oy = 0, els = [];
  const cx = ox + 240, cy = oy + 80;

  els.push(text('s1-lbl', ox + 400, oy - 40, '1. Dashboard - Komandna Tabla', 18, { color: T.muted }));
  els.push(...shell(1, ox, oy, 0));

  // Title
  els.push(text('s1-title', cx, cy, 'Komandna Tabla', 24));
  els.push(text('s1-sub', cx, cy + 40, 'Pregled vaseg poslovanja', 14, { color: T.muted }));

  // Metric Cards (4)
  const metrics = [
    { lbl: 'Aktivni Zadaci', val: '12', c: T.primary },
    { lbl: 'Zavrseno', val: '47', c: T.success },
    { lbl: 'Agent Poslovi', val: '3', c: T.warning },
    { lbl: 'Koncepti', val: '548', c: T.primary }
  ];
  metrics.forEach((m, i) => {
    const mx = cx + i * 220, my = cy + 80, g = `s1-m${i}-g`;
    els.push(rect(`s1-m${i}`, mx, my, 200, 100, { bg: T.surface, stroke: T.border, r: 8, gids: [g] }));
    els.push(text(`s1-m${i}-l`, mx + 16, my + 16, m.lbl, 12, { color: T.muted, gids: [g] }));
    els.push(text(`s1-m${i}-v`, mx + 16, my + 48, m.val, 32, { color: m.c, gids: [g] }));
  });

  // Activity Feed
  const ay = cy + 220;
  els.push(text('s1-ah', cx, ay, 'Nedavna Aktivnost', 18));
  els.push(rect('s1-abox', cx, ay + 40, 880, 260, { bg: T.surface, stroke: T.border, r: 8 }));
  const acts = [
    'Zavrsen zadatak: Analiza trzista za Q2',
    'Agent posao pokrenut: Finansijski pregled',
    'Nova memorija sacuvana: Strategija rasta',
    'Koncept istrazen: Digitalni Marketing'
  ];
  acts.forEach((a, i) => {
    els.push(text(`s1-a${i}`, cx + 20, ay + 60 + i * 52, a, 14, {
      color: i === 0 ? T.text : T.muted
    }));
    if (i < 3) els.push(rect(`s1-adiv${i}`, cx + 20, ay + 92 + i * 52, 840, 1, { stroke: T.border }));
  });

  // Quick Actions
  const qy = cy + 560;
  els.push(text('s1-qh', cx, qy, 'Brze Akcije', 18));
  const btns = ['Novi Zadatak', 'Pokreni Agenta', 'Novo Caskanje'];
  btns.forEach((b, i) => {
    els.push(...labeled(`s1-b${i}`, cx + i * 180, qy + 40, 160, 40, b, 14, {
      bg: i === 0 ? T.primary : T.elevated,
      stroke: i === 0 ? T.primary : T.border, r: 8
    }));
  });

  return els;
}

// === SCREEN 2: Task Hub ===
function screen2() {
  const ox = 1500, oy = 0, els = [];
  const cx = ox + 240, cy = oy + 80;

  els.push(text('s2-lbl', ox + 400, oy - 40, '2. Centar Zadataka - Task Hub', 18, { color: T.muted }));
  els.push(...shell(2, ox, oy, 1));

  els.push(text('s2-title', cx, cy, 'Centar Zadataka', 24));

  // Filter bar
  els.push(rect('s2-fbar', cx, cy + 40, 880, 48, { bg: T.surface, stroke: T.border, r: 8 }));
  ['Svi', 'Aktivni', 'Zavrseni', 'Na cekanju'].forEach((f, i) => {
    els.push(...labeled(`s2-f${i}`, cx + 12 + i * 120, cy + 48, 100, 32, f, 12, {
      bg: i === 0 ? T.primary : 'transparent',
      stroke: i === 0 ? T.primary : T.border, r: 16
    }));
  });

  // Domain: Prodaja
  const d1y = cy + 120;
  els.push(text('s2-d1', cx, d1y, 'Prodaja', 16, { color: T.primary }));
  els.push(rect('s2-d1line', cx, d1y + 28, 880, 1, { stroke: T.primary }));

  const tasks1 = [
    { t: 'Prodajni plan za Q2', sc: '8.5', st: 'Aktivan', stc: T.success },
    { t: 'Analiza konkurencije', sc: '7.2', st: 'Zavrsen', stc: T.muted }
  ];
  tasks1.forEach((tk, i) => {
    const ty = d1y + 40 + i * 80, g = `s2-t1${i}-g`;
    els.push(rect(`s2-t1${i}`, cx, ty, 880, 64, { bg: T.surface, stroke: T.border, r: 8, gids: [g] }));
    els.push(text(`s2-t1${i}-t`, cx + 16, ty + 12, tk.t, 15, { gids: [g] }));
    els.push(text(`s2-t1${i}-s`, cx + 16, ty + 36, tk.st, 12, { color: tk.stc, gids: [g] }));
    els.push(text(`s2-t1${i}-sc`, cx + 780, ty + 20, tk.sc, 18, { color: T.warning, gids: [g] }));
  });

  // Domain: Marketing
  const d2y = d1y + 200;
  els.push(text('s2-d2', cx, d2y, 'Marketing', 16, { color: T.primary }));
  els.push(rect('s2-d2line', cx, d2y + 28, 880, 1, { stroke: T.primary }));

  const tasks2 = [
    { t: 'Digitalna strategija', sc: '6.8', st: 'Na cekanju', stc: T.warning },
    { t: 'Brendiranje proizvoda', sc: '--', st: 'Novi', stc: T.primary }
  ];
  tasks2.forEach((tk, i) => {
    const ty = d2y + 40 + i * 80, g = `s2-t2${i}-g`;
    els.push(rect(`s2-t2${i}`, cx, ty, 880, 64, { bg: T.surface, stroke: T.border, r: 8, gids: [g] }));
    els.push(text(`s2-t2${i}-t`, cx + 16, ty + 12, tk.t, 15, { gids: [g] }));
    els.push(text(`s2-t2${i}-s`, cx + 16, ty + 36, tk.st, 12, { color: tk.stc, gids: [g] }));
    els.push(text(`s2-t2${i}-sc`, cx + 780, ty + 20, tk.sc, 18, { color: T.warning, gids: [g] }));
  });

  // Domain: Finansije
  const d3y = d2y + 200;
  els.push(text('s2-d3', cx, d3y, 'Finansije', 16, { color: T.primary }));
  els.push(rect('s2-d3line', cx, d3y + 28, 880, 1, { stroke: T.primary }));

  const tasks3 = [
    { t: 'Cash flow projekcija', sc: '9.1', st: 'Zavrsen', stc: T.muted },
  ];
  tasks3.forEach((tk, i) => {
    const ty = d3y + 40 + i * 80, g = `s2-t3${i}-g`;
    els.push(rect(`s2-t3${i}`, cx, ty, 880, 64, { bg: T.surface, stroke: T.border, r: 8, gids: [g] }));
    els.push(text(`s2-t3${i}-t`, cx + 16, ty + 12, tk.t, 15, { gids: [g] }));
    els.push(text(`s2-t3${i}-s`, cx + 16, ty + 36, tk.st, 12, { color: tk.stc, gids: [g] }));
    els.push(text(`s2-t3${i}-sc`, cx + 780, ty + 20, tk.sc, 18, { color: T.warning, gids: [g] }));
  });

  // Floating action button
  els.push(rect('s2-fab', ox + 1100, oy + 800, 60, 60, { bg: T.primary, stroke: T.primary, r: 30 }));
  els.push(text('s2-fab-t', ox + 1118, oy + 812, '+', 28, { color: T.text }));

  return els;
}

// === SCREEN 3: Chat ===
function screen3() {
  const ox = 0, oy = 1200, els = [];
  const cx = ox + 240, cy = oy + 80;

  els.push(text('s3-lbl', ox + 400, oy - 40, '3. Caskanje - Chat', 18, { color: T.muted }));
  els.push(...shell(3, ox, oy, 2));

  // Chat header bar
  els.push(rect('s3-chdr', cx, cy, 940, 48, { bg: T.surface, stroke: T.border }));
  els.push(text('s3-chdr-t', cx + 16, cy + 12, 'Prodajni plan za Q2', 16));
  els.push(text('s3-chdr-tag', cx + 760, cy + 14, 'Prodaja', 12, { color: T.primary }));

  // Messages area
  els.push(rect('s3-msgs', cx, cy + 48, 940, 640, { bg: T.base, stroke: T.border }));

  // AI message 1
  const m1y = cy + 68;
  els.push(rect('s3-ai1', cx + 20, m1y, 600, 80, { bg: T.surface, stroke: T.border, r: 12 }));
  els.push(text('s3-ai1-name', cx + 40, m1y + 8, 'Mentor AI', 12, { color: T.primary }));
  els.push(text('s3-ai1-msg', cx + 40, m1y + 32, 'Hajde da analiziramo vas prodajni\nplan za Q2. Koji su kljucni ciljevi?', 14));

  // User message
  const m2y = m1y + 120;
  els.push(rect('s3-usr1', cx + 320, m2y, 600, 60, { bg: T.primaryBg, stroke: T.primary, r: 12 }));
  els.push(text('s3-usr1-msg', cx + 340, m2y + 16, 'Fokusiraj se na digitalne kanale prodaje.', 14));

  // AI message 2 with concept citation
  const m3y = m2y + 100;
  els.push(rect('s3-ai2', cx + 20, m3y, 600, 140, { bg: T.surface, stroke: T.border, r: 12 }));
  els.push(text('s3-ai2-name', cx + 40, m3y + 8, 'Mentor AI', 12, { color: T.primary }));
  els.push(text('s3-ai2-msg', cx + 40, m3y + 32, 'Na osnovu koncepta "Digitalni Marketing",\npreporucujem sledece korake:\n1. SEO optimizacija sajta\n2. Content marketing strategija\n3. Analiza konverzionog levka', 14));

  // Concept citation tag
  els.push(...labeled('s3-cite', cx + 40, m3y + 148, 180, 28, 'Digitalni Marketing', 12, {
    bg: T.elevated, stroke: T.primary, r: 14, textColor: T.primary
  }));

  // Typing indicator
  els.push(rect('s3-typing', cx + 20, m3y + 200, 120, 36, { bg: T.surface, stroke: T.border, r: 12 }));
  els.push(text('s3-typing-d', cx + 40, m3y + 208, '...', 16, { color: T.muted }));

  // Input bar
  const iy = cy + 700;
  els.push(rect('s3-ibar', cx, iy, 940, 60, { bg: T.surface, stroke: T.border }));
  els.push(rect('s3-input', cx + 16, iy + 10, 780, 40, { bg: T.elevated, stroke: T.border, r: 20 }));
  els.push(text('s3-iph', cx + 40, iy + 18, 'Unesite poruku...', 14, { color: T.muted }));
  els.push(...labeled('s3-send', cx + 816, iy + 10, 100, 40, 'Posalji', 14, {
    bg: T.primary, stroke: T.primary, r: 20
  }));

  return els;
}

// === SCREEN 4: Memory ===
function screen4() {
  const ox = 1500, oy = 1200, els = [];
  const cx = ox + 240, cy = oy + 80;

  els.push(text('s4-lbl', ox + 400, oy - 40, '4. Memorija - Poslovna Memorija', 18, { color: T.muted }));
  els.push(...shell(4, ox, oy, 3));

  els.push(text('s4-title', cx, cy, 'Poslovna Memorija', 24));
  els.push(text('s4-sub', cx, cy + 40, 'Kljucni uvidi i odluke vaseg poslovanja', 14, { color: T.muted }));

  // Search
  els.push(rect('s4-search', cx, cy + 80, 880, 40, { bg: T.surface, stroke: T.border, r: 20 }));
  els.push(text('s4-search-ph', cx + 20, cy + 88, 'Pretrazite memorije...', 14, { color: T.muted }));

  // Stats bar
  els.push(rect('s4-stats', cx, cy + 140, 880, 40, { bg: T.elevated, stroke: T.border, r: 8 }));
  els.push(text('s4-stats-t', cx + 20, cy + 148, 'Ukupno: 23  |  Prosecna dubina: 2.8  |  Kategorija: 8', 12, { color: T.muted }));

  // Memory cards
  const mems = [
    { title: 'Strategija rasta za 2026', depth: 3, date: '07.03.2026', cat: 'Stratesko Planiranje', excerpt: 'Fokus na digitalne kanale, ekspanzija na regionalno trziste...' },
    { title: 'Ciljne grupe - B2B segment', depth: 2, date: '06.03.2026', cat: 'Marketing', excerpt: 'Identifikovane tri kljucne persone: CTO, CFO, COO malih preduzeca...' },
    { title: 'Cash flow projekcija Q2', depth: 4, date: '05.03.2026', cat: 'Finansije', excerpt: 'Projekcija pokazuje pozitivan tok od aprila, sa rizikom u maju...' },
    { title: 'Tim struktura i uloge', depth: 1, date: '04.03.2026', cat: 'Operacije', excerpt: 'Potreba za 2 nova clana tima: frontend developer i marketing...' }
  ];

  mems.forEach((m, i) => {
    const my = cy + 200 + i * 140, g = `s4-mc${i}-g`;

    // Card
    els.push(rect(`s4-mc${i}`, cx, my, 880, 120, { bg: T.surface, stroke: T.border, r: 8, gids: [g] }));

    // Depth indicator (colored left bar)
    const depthColors = [T.muted, T.success, T.primary, T.warning, T.error];
    els.push(rect(`s4-mc${i}-dbar`, cx, my, 6, 120, {
      bg: depthColors[m.depth] || T.primary, stroke: depthColors[m.depth] || T.primary,
      gids: [g]
    }));

    // Title
    els.push(text(`s4-mc${i}-t`, cx + 24, my + 12, m.title, 16, { gids: [g] }));

    // Category tag
    els.push(rect(`s4-mc${i}-tag`, cx + 24, my + 44, tw(m.cat, 11) + 16, 24, {
      bg: T.elevated, stroke: T.border, r: 12, gids: [g]
    }));
    els.push(text(`s4-mc${i}-cat`, cx + 32, my + 48, m.cat, 11, { color: T.primary, gids: [g] }));

    // Excerpt
    els.push(text(`s4-mc${i}-ex`, cx + 24, my + 80, m.excerpt, 12, { color: T.muted, gids: [g] }));

    // Date + depth on right
    els.push(text(`s4-mc${i}-date`, cx + 740, my + 12, m.date, 12, { color: T.muted, gids: [g] }));
    els.push(text(`s4-mc${i}-depth`, cx + 740, my + 36, `Dubina: ${m.depth}`, 12, {
      color: depthColors[m.depth] || T.primary, gids: [g]
    }));
  });

  return els;
}

// === Assemble & Write ===
const elements = [...screen1(), ...screen2(), ...screen3(), ...screen4()];

const excalidraw = {
  type: 'excalidraw',
  version: 2,
  source: 'bmad-wireframe-workflow',
  elements,
  appState: {
    viewBackgroundColor: T.base,
    gridSize: 20,
    currentItemStrokeColor: T.text,
    currentItemBackgroundColor: T.surface
  },
  files: {}
};

const outPath = path.join(__dirname, 'wireframe-2026-03-07.excalidraw');
fs.writeFileSync(outPath, JSON.stringify(excalidraw, null, 2));
console.log(`Done! ${elements.length} elements across 4 screens.`);
console.log(`Output: ${outPath}`);
