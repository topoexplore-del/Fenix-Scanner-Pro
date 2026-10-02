#!/usr/bin/env node
/*
 * FENIX SCANNER PRO — COMBOS y WIN%DIA (proceso de cada actualización)
 * ------------------------------------------------------------------
 * Con el listado completo de la sesión (data/listado.json, más de 9.000
 * tickets) hace, sin tocar ningún archivo existente:
 *
 *   1. Parámetros de todas las pestañas para CADA ticket (fenix_combos.js →
 *      fenix_params.js: las mismas fórmulas del dashboard y del Excel).
 *   2. Qué combos (3, 11, 12, 14, 15, 16) cumple cada ticket HOY
 *      → data/combos_estado.json (se evalúan con el rendimiento de mañana).
 *   3. Con los combos que cada ticket cumplía en la SESIÓN ANTERIOR
 *      (data/combos_estado_prev.json) y el % diario de hoy: estadísticas por
 *      combo, indicador de calidad, combo destacado, coincidencias y
 *      condiciones → data/combos_dia.json.
 *   4. Un registro por sesión en data/combos_historial.json y los tickets de
 *      cada combo de las últimas 60 sesiones en data/combos_detalle.json.
 *
 * Uso: node scripts/combos.js [--sin-red] [--sin-git] [--rellenar N]
 *   --sin-red     no descarga velas de 5 min ni trae historial del servidor (usa el git local)
 *   --sin-git     no busca la sesión anterior en el historial git
 *   --rellenar N  reconstruye hasta N sesiones anteriores desde el historial git
 *
 * Nunca hace fallar la actualización: si algo sale mal, lo dice y termina bien.
 */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const BASE = path.dirname(__dirname);
const DATA = path.join(BASE, "data");
const C = require(path.join(BASE, "fenix_combos.js"));
const F = require(path.join(BASE, "fenix_params.js"));

const args = process.argv.slice(2);
const flag = k => args.includes(k);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const SIN_RED = flag("--sin-red"), SIN_GIT = flag("--sin-git");
const RELLENAR = parseInt(arg("--rellenar", "0"), 10) || 0;
const MAX_DETALLE = 60;          // sesiones con el detalle de tickets por combo
const COHERENCIA_MIN = 0.80;     // parte de los tickets cuyo cierre anterior cuadra con el % diario

const P = n => path.join(DATA, n);
function load(file, def) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return def; } }
function save(file, obj) { fs.writeFileSync(file, JSON.stringify(obj)); }
const r4 = v => (v === null || v === undefined || !isFinite(v)) ? null : Math.round(v * 10000) / 10000;
const ahora = () => new Date().toISOString().slice(0, 19) + "Z";

// ── Calendario (solo para decir qué sesión se esperaba; la prueba real es la coherencia de precios) ──
const FESTIVOS = new Set(["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03",
  "2026-09-07", "2026-11-26", "2026-12-25", "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"]);
function sesionAnterior(s) {
  const d = new Date(s + "T12:00:00Z");
  do { d.setUTCDate(d.getUTCDate() - 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6 || FESTIVOS.has(d.toISOString().slice(0, 10)));
  return d.toISOString().slice(0, 10);
}

// ── Filas del listado como objetos ──
function filasListado(L) {
  if (!L || !Array.isArray(L.rows) || !Array.isArray(L.cols)) return [];
  return L.rows.map(a => { const o = { _origen: "L" }; for (let i = 0; i < L.cols.length; i++) o[L.cols[i]] = a[i]; return o; });
}
// ── Filas de tus grupos (snapshot): una por ticker, la primera, como getAllStocks del dashboard ──
function filasGrupos(snap) {
  const out = [], vistos = new Set();
  Object.entries((snap && snap.groups) || {}).forEach(([g, rows]) => (rows || []).forEach(r => {
    if (!r || vistos.has(r.ticker)) return;
    vistos.add(r.ticker); out.push(Object.assign({ _origen: "G", _grupo: g }, r));
  }));
  return out;
}
// Universo de una sesión = tus grupos + el listado completo (el listado no repite los tickets de tus grupos).
// Cada fuente entra solo si es de esa sesión.
function universoDe(snap, L) {
  const S = (snap && snap.session_ref && Object.keys(snap.groups || {}).length) ? snap.session_ref : (L && L.session_ref) || null;
  const g = snap && snap.session_ref === S ? filasGrupos(snap) : [];
  const l = L && L.session_ref === S ? filasListado(L) : [];
  return { sesion: S, filas: g.concat(l), grupos: g.length, listado: l.length,
           listado_built_at: (L && L.session_ref === S && L.built_at) || null,
           parcial: !(g.length && l.length), falta: !l.length ? "el listado completo" : !g.length ? "tus grupos" : null };
}
// Promedio de ROE por sector de tus grupos (lo que usa la pestaña Analysis)
function secRoeDe(snap) {
  const idx = {};
  Object.values((snap && snap.groups) || {}).forEach(rows => (rows || []).forEach(r => { if (!(r.ticker in idx)) idx[r.ticker] = r; }));
  return F.sectorRoeAvgs(Object.values(idx));
}
// Entradas de las señales anteriores a la sesión (anti-repetición) y señales del día
function alertasDe(hist, sesion) {
  const previas = {}, hoy = {};
  ((hist && hist.alerts) || []).forEach(a => {
    const d = a.asof || (a.alerted_at || "").slice(0, 10);
    if (!d || a.entry == null) return;
    if (d < sesion) (previas[a.ticker] = previas[a.ticker] || []).push(a.entry);
    else if (d === sesion) hoy[a.ticker] = true;
  });
  return { previas, hoy };
}

// ── Velas de 5 minutos (combo 15): solo para quien ya cumple el resto del combo ──
function ema5(sesion, tickers, etiqueta, file) {
  file = file || P("combos_ema5.json");
  let E = load(file, null);
  if (!E || E.sesion !== sesion) E = { sesion, rows: {} };
  const faltan = tickers.filter(t => !(t in (E.rows || {})) && !((E.sin_dato || []).includes(t)));
  if (faltan.length && !SIN_RED) {
    const cache = path.join(BASE, "cache");
    try { fs.mkdirSync(cache, { recursive: true }); } catch (e) {}
    const ped = path.join(cache, "combos_pedidos.json");
    save(ped, { sesion, tickers: faltan });
    console.log(`  Velas de 5 min (${etiqueta}): ${faltan.length} tickets cumplen Laplace avoid + Markov Bullish`);
    const pyArgs = [path.join(BASE, "scripts", "combos_ema5.py"), "--sesion", sesion, "--pedidos", ped, "--salida", file];
    let r = null;
    for (const py of (process.env.PYTHON ? [process.env.PYTHON] : ["python", "python3"])) {
      r = cp.spawnSync(py, pyArgs, { stdio: "inherit", timeout: 25 * 60 * 1000 });
      if (!r.error) break;
    }
    if (r && r.error) console.log(`  ⚠️ no se pudo ejecutar combos_ema5.py: ${r.error.message}`);
    const E2 = load(file, null);
    if (E2 && E2.sesion === sesion) E = E2;
  }
  return { rows: E.rows || {}, pedidos: tickers.length, con_dato: tickers.filter(t => t in (E.rows || {})).length, bloqueado: !!E.bloqueado };
}

// ── Estado de una sesión: parámetros y combos de cada ticket ──
function construirEstado(U, ctxBase, conEma5, etiqueta, archivoEma5) {
  const sesion = U.sesion;
  const filas = U.filas;
  const al = alertasDe(ctxBase.hist, sesion);
  const ctx = { universe: ctxBase.universe, secRoe: ctxBase.secRoe, previas: al.previas, alertasHoy: al.hoy, sesion, ema5: {} };
  // 1.ª pasada: quién necesita velas de 5 min
  const pedir = [];
  filas.forEach(r => {
    if (r.close == null || r.stale || r.asof !== sesion) return;
    const lp = F.laplace(r), mk = F.markov(r);
    if (String(lp.signal).toLowerCase() === "avoid" && mk.stateName === "BULLISH") pedir.push(r.ticker);
  });
  let e5 = { rows: {}, pedidos: pedir.length, con_dato: 0, bloqueado: false };
  if (conEma5) { e5 = ema5(sesion, pedir, etiqueta, archivoEma5); ctx.ema5 = e5.rows; }
  // 2.ª pasada: registro completo
  const vistos = new Set(), objs = [];
  let dup = 0, sinPrecio = 0;
  filas.forEach(r => {
    if (vistos.has(r.ticker)) { dup++; return; }
    vistos.add(r.ticker);
    if (r.close == null || r.score == null) { sinPrecio++; return; }
    objs.push(C.registro(r, ctx));
  });
  const porCombo = {};
  C.COMBOS.forEach(c => {
    porCombo[c.id] = { cumplen: objs.filter(o => !o.stale && (o.m & c.bit)).length,
                       no_evaluables: objs.filter(o => !o.stale && (o.ne & c.bit)).length };
  });
  return {
    version: C.VERSION, sesion, built_at: ahora(), listado_built_at: U.listado_built_at, cols: C.EST_COLS,
    resumen: { filas: filas.length, de_grupos: U.grupos, de_listado: U.listado, parcial: U.parcial, falta: U.falta,
      tickets: objs.length, duplicados: dup, sin_precio: sinPrecio,
      con_vela: objs.filter(o => !o.stale).length, sin_vela: objs.filter(o => o.stale).length,
      con_ficha: objs.filter(o => o.ficha).length, acciones_sin_ficha: objs.filter(o => !o.ficha && !o.etf).length,
      etf: objs.filter(o => o.etf).length,
      ema5: { pedidos: e5.pedidos, con_dato: e5.con_dato, bloqueado: e5.bloqueado, calculado: !!conEma5 && !SIN_RED },
      por_combo: porCombo },
    rows: objs.map(C.filaEstado)
  };
}
const objetos = E => E.rows.map(f => C.objetoEstado(E.cols, f));

// Si el estado de la sesión anterior se guardó sin velas de 5 min (por ejemplo, el
// de arranque), se piden ahora para esa sesión y se recalculan sus combos.
function completarEma5(prev) {
  if (SIN_RED || !prev || !prev.resumen || !prev.resumen.ema5) return prev;
  const e0 = prev.resumen.ema5;
  if (e0.calculado && (e0.con_dato > 0 || !e0.pedidos) && !e0.bloqueado) return prev;
  const objs = objetos(prev);
  const pedir = objs.filter(o => !o.stale && o.m5_20 === null && C.necesitaEma5(o)).map(o => o.ticker);
  if (!pedir.length) return prev;
  const e5 = ema5(prev.sesion, pedir, "sesión anterior " + prev.sesion, emaPasada(prev.sesion));
  if (!e5.con_dato) return prev;
  objs.forEach(o => {
    const e = e5.rows[o.ticker];
    if (!e) return;
    const dec = e[2] >= 1 ? 2 : 4, k = Math.pow(10, dec);
    o.m5_20 = Math.round((e[0] - e[2]) * k) / k; o.m5_200 = Math.round((e[1] - e[2]) * k) / k;
    const mk = C.mascaras(C.aParametros(o)); o.m = mk.m; o.ne = mk.ne;
  });
  prev.rows = objs.map(C.filaEstado);
  prev.resumen.ema5 = { pedidos: pedir.length, con_dato: e5.con_dato, bloqueado: e5.bloqueado, calculado: true };
  C.COMBOS.forEach(c => { prev.resumen.por_combo[c.id] = { cumplen: objs.filter(o => !o.stale && (o.m & c.bit)).length,
                                                           no_evaluables: objs.filter(o => !o.stale && (o.ne & c.bit)).length }; });
  return prev;
}

// ── Evaluación: combos de la sesión anterior × % diario de hoy ──
function evaluar(prev, cur) {
  const pm = new Map(); objetos(prev).forEach(o => pm.set(o.ticker, o));
  const items = [], inc = [];
  const u = { filas: cur.rows.length, evaluados: 0, sin_vela_hoy: 0, sin_vela_prev: 0, nuevos: 0, sin_dato: 0 };
  let coh = 0, cohN = 0;
  objetos(cur).forEach(o => {
    const p = pm.get(o.ticker);
    if (o.stale) { u.sin_vela_hoy++; return; }
    if (!p) { u.nuevos++; return; }
    if (p.stale) { u.sin_vela_prev++; return; }
    if (typeof o.daily !== "number" || !isFinite(o.daily)) { u.sin_dato++; return; }
    // ¿El cierre guardado ayer es el cierre anterior que implica el % diario de hoy?
    if (o.daily > -99) {
      const impl = o.close / (1 + o.daily / 100), tol = Math.max(0.011, 0.006 * p.close);
      cohN++; if (Math.abs(impl - p.close) <= tol) coh++; else inc.push(o.ticker);
    }
    items.push({ t: o.ticker, ret: o.daily, m: p.m, ne: p.ne, mh: o.m, neh: o.ne, o: p });
  });
  u.evaluados = items.length;
  const hoy = new Set(cur.rows.map(f => f[0]));
  u.desaparecidos = [...pm.keys()].filter(t => !hoy.has(t)).length;
  u.coherencia = cohN ? coh / cohN : null;
  u.incoherentes = inc.length;
  return { items, universo: u, incoherentes: inc };
}

function resumenCombo(e) {
  if (!e.n) return { n: 0, no_evaluables: e.no_evaluables || 0 };
  const q = e.calidad || {};
  return { n: e.n, pos: e.pos, neg: e.neg, neu: e.neu, pct_pos: r4(e.pct_pos), pct_neg: r4(e.pct_neg),
    media: r4(e.media), mediana: r4(e.mediana), suma: r4(e.suma), mejor: r4(e.mejor), peor: r4(e.peor),
    desv: r4(e.desv), iqr: r4(e.iqr), p25: r4(e.p25), p75: r4(e.p75),
    extremos: e.extremos, media_sin_ext: r4(e.media_sin_ext), suma_sin_ext: r4(e.suma_sin_ext),
    gan_media: r4(e.gan_media), per_media: r4(e.per_media), payoff: r4(e.payoff),
    ic_lo: r4(e.ic_lo), ic_hi: r4(e.ic_hi), frecuencia: r4(e.frecuencia),
    ventaja_pos: r4(e.ventaja_pos), ventaja_mediana: r4(e.ventaja_mediana), ventaja_media: r4(e.ventaja_media),
    supera_mediana: r4(e.supera_mediana), z: r4(e.z), p_valor: r4(e.p_valor),
    nota: r4(q.nota), fiabilidad: r4(q.fiabilidad), califica: !!q.califica, nivel: q.nivel || null,
    azar: q.azar ? [r4(q.azar[0]), r4(q.azar[1])] : null,
    notas: q.notas ? { tasa: r4(q.notas.tasa), rendimiento: r4(q.notas.rendimiento), consistencia: r4(q.notas.consistencia), robustez: r4(q.notas.robustez) } : null,
    no_evaluables: e.no_evaluables || 0 };
}
function resumenBase(B, u) {
  return Object.assign({ evaluados: B.n, pos: B.pos, neg: B.neg, neu: B.neu, pct_pos: r4(B.pct_pos), pct_neg: r4(B.pct_neg),
    media: r4(B.media), mediana: r4(B.mediana), p25: r4(B.p25), p75: r4(B.p75), p01: r4(B.p01), p99: r4(B.p99),
    desv: r4(B.desv), mejor: r4(B.mejor), peor: r4(B.peor) }, u);
}

// Resultado completo de una sesión a partir de los dos estados
function resultadoSesion(prev, cur) {
  const ev = evaluar(prev, cur);
  const u = ev.universo;
  const esperada = sesionAnterior(cur.sesion);
  const out = { version: C.VERSION, sesion: cur.sesion, sesion_prev: prev.sesion, sesion_prev_esperada: esperada, built_at: ahora(),
    lectura: "Combos que cada ticket cumplía al cierre de la sesión anterior, medidos con el % diario de esta sesión" };
  if (u.coherencia === null || u.coherencia < COHERENCIA_MIN || ev.items.length < 100 || prev.version !== cur.version) {
    out.valido = false;
    out.motivo = prev.version !== cur.version ? "el estado guardado es de otra versión del motor"
      : ev.items.length < 100 ? `solo ${ev.items.length} tickets con datos en las dos sesiones`
      : `la sesión guardada (${prev.sesion}) no es la anterior a ${cur.sesion}: el cierre anterior solo cuadra en el ${(u.coherencia * 100).toFixed(0)} % de los tickets`;
    out.universo = u;
    return { dia: out, registro: null, items: [] };
  }
  out.valido = true;
  out.parcial = !!(prev.resumen.parcial || cur.resumen.parcial);
  if (out.parcial) out.aviso_parcial = "Universo parcial: " + (cur.resumen.parcial ? "hoy faltó " + cur.resumen.falta : "en la sesión anterior faltó " + prev.resumen.falta) + ". Solo se evalúan los tickets presentes en las dos sesiones.";
  if (prev.sesion !== esperada) out.aviso_calendario = `la sesión anterior guardada es ${prev.sesion} y el calendario esperaba ${esperada}; los precios cuadran, se evalúa`;
  const T = C.tablaCombos(ev.items);
  const TH = C.tablaCombos(ev.items.map(x => ({ t: x.t, ret: x.ret, m: x.mh, ne: x.neh })));
  const co = C.coincidencias(ev.items);
  const cd = C.condiciones(ev.items);
  out.universo = resumenBase(T.base, u);
  out.combos = {}; T.combos.forEach(e => { out.combos[e.id] = resumenCombo(e); });
  out.mismo_dia = {}; TH.combos.forEach(e => { out.mismo_dia[e.id] = resumenCombo(e); });
  out.mismo_dia_destacado = TH.destacado;
  out.destacado = T.destacado;
  out.avisos = T.avisos;
  out.coincidencias = co;
  out.condiciones = { base: cd.base, probadas: cd.probadas, pares_probados: cd.pares_probados,
    tabla: cd.condiciones.map(f => [f.condicion, f.n, f.pos, f.neg, r4(f.media), r4(f.z), r4(f.entre_mejores), f.lectura]),
    cols: ["condicion", "n", "pos", "neg", "media", "z", "entre_mejores", "lectura"],
    pares_mejores: cd.pares_mejores.map(f => [f.condicion, f.n, f.pos, r4(f.media), r4(f.z)]),
    pares_peores: cd.pares_peores.map(f => [f.condicion, f.n, f.pos, r4(f.media), r4(f.z)]) };
  out.cobertura = { prev: prev.resumen, hoy: cur.resumen };
  out.incoherentes = ev.incoherentes.slice(0, 400);
  out.cols = ["ticker", "ret", "m_hoy", "ne_hoy"];
  out.rows = ev.items.map(x => [x.t, x.ret, x.mh, x.neh]);
  // Registro del historial (una línea por sesión)
  const reg = { sesion: cur.sesion, sesion_prev: prev.sesion, built_at: out.built_at, parcial: out.parcial,
    universo: { evaluados: T.base.n, pos: T.base.pos, neg: T.base.neg, neu: T.base.neu, pct_pos: r4(T.base.pct_pos),
      media: r4(T.base.media), mediana: r4(T.base.mediana), desv: r4(T.base.desv), coherencia: r4(u.coherencia),
      sin_vela_hoy: u.sin_vela_hoy, sin_vela_prev: u.sin_vela_prev, nuevos: u.nuevos },
    combos: {}, mismo_dia: {}, destacado: { id: T.destacado.id, nota: r4(T.destacado.nota), texto: T.destacado.texto },
    cobertura: { con_ficha: prev.resumen.con_ficha, ema5_pedidos: prev.resumen.ema5.pedidos, ema5_con_dato: prev.resumen.ema5.con_dato,
      ema5_calculado: prev.resumen.ema5.calculado },
    cond: {} };
  T.combos.forEach(e => {
    const s = resumenCombo(e);
    reg.combos[e.id] = { n: s.n, pos: s.pos, neg: s.neg, neu: s.neu, pct_pos: s.pct_pos, media: s.media, mediana: s.mediana, suma: s.suma,
      mejor: s.mejor, peor: s.peor, desv: s.desv, extremos: s.extremos, media_sin_ext: s.media_sin_ext, ventaja_pos: s.ventaja_pos,
      ventaja_mediana: s.ventaja_mediana, supera_mediana: s.supera_mediana, z: s.z, nota: s.nota, azar: s.azar, fiabilidad: s.fiabilidad,
      califica: s.califica, no_evaluables: s.no_evaluables };
  });
  TH.combos.forEach(e => { const s = resumenCombo(e); reg.mismo_dia[e.id] = { n: s.n, pos: s.pos, pct_pos: s.pct_pos, media: s.media, mediana: s.mediana, nota: s.nota }; });
  cd.condiciones.forEach(f => { if (f.n >= C.MIN_CALIFICA) reg.cond[f.condicion] = [f.n, f.pos, r4(f.media)]; });
  return { dia: out, registro: reg, items: ev.items };
}

// ── Historial git: listados de sesiones anteriores ──
function git(a, max) {
  return cp.spawnSync("git", a, { cwd: BASE, maxBuffer: max || 64 * 1024 * 1024, timeout: 7 * 60 * 1000 });
}
function gitJson(commit, file) {
  try { const r = git(["show", `${commit}:${file}`], 256 * 1024 * 1024); return r.status === 0 ? JSON.parse(r.stdout.toString("utf8")) : null; }
  catch (e) { return null; }
}
// [{sesion, commit}] de más reciente a más antigua, una por sesión (el último commit de cada una)
function sesionesGit(desde) {
  try {
    if (git(["rev-parse", "--is-inside-work-tree"]).status !== 0) return [];
    const shallow = git(["rev-parse", "--is-shallow-repository"]).stdout.toString().trim() === "true";
    if (shallow && !SIN_RED) {
      const rama = process.env.GITHUB_REF_NAME || git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.toString().trim() || "main";
      const r = git(["fetch", "--quiet", "--filter=blob:none", `--shallow-since=${desde} 00:00:00 +0000`, "origin", rama]);
      if (r.status !== 0) console.log(`  ⚠️ no se pudo traer el historial git: ${r.stderr.toString().slice(0, 160).trim()}`);
    }
    const r = git(["log", "--format=%H", `--since=${desde} 00:00:00 +0000`, "--", "data/listado.json"]);
    if (r.status !== 0) return [];
    const out = [], vistas = new Set();
    for (const c of r.stdout.toString().split(/\s+/).filter(Boolean)) {
      const h = gitJson(c, "data/listado_health.json");
      const s = h && h.session_ref;
      if (!s || vistas.has(s) || (h.status && h.status !== "OK")) continue;
      vistas.add(s); out.push({ sesion: s, commit: c });
    }
    return out;
  } catch (e) { console.log(`  ⚠️ historial git no disponible: ${e.message}`); return []; }
}
// Universo de una sesión pasada: listado y grupos del mismo commit (si son de esa sesión)
function universoGit(x) {
  const Lx = gitJson(x.commit, "data/listado.json");
  if (!Lx || Lx.session_ref !== x.sesion) return null;
  const Sx = gitJson(x.commit, "data/snapshot.json");
  const U = universoDe(Sx && Sx.session_ref === x.sesion ? Sx : null, Lx);
  U.secRoe = secRoeDe(Sx);
  return U.sesion === x.sesion ? U : null;
}
const emaPasada = s => path.join(BASE, "cache", "combos_ema5_" + s + ".json");
function diasAntes(s, n) { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }

function guardarHistorial(reg, items) {
  const H = load(P("combos_historial.json"), { version: C.VERSION, dias: [] });
  H.version = C.VERSION;
  H.dias = (H.dias || []).filter(d => d.sesion !== reg.sesion); H.dias.push(reg);
  H.dias.sort((a, b) => a.sesion < b.sesion ? -1 : 1);
  H.actualizado = ahora();
  save(P("combos_historial.json"), H);
  const D = load(P("combos_detalle.json"), { version: C.VERSION, sesiones: {} });
  D.cols = ["ticker", "ret", "m"];
  D.sesiones = D.sesiones || {};
  D.sesiones[reg.sesion] = { prev: reg.sesion_prev, rows: items.filter(x => x.m).map(x => [x.t, x.ret, x.m]) };
  Object.keys(D.sesiones).sort().slice(0, -MAX_DETALLE).forEach(k => delete D.sesiones[k]);
  D.actualizado = ahora();
  save(P("combos_detalle.json"), D);
  return H.dias.length;
}

function main() {
  console.log("═".repeat(55) + "\nCOMBOS y WIN%DIA\n" + "═".repeat(55));
  const snap = load(P("snapshot.json"), null), L = load(P("listado.json"), null);
  const U = universoDe(snap, L);
  if (!U.sesion || U.filas.length < 100) { console.log("  ⚠️ no hay datos de la sesión: hoy no se actualizan los combos"); return; }
  const S = U.sesion;
  if (U.parcial) console.log(`  ⚠️ universo parcial: falta ${U.falta} de la sesión ${S}` + (L && L.session_ref ? ` (el listado guardado es del ${L.session_ref})` : ""));
  const ctxBase = { universe: load(P("universe.json"), {}), hist: load(P("alerts_history.json"), { alerts: [] }), secRoe: secRoeDe(snap) };
  let E = load(P("combos_estado.json"), null), EP = load(P("combos_estado_prev.json"), null);
  let prev = null;
  if (E && E.sesion === S) prev = EP && EP.sesion < S ? EP : null;        // misma sesión otra vez
  else if (E && E.sesion < S) prev = E;                                    // sesión nueva
  else if (E && E.sesion > S) { console.log(`  ⚠️ el listado (${S}) es anterior al estado guardado (${E.sesion}): no se toca nada`); return; }

  // Estado de hoy
  const cur = construirEstado(U, ctxBase, true, "sesión " + S);
  const rs = cur.resumen;
  console.log(`  Sesión ${S}: ${rs.tickets} tickets = ${rs.de_grupos} de tus grupos + ${rs.de_listado} del listado completo ` +
              `(${rs.con_vela} con la vela del día, ${rs.sin_vela} sin ella) · ${rs.con_ficha} con ficha fundamental`);
  console.log("  Cumplen hoy → " + C.COMBOS.map(c => `${c.id}: ${rs.por_combo[c.id].cumplen}`).join(" · ") +
              ` · velas de 5 min: ${rs.ema5.con_dato}/${rs.ema5.pedidos}`);

  // Sesión anterior: la guardada o, si falta o no es la anterior, la del historial git
  const esperada = sesionAnterior(S);
  let res = prev ? resultadoSesion(prev, cur) : null;
  if (res && res.dia.valido) { const antes = JSON.stringify(prev.resumen.ema5); prev = completarEma5(prev);
    if (JSON.stringify(prev.resumen.ema5) !== antes) res = resultadoSesion(prev, cur); }
  if ((!res || !res.dia.valido) && !SIN_GIT) {
    console.log(`  Sesión anterior ${prev ? "guardada (" + prev.sesion + ") no sirve" : "no guardada"}: se busca en el historial git`);
    const cand = sesionesGit(diasAntes(S, 12)).filter(x => x.sesion < S);
    if (cand.length) {
      const Up = universoGit(cand[0]);
      if (Up) {
        const pg = construirEstado(Up, Object.assign({}, ctxBase, { secRoe: Up.secRoe }), !SIN_RED, "sesión " + cand[0].sesion, emaPasada(cand[0].sesion));
        pg.origen = "git:" + cand[0].commit.slice(0, 7);
        const r2 = resultadoSesion(pg, cur);
        if (r2.dia.valido || !res) { res = r2; prev = pg; }
      }
    }
  }

  if (prev) save(P("combos_estado_prev.json"), prev);
  save(P("combos_estado.json"), cur);
  if (!res) {
    save(P("combos_dia.json"), { version: C.VERSION, sesion: S, sesion_prev: null, sesion_prev_esperada: esperada, built_at: ahora(), valido: false,
      motivo: "todavía no hay una sesión anterior guardada: la primera evaluación sale en la próxima actualización" });
    console.log("  Sin sesión anterior: los combos de hoy quedan guardados y se evalúan en la próxima actualización");
    return;
  }
  save(P("combos_dia.json"), res.dia);
  if (!res.dia.valido) { console.log(`  ⚠️ sin evaluación hoy: ${res.dia.motivo}`); return; }
  const n = guardarHistorial(res.registro, res.items);
  const b = res.dia.universo;
  console.log(`  Evaluados ${b.evaluados} tickets (combos del ${res.dia.sesion_prev} → % diario del ${S}): ` +
              `${b.pos} positivos (${(b.pct_pos * 100).toFixed(1)} %), ${b.neg} negativos, ${b.neu} neutros · coherencia ${(b.coherencia * 100).toFixed(1)} %`);
  C.COMBOS.forEach(c => {
    const e = res.dia.combos[c.id];
    console.log(`    Combo ${String(c.id).padEnd(2)} n=${String(e.n).padStart(4)}` + (e.n ? ` · positivos ${(e.pct_pos * 100).toFixed(1)} % · mediana ${e.mediana} · calidad ${e.nota === null ? "—" : e.nota.toFixed(1)}` : "") +
                (e.no_evaluables ? ` · ${e.no_evaluables} no evaluables` : ""));
  });
  console.log(`  Combo destacado: ${res.dia.destacado.texto}${res.dia.destacado.nota ? " (calidad " + res.dia.destacado.nota.toFixed(1) + ")" : ""} · historial: ${n} sesiones`);

  // Sesiones anteriores desde git: a pedido (--rellenar N) o, solas, si al historial
  // le falta la sesión anterior (una noche sin corrida o archivos pisados)
  const dias = (load(P("combos_historial.json"), { dias: [] }).dias || []).map(d => d.sesion);
  const hueco = dias.length >= 1 && !dias.includes(res.dia.sesion_prev) && dias.some(d => d < res.dia.sesion_prev);
  if (!SIN_GIT && (RELLENAR > 0 || hueco)) rellenar(RELLENAR > 0 ? RELLENAR : 5, S, ctxBase);
}

// Reconstruye evaluaciones de sesiones pasadas (pares de sesiones consecutivas del historial git)
function rellenar(n, S, ctxBase) {
  const ses = sesionesGit(diasAntes(S, Math.max(20, n * 2 + 6))).filter(x => x.sesion <= S).slice(0, n + 1);
  const H = load(P("combos_historial.json"), { dias: [] });
  const hechas = new Set((H.dias || []).map(d => d.sesion));
  let estados = {};
  const estadoDe = x => {
    if (!estados[x.sesion]) { const Ux = universoGit(x); estados[x.sesion] = Ux ? construirEstado(Ux, Object.assign({}, ctxBase, { secRoe: Ux.secRoe }), !SIN_RED, "sesión " + x.sesion, emaPasada(x.sesion)) : null; }
    return estados[x.sesion];
  };
  for (let i = 0; i + 1 < ses.length; i++) {
    if (hechas.has(ses[i].sesion)) continue;
    const cur = estadoDe(ses[i]), prev = estadoDe(ses[i + 1]);
    if (!cur || !prev) continue;
    const r = resultadoSesion(prev, cur);
    if (r.dia.valido) { guardarHistorial(r.registro, r.items); console.log(`  Reconstruida la sesión ${ses[i].sesion} (combos del ${ses[i + 1].sesion})`); }
    else console.log(`  Sesión ${ses[i].sesion}: no se pudo reconstruir (${r.dia.motivo})`);
    estados = { [ses[i + 1].sesion]: estados[ses[i + 1].sesion] };
  }
}

try { main(); } catch (e) { console.log(`  ⚠️ COMBOS no se actualizó: ${e && e.stack || e}`); }
