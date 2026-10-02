/*
 * FENIX SCANNER PRO — Motor de COMBOS y WIN%DIA
 * ------------------------------------------------------------------
 * Un solo archivo para el servidor (scripts/combos.js, Node) y para el
 * dashboard (pestañas COMBOS y WIN%DIA): así lo que se guarda cada noche y
 * lo que se ve en pantalla sale del mismo código.
 *
 * Qué hace:
 *   1. Para CADA fila del listado completo calcula los parámetros de las
 *      pestañas con fenix_params.js (las mismas fórmulas del dashboard y del
 *      Excel de Seguimiento: Markov 5 periodos, Laplace s = 0.3, Game Theory
 *      Nash / semanal, Entry Zones semanal).
 *   2. Aplica las condiciones de los combos 3, 11, 12, 14, 15 y 16 del punto 8
 *      del informe de auditoría (Ranking de combinaciones), sin cambiarlas.
 *   3. Estadísticas por combo frente a todo el universo del día, indicador de
 *      calidad, coincidencias entre combos y análisis de condiciones.
 *
 * No modifica nada de lo existente: solo lee filas y devuelve resultados.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./fenix_params.js"));
  else root.FenixCombos = factory(root.FenixParams);
})(typeof self !== "undefined" ? self : this, function (F) {
"use strict";

var VERSION = 1;

// ═══════════════════════════════════════════════════════════════════════
// 1. CONDICIONES Y COMBOS (punto 8 del informe — Ranking de combinaciones)
// ═══════════════════════════════════════════════════════════════════════
// Cada condición lee los MISMOS valores que las columnas de la hoja
// SEGUIMIENTO (W → AY) y devuelve true, false o null (no se puede evaluar).
function vacio(v) { return v === null || v === undefined || v === ""; }
function low(v) { return String(v).trim().toLowerCase(); }
function esNum(v) { return typeof v === "number" && isFinite(v); }

var CONDICIONES = {
  fase_acum: { texto: "Fase = Acumulación", columna: "Game Theory · Fase (AJ)",
    f: function (p) { return vacio(p.gt_fase) ? null : low(p.gt_fase) === "acumulación"; } },
  tend_bull: { texto: "Tendencia = Bullish", columna: "Laplace · Tendencia (AU)",
    f: function (p) { return vacio(p.lp_tend) ? null : low(p.lp_tend) === "bullish"; } },
  early_no_temprano: { texto: "Earliness distinto de Temprano", columna: "Laplace · Eariness (AW)",
    f: function (p) { return vacio(p.lp_early) ? null : low(p.lp_early).indexOf("temprano") < 0; } },
  early_fresco: { texto: "Earliness = Fresco", columna: "Laplace · Eariness (AW)",
    f: function (p) { return vacio(p.lp_early) ? null : low(p.lp_early).indexOf("fresco") >= 0; } },
  // PATRON 1 de la hoja: SEARCH("Maduro"), SEARCH("Tardio"), SEARCH("Extendido")
  early_maduro_tardio_ext: { texto: "Earliness = Maduro, Tardío o Extendido", columna: "Laplace · Eariness (AW)",
    f: function (p) { return vacio(p.lp_early) ? null : /maduro|tardio|extendido/.test(low(p.lp_early)); } },
  estab_no_osc: { texto: "Estabilidad distinta de Oscillating", columna: "Laplace · Estabilidad (AV)",
    f: function (p) { return vacio(p.lp_estab) ? null : low(p.lp_estab) !== "oscillating"; } },
  // PATRON 1 usa $AV<>"Oscillating": una celda vacía también cumple
  estab_no_osc_hoja: { texto: "Estabilidad distinta de Oscillating", columna: "Laplace · Estabilidad (AV)",
    f: function (p) { return vacio(p.lp_estab) ? true : low(p.lp_estab) !== "oscillating"; } },
  ez_excelente: { texto: "Calidad = EXCELENTE", columna: "Entry Zones · Calidad (AO)",
    f: function (p) {
      if (vacio(p.ez_cal)) return null;
      if (p.sin_ficha) return null;            // acción sin ficha fundamental: no se sabe
      return String(p.ez_cal).trim().toUpperCase() === "EXCELENTE";
    } },
  mk_75: { texto: "Markov Score ≥ 75", columna: "Markov · Score (AC)",
    f: function (p) { return esNum(p.mk_score) ? p.mk_score >= 75 : null; } },
  mk_bullish: { texto: "Markov Estado = Bullish", columna: "Markov · Estado / Signal (AD)",
    f: function (p) { if (vacio(p.mk_estado)) return null; var m = /^[a-z]+/.exec(low(p.mk_estado)); return !!m && m[0] === "bullish"; } },
  lp_avoid: { texto: "Laplace Señal = avoid", columna: "Laplace · Señal (AY)",
    f: function (p) { return vacio(p.lp_senal) ? null : low(p.lp_senal) === "avoid"; } },
  // "Bajo ambas EMAs" de la hoja (PATRON 2): Dis Ema 20 < 0 y Dis Ema 200 < 0 en
  // 5 minutos. Dis Ema = EMA − nivel, así que las dos EMA quedan por debajo.
  ema5_bajo: { texto: "Dis Ema 20 < 0 y Dis Ema 200 < 0 en 5 minutos", columna: "Temp 5 minutos · Dis Ema 20 y 200 (N, O)",
    f: function (p) { return esNum(p.m5_20) && esNum(p.m5_200) ? (p.m5_20 < 0 && p.m5_200 < 0) : null; } },
  sector_energy: { texto: "Sector = Energy", columna: "Sector (B)",
    f: function (p) { return vacio(p.sector) || p.sector === "—" ? null : p.sector === "Energy"; } },
  no_repetida: { texto: "No repetida (anti-repetición)", columna: "Anti-repetición (BI)",
    f: function (p) { return p.repetida === null || p.repetida === undefined ? null : !p.repetida; } }
};

// "ranking": lo que mostró el punto 8 (operaciones cerradas del Excel, resultado A)
var COMBOS = [
  { id: 3, nombre: "Combo 3", titulo: "Calidad EXCELENTE + Markov Score ≥ 75",
    cond: ["ez_excelente", "mk_75"], ranking: { muestra: 37, win: 25, loss: 12 } },
  { id: 11, nombre: "Combo 11", titulo: "Acumulación + Bullish + ≠ Temprano + ≠ Oscillating + no repetida",
    cond: ["fase_acum", "tend_bull", "early_no_temprano", "estab_no_osc", "no_repetida"], ranking: { muestra: 17, win: 15, loss: 2 } },
  { id: 12, nombre: "Combo 12", titulo: "PATRON 1 = ENTRAR (Acumulación + Bullish + Maduro, Tardío o Extendido + ≠ Oscillating)",
    cond: ["fase_acum", "tend_bull", "early_maduro_tardio_ext", "estab_no_osc_hoja"], ranking: { muestra: 14, win: 10, loss: 4 } },
  { id: 14, nombre: "Combo 14", titulo: "Acumulación + Fresco + no repetida",
    cond: ["fase_acum", "early_fresco", "no_repetida"], ranking: { muestra: 8, win: 8, loss: 0 } },
  { id: 15, nombre: "Combo 15", titulo: "Laplace avoid + Markov Bullish + las dos EMA de 5 min por debajo",
    cond: ["lp_avoid", "mk_bullish", "ema5_bajo"], ranking: { muestra: 9, win: 9, loss: 0 } },
  { id: 16, nombre: "Combo 16", titulo: "Calidad EXCELENTE + no repetida + Markov Score ≥ 75 + Energy",
    cond: ["ez_excelente", "no_repetida", "mk_75", "sector_energy"], ranking: { muestra: 9, win: 9, loss: 0 } }
];
COMBOS.forEach(function (c, i) { c.bit = 1 << i; });
var COMBO_POR_ID = {}; COMBOS.forEach(function (c) { COMBO_POR_ID[c.id] = c; });

// 1 = cumple · 0 = no cumple · null = no evaluable (ninguna condición falla,
// pero al menos una no se puede calcular con los datos disponibles)
function evalCombo(c, p) {
  var desconocida = false;
  for (var i = 0; i < c.cond.length; i++) {
    var v = CONDICIONES[c.cond[i]].f(p);
    if (v === false) return 0;
    if (v === null) desconocida = true;
  }
  return desconocida ? null : 1;
}
function mascaras(p) {
  var m = 0, ne = 0;
  COMBOS.forEach(function (c) { var v = evalCombo(c, p); if (v === 1) m |= c.bit; else if (v === null) ne |= c.bit; });
  return { m: m, ne: ne };
}
// Primera condición que falla (para explicar por qué un ticket no entra)
function detalleCombo(c, p) {
  return c.cond.map(function (k) { return { clave: k, texto: CONDICIONES[k].texto, columna: CONDICIONES[k].columna, valor: CONDICIONES[k].f(p) }; });
}
function nombresDeMascara(m) {
  return COMBOS.filter(function (c) { return (m & c.bit) !== 0; }).map(function (c) { return c.id; });
}

// ═══════════════════════════════════════════════════════════════════════
// 2. REGISTRO DE UN TICKET: todos los datos de las pestañas
// ═══════════════════════════════════════════════════════════════════════
var ETF_SECT = { "Index": 1, "ETF": 1, "Commodity": 1, "Fixed Income": 1 };

// Sector / Industry con la regla de la hoja (LISTADO): "ETF" si la industria es
// Exchange Traded Fund; si el ticket no está en el LISTADO, lo que reporta Yahoo.
function sectorIndustria(ticker, universe, row) {
  var u = universe && (universe[ticker] || universe[String(ticker).replace("/", "-")]);
  if (u && u.length >= 3) {
    var ind = u[2] || "—";
    return [ind === "Exchange Traded Fund" ? "ETF" : (u[1] || "—"), ind];
  }
  var sec = (row && row.sector) || "—", ind2 = (row && row.industry) || "—";
  if (sec === "N/A" || sec === "") sec = "—";
  if (sec === "ETF" || sec === "Fondo") { sec = "ETF"; if (ind2 === "—") ind2 = "Exchange Traded Fund"; }
  return [sec, ind2];
}
function tieneFicha(r) {
  var g = [r.eps_gr, r.roe_gr, r.roa_gr, r.pe_gr];
  for (var i = 0; i < g.length; i++) if (g[i] && g[i] !== "N/A") return true;
  return !!r.fund_fecha;
}
// Nivel de entrada que asigna el sistema (scripts/check_alerts.py, validate_all)
function redondeoPy(x) {            // round(x, 2) de Python: al más cercano; empate exacto, al par
  if (Number.isInteger(x * 8) && !Number.isInteger(x * 4)) {      // único caso de empate exacto en binario: …,125 …,375 …,625 …,875
    var b = Math.floor(x * 100);
    return (b % 2 === 0 ? b : b + 1) / 100;
  }
  return Number(x.toFixed(2));
}
function nivelEntrada(r) {
  var close = r.close || 1, atr = r.atr;
  return atr && atr > 0 ? redondeoPy(close - 0.3 * atr) : redondeoPy(close * 0.985);
}
// Anti-repetición de la hoja (columna BI), llevada al historial de alertas:
//   REPETIDA = el ticket ya tuvo una señal antes Y el nivel de entrada de hoy
//   está más de 1,5 % por encima de la entrada más baja de esas señales.
function repetida(entrada, previas) {
  if (!previas || !previas.length) return false;
  var mn = Infinity;
  previas.forEach(function (e) { if (esNum(e) && e < mn) mn = e; });
  return mn < Infinity && entrada > mn * 1.015;
}

// Columnas del archivo data/combos_estado.json (una fila por ticket)
var EST_COLS = [
  "ticker", "nombre", "origen", "grupo", "sector", "industria", "close", "asof", "stale", "ficha", "etf",
  "estado", "score", "ai", "abc", "rsi", "adx", "ext", "rel_vol", "daily", "d5", "d20", "atr", "upside",
  "rs_rank", "sma50_rel", "sma200_rel", "from_hi52", "senales", "patrones",
  "h_clase", "h_fxx", "h_fyy", "h_det", "h_curv", "h_senal",
  "mk_score", "mk_estado", "mk_abs", "mk_estac",
  "gt_nash", "gt_comp", "gt_rr", "gt_fase", "gt_eq",
  "ez_prob", "ez_up", "ez_20d", "ez_cal",
  "an_roe", "an_roa", "an_eps", "an_cal", "an_riesgo",
  "lp_tend", "lp_estab", "lp_early", "lp_score", "lp_senal",
  "m5_20", "m5_200", "entrada", "repetida", "alertas_prev", "alerta",
  "m", "ne"
];
// Claves que salen tal cual de fenix_params.buildRow (formato de la hoja)
var DE_HOJA = ["h_clase", "h_fxx", "h_fyy", "h_det", "h_curv", "h_senal", "mk_score", "mk_estado", "mk_abs", "mk_estac",
  "gt_nash", "gt_comp", "gt_rr", "gt_fase", "gt_eq", "ez_prob", "ez_up", "ez_20d", "ez_cal",
  "an_roe", "an_roa", "an_eps", "an_cal", "an_riesgo", "lp_tend", "lp_estab", "lp_early", "lp_score", "lp_senal"];

// ctx = { universe, secRoe (promedio ROE por sector de tus grupos), previas {ticker: [entradas]},
//         alertasHoy {ticker: true}, ema5 {ticker: [ema20, ema200, ref]}, sesion }
function registro(r, ctx) {
  ctx = ctx || {};
  var si = sectorIndustria(r.ticker, ctx.universe, r);
  // origen: "G" = uno de tus grupos (data/snapshot.json) · "L" = listado completo (data/listado.json)
  var o = { ticker: r.ticker, nombre: r.name || "", origen: r._origen || "L", grupo: r._grupo || "", sector: si[0], industria: si[1], close: r.close, asof: r.asof || null,
    stale: (r.stale || (ctx.sesion && r.asof !== ctx.sesion)) ? 1 : 0,
    ficha: tieneFicha(r) ? 1 : 0, etf: ETF_SECT[r.sector || ""] ? 1 : 0,
    estado: r.state || null, score: r.score, ai: r.ai, abc: r.abc || null, rsi: r.rsi, adx: r.adx, ext: r.ext,
    rel_vol: r.rel_vol, daily: r.daily, d5: r["5d"], d20: r["20d"], atr: r.atr, upside: r.upside,
    rs_rank: r.rs_rank, sma50_rel: r.sma50_rel, sma200_rel: r.sma200_rel, from_hi52: r.from_hi52,
    senales: (r.signals || []).join("|"),
    patrones: (r.patterns || []).map(function (x) { return x && x.name; }).filter(Boolean).join("|") };
  // Parámetros de las pestañas: se piden a buildRow, la misma función que arma
  // la fila del Excel de Seguimiento (texto y redondeos idénticos a la hoja).
  if (ctx.secRoe) r._sec_roe_avg = ctx.secRoe[r.sector] == null ? null : ctx.secRoe[r.sector];
  var arr = F.buildRow({ ticker: r.ticker, asof: r.asof, fill_date: r.asof || "s/f", status: "" },
                       { row_fill: r.asof ? r : Object.assign({}, r, { asof: "s/f" }), sector: si[0], industry: si[1] }, {});
  var hoja = {}; F.COLUMNS.forEach(function (c, i) { hoja[c[0]] = arr[i]; });
  DE_HOJA.forEach(function (k) { o[k] = hoja[k] === undefined ? null : hoja[k]; });
  // EMA de 5 minutos al cierre de la sesión (solo se pide para quien ya cumple
  // las otras condiciones del combo 15): Dis Ema = EMA − precio de la última vela
  var e = ctx.ema5 && ctx.ema5[r.ticker];
  if (e && esNum(e[0]) && esNum(e[1]) && esNum(e[2])) {
    var dec = e[2] >= 1 ? 2 : 4, k = Math.pow(10, dec);
    o.m5_20 = Math.round((e[0] - e[2]) * k) / k; o.m5_200 = Math.round((e[1] - e[2]) * k) / k;
  } else { o.m5_20 = null; o.m5_200 = null; }
  o.entrada = nivelEntrada(r);
  var prev = (ctx.previas && ctx.previas[r.ticker]) || [];
  o.repetida = repetida(o.entrada, prev) ? 1 : 0;
  o.alertas_prev = prev.length;
  o.alerta = ctx.alertasHoy && ctx.alertasHoy[r.ticker] ? 1 : 0;
  var mk = mascaras(aParametros(o));
  o.m = mk.m; o.ne = mk.ne;
  return o;
}
// Vista del registro con los nombres que usan las condiciones
function aParametros(o) {
  return { gt_fase: o.gt_fase, lp_tend: o.lp_tend, lp_estab: o.lp_estab, lp_early: o.lp_early, lp_senal: o.lp_senal,
    ez_cal: o.ez_cal, sin_ficha: !o.etf && !o.ficha, mk_score: o.mk_score, mk_estado: o.mk_estado,
    m5_20: o.m5_20, m5_200: o.m5_200, sector: o.sector,
    repetida: o.repetida === null || o.repetida === undefined ? null : !!o.repetida };
}
// ¿A qué tickets hay que pedirles velas de 5 min? A los que ya cumplen el resto
// del combo 15 (Laplace avoid + Markov Bullish).
function necesitaEma5(o) {
  var p = aParametros(o);
  return CONDICIONES.lp_avoid.f(p) === true && CONDICIONES.mk_bullish.f(p) === true;
}
function filaEstado(o) { return EST_COLS.map(function (k) { var v = o[k]; return v === undefined ? null : v; }); }
function objetoEstado(cols, fila) { var o = {}; for (var i = 0; i < cols.length; i++) o[cols[i]] = fila[i]; return o; }

// ═══════════════════════════════════════════════════════════════════════
// 3. ESTADÍSTICA
// ═══════════════════════════════════════════════════════════════════════
function ordenar(a) { return a.slice().sort(function (x, y) { return x - y; }); }
function cuantil(s, q) {            // s ordenado; interpolación lineal
  var n = s.length; if (!n) return null;
  var h = (n - 1) * q, i = Math.floor(h), f = h - i;
  return i + 1 < n ? s[i] * (1 - f) + s[i + 1] * f : s[i];
}
function media(a) { if (!a.length) return null; var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
function desv(a) {                   // desviación estándar muestral
  var n = a.length; if (n < 2) return null; var m = media(a), s = 0;
  for (var i = 0; i < n; i++) s += (a[i] - m) * (a[i] - m);
  return Math.sqrt(s / (n - 1));
}
// Intervalo de Wilson al 95 % para una proporción
function wilson(k, n) {
  if (!n) return [null, null];
  var z = 1.959964, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), w = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - w) / d), Math.min(1, (c + w) / d)];
}
// Posición de v dentro de la muestra ordenada s, de 0 a 100 (los empates cuentan la mitad)
function percentilDe(s, v) {
  var n = s.length; if (!n || v === null) return null;
  var lo = 0, hi = n;                 // primeros índices con s[i] >= v y s[i] > v
  while (lo < hi) { var m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; }
  var a = lo; hi = n;
  while (lo < hi) { var m2 = (lo + hi) >> 1; if (s[m2] <= v) lo = m2 + 1; else hi = m2; }
  return (a + (lo - a) / 2) / n * 100;
}
function cdfNormal(z) {              // Φ(z), Abramowitz-Stegun 26.2.17
  var t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2);
  var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
var EXTREMO = 50;   // |% diario| a partir del cual se marca "valor extremo" (posible split o dato defectuoso)

// Línea base del día: todo el universo evaluado
function base(rets) {
  var s = ordenar(rets), n = s.length, pos = 0, neg = 0;
  for (var i = 0; i < n; i++) { if (s[i] > 0) pos++; else if (s[i] < 0) neg++; }
  var B = { n: n, pos: pos, neg: neg, neu: n - pos - neg, pct_pos: n ? pos / n : null, pct_neg: n ? neg / n : null,
    media: media(s), mediana: cuantil(s, 0.5), p25: cuantil(s, 0.25), p75: cuantil(s, 0.75),
    p01: cuantil(s, 0.01), p99: cuantil(s, 0.99), p90: cuantil(s, 0.90), desv: desv(s),
    mejor: n ? s[n - 1] : null, peor: n ? s[0] : null, orden: s };
  // Anclas de la Calidad: los mismos dos promedios, calculados para el universo
  B.media_acotada = n ? mediaAcotada(s, B) : null;        // valores acotados al 1 %–99 % del universo
  B.media_recortada = n ? mediaRecortada(s, B) : null;    // sin el 10 % mejor ni el 10 % peor
  B.pct_media_acotada = percentilDe(s, B.media_acotada);
  B.pct_media_recortada = percentilDe(s, B.media_recortada);
  return B;
}
function mediaAcotada(s, B) {
  var w = 0; for (var i = 0; i < s.length; i++) w += Math.min(B.p99, Math.max(B.p01, s[i]));
  return w / s.length;
}
// s ordenado: promedio sin el 10 % de mejores ni el 10 % de peores (al menos uno de cada lado si hay 5 o más)
function mediaRecortada(s, B) {
  var n = s.length, k = n >= 5 ? Math.ceil(n * 0.10) : 0, t = 0;
  for (var j = k; j < n - k; j++) t += Math.min(B.p99, Math.max(B.p01, s[j]));
  return t / (n - 2 * k);
}
function acotar(v) { return Math.max(0, Math.min(100, v)); }

var MIN_CALIFICA = 20;   // con menos, el intervalo de la tasa positiva supera ±20 puntos
var MIN_NOTA = 5;        // con menos no se calcula la nota

// Estadísticas de un grupo de rendimientos frente a la línea base B del día
function estadisticas(rets, B, conBanda) {
  var s = ordenar(rets), n = s.length;
  var o = { n: n, pos: 0, neg: 0, neu: 0 };
  if (!n) return o;
  var gan = [], per = [], ext = 0, sinExt = [];
  for (var i = 0; i < n; i++) {
    if (s[i] > 0) { o.pos++; gan.push(s[i]); } else if (s[i] < 0) { o.neg++; per.push(s[i]); } else o.neu++;
    if (Math.abs(s[i]) >= EXTREMO) ext++; else sinExt.push(s[i]);
  }
  o.pct_pos = o.pos / n; o.pct_neg = o.neg / n; o.pct_neu = o.neu / n;
  o.media = media(s); o.mediana = cuantil(s, 0.5); o.suma = o.media * n;
  o.mejor = s[n - 1]; o.peor = s[0]; o.desv = desv(s);
  o.p25 = cuantil(s, 0.25); o.p75 = cuantil(s, 0.75); o.iqr = o.p75 - o.p25;
  o.extremos = ext; o.media_sin_ext = sinExt.length ? media(sinExt) : null; o.suma_sin_ext = sinExt.length ? o.media_sin_ext * sinExt.length : null;
  // Expectativa: % positivos × ganancia media − % negativos × pérdida media (= la media)
  o.gan_media = gan.length ? media(gan) : null; o.per_media = per.length ? media(per) : null;
  o.payoff = o.gan_media !== null && o.per_media ? o.gan_media / Math.abs(o.per_media) : null;
  var w = wilson(o.pos, n); o.ic_lo = w[0]; o.ic_hi = w[1];
  if (B && B.n) {
    o.frecuencia = n / B.n;                         // parte del universo que cumple
    o.ventaja_pos = o.pct_pos - B.pct_pos;          // puntos de tasa positiva sobre el universo
    o.ventaja_mediana = o.mediana - B.mediana;
    o.ventaja_media = o.media - B.media;
    var sup = 0;                                    // tickets que superan la mediana del universo
    for (var j = 0; j < n; j++) { if (s[j] > B.mediana) sup++; else if (s[j] === B.mediana) sup += 0.5; }
    o.supera_mediana = sup / n;
    // z de la cantidad de positivos frente a sacar n tickets al azar del universo
    // (hipergeométrica, con corrección de población finita)
    var p0 = B.pct_pos, varz = n * p0 * (1 - p0) * (B.n > 1 ? (B.n - n) / (B.n - 1) : 1);
    o.z = varz > 0 ? (o.pos - n * p0) / Math.sqrt(varz) : null;
    o.p_valor = o.z === null ? null : 1 - cdfNormal(o.z);
    o.calidad = calidad(s, o, B, conBanda);
  }
  return o;
}

// ── INDICADOR DE CALIDAD (0 a 100; 50 = igual que el universo ese día) ──
// Cuatro notas de 0 a 100, cada una medida CONTRA EL UNIVERSO del mismo día
// (así un día alcista no infla a todos los combos), con el mismo peso (25 %).
// Un grupo de tickets sacado al azar del universo recibe 50 en las cuatro.
//   tasa       · tasa positiva: parte del margen posible sobre el universo
//   rendimiento· percentil que ocupa el promedio del combo entre los % diarios
//                del universo, menos el percentil del promedio del universo
//                (valores acotados al 1 %–99 % del universo para que un dato
//                defectuoso no decida)
//   consistencia· % de tickets del combo que superan la mediana del universo
//   robustez   · lo mismo que rendimiento, pero con el promedio SIN el 10 % de
//                mejores ni el 10 % de peores tickets (¿depende de unos pocos?)
// La quinta pieza, el tamaño de muestra, no suma puntos por sí sola: multiplica.
//   fiabilidad = 1 − ancho del intervalo de Wilson (95 %) de la tasa positiva
//   Calidad = 50 + fiabilidad × (promedio de las cuatro notas − 50)
// Con pocos tickets la nota se acerca a 50 (no se sabe); con muchos, vale lo que
// valgan las cuatro notas. Pesos iguales porque todavía no hay historial que
// justifique otros: se revisan cuando haya 60 sesiones o más.
var PESOS = { tasa: 0.25, rendimiento: 0.25, consistencia: 0.25, robustez: 0.25 };
// Las cuatro notas, la fiabilidad y la Calidad de una muestra ORDENADA s frente al universo B
function notasDe(s, B) {
  var n = s.length, pos = 0, sup = 0;
  for (var i = 0; i < n; i++) { if (s[i] > 0) pos++; if (s[i] > B.mediana) sup++; else if (s[i] === B.mediana) sup += 0.5; }
  var p0 = B.pct_pos, pc = pos / n, tasa;
  if (p0 <= 0 || p0 >= 1) tasa = 50;
  else tasa = pc >= p0 ? 50 + 50 * (pc - p0) / (1 - p0) : 50 * pc / p0;
  var rend = acotar(50 + percentilDe(B.orden, mediaAcotada(s, B)) - B.pct_media_acotada);
  var consist = sup / n * 100;
  var robust = acotar(50 + percentilDe(B.orden, mediaRecortada(s, B)) - B.pct_media_recortada);
  var prom = tasa * PESOS.tasa + rend * PESOS.rendimiento + consist * PESOS.consistencia + robust * PESOS.robustez;
  var w = wilson(pos, n), fiab = 1 - (w[1] - w[0]);
  return { notas: { tasa: tasa, rendimiento: rend, consistencia: consist, robustez: robust }, promedio: prom, fiabilidad: fiab, nota: 50 + fiab * (prom - 50) };
}
// Qué Calidad obtienen grupos del MISMO tamaño sacados al azar del universo ese día:
// [percentil 5, percentil 95] de 300 sorteos (semilla fija: el resultado se puede repetir)
var SORTEOS = 300;
function bandaAzar(n, B) {
  var sem = (n * 7919 + B.n * 104729 + 12345) % 2147483647, U = B.orden, N = U.length, notas = [];
  function rnd() { sem = (sem * 48271) % 2147483647; return sem / 2147483647; }
  for (var k = 0; k < SORTEOS; k++) {
    var m = new Array(n);
    for (var i = 0; i < n; i++) m[i] = U[Math.floor(rnd() * N)];
    m.sort(function (x, y) { return x - y; });
    notas.push(notasDe(m, B).nota);
  }
  notas.sort(function (x, y) { return x - y; });
  return [cuantil(notas, 0.05), cuantil(notas, 0.95)];
}
function calidad(s, o, B, conBanda) {
  var n = s.length;
  if (n < MIN_NOTA) return { nota: null, motivo: "menos de " + MIN_NOTA + " tickets", fiabilidad: null, notas: null, califica: false };
  var q = notasDe(s, B);
  q.califica = n >= MIN_CALIFICA;
  if (conBanda !== false) q.azar = bandaAzar(n, B);
  // Nivel de confianza (de UN día; los tickets de un mismo día se mueven juntos,
  // así que esta prueba es optimista: la evidencia real es la que se repite entre días)
  var fuera = q.azar ? q.nota > q.azar[1] : (o.z !== null && o.z >= 1.645);
  if (n < MIN_CALIFICA) q.nivel = "Muy baja (menos de " + MIN_CALIFICA + " tickets)";
  else if (fuera && o.z !== null && o.z >= 2.326 && n >= 50) q.nivel = "Alta para un solo día";
  else if (fuera) q.nivel = "Media para un solo día";
  else q.nivel = "Baja (dentro de lo que da el azar)";
  return q;
}

// ── Tabla de los seis combos para una lista de tickets evaluados ──
// items: [{ t, ret, m, ne }]  (m = combos que cumple, ne = combos no evaluables)
function tablaCombos(items) {
  var rets = items.map(function (x) { return x.ret; });
  var B = base(rets);
  var filas = COMBOS.map(function (c) {
    var r = [], ne = 0;
    for (var i = 0; i < items.length; i++) { if (items[i].m & c.bit) r.push(items[i].ret); else if (items[i].ne & c.bit) ne++; }
    var e = estadisticas(r, B); e.id = c.id; e.no_evaluables = ne;
    return e;
  });
  return { base: B, combos: filas, destacado: destacado(filas, B), avisos: avisos(filas, B) };
}
// Combo destacado del día: la mejor Calidad entre los que tienen muestra suficiente
function destacado(filas, B) {
  var cal = filas.filter(function (e) { return e.calidad && e.calidad.califica; })
                 .sort(function (a, b) { return b.calidad.nota - a.calidad.nota; });
  var ind = filas.filter(function (e) { return e.calidad && e.calidad.nota !== null && !e.calidad.califica; })
                 .sort(function (a, b) { return b.calidad.nota - a.calidad.nota; });
  var o = { id: null, nota: null, texto: "", indicativo: ind.length ? { id: ind[0].id, nota: ind[0].calidad.nota, n: ind[0].n } : null };
  if (!cal.length) { o.texto = "Ningún combo llegó a " + MIN_CALIFICA + " tickets: hoy no hay combo destacado"; return o; }
  if (cal[0].calidad.nota <= 50) {
    o.texto = "Ningún combo con muestra suficiente superó al universo";
    o.mejor_bajo_50 = { id: cal[0].id, nota: cal[0].calidad.nota };
    return o;
  }
  o.id = cal[0].id; o.nota = cal[0].calidad.nota;
  o.texto = "Combo " + cal[0].id;
  if (cal.length > 1 && cal[0].calidad.nota - cal[1].calidad.nota < 1) o.empate = cal[1].id;   // menos de 1 punto: empate práctico
  return o;
}
// Advertencias de sobreajuste, por combo
function avisos(filas, B) {
  var out = [];
  filas.forEach(function (e) {
    var a = [];
    if (!e.n) a.push("Ningún ticket lo cumplió");
    else {
      if (e.n < MIN_NOTA) a.push("Solo " + e.n + " ticket" + (e.n === 1 ? "" : "s") + ": sin nota");
      else if (e.n < MIN_CALIFICA) a.push("Muestra pequeña (" + e.n + "): la nota es solo indicativa");
      if (e.extremos) a.push(e.extremos + " valor" + (e.extremos === 1 ? "" : "es") + " extremo" + (e.extremos === 1 ? "" : "s") + " (±" + EXTREMO + " % o más): posible split o dato defectuoso");
      if (e.n >= MIN_NOTA && e.media !== null && e.mediana !== null && (e.media > 0) !== (e.mediana > 0) && Math.abs(e.media - e.mediana) > 0.5)
        a.push("Promedio y mediana apuntan en sentidos distintos: el promedio depende de pocos tickets");
      if (e.n >= MIN_NOTA && e.suma > 0) {
        // concentración: parte de la suma de ganancias que aporta el mejor 10 %
        // (no se guarda la lista aquí; se informa con mejor/suma)
        if (e.mejor > 0 && e.mejor / (e.gan_media * e.pos) > 0.5 && e.pos >= 2) a.push("Un solo ticket aporta más de la mitad de las ganancias");
      }
      if (e.pct_pos === 1 && e.n < 30) a.push("100 % de positivos con " + e.n + " tickets no demuestra nada todavía");
    }
    if (e.no_evaluables) a.push(e.no_evaluables + " tickets no evaluables por falta de datos");
    if (a.length) out.push({ id: e.id, avisos: a });
  });
  return out;
}

// ── Coincidencias entre combos ──
// Para cada par: tickets en común, contención (parte del combo más chico que
// también está en el otro) y lift (veces lo esperado si fueran independientes).
function coincidencias(items) {
  var N = items.length, cnt = {}, par = {}, multi = { 0: 0, 1: 0, 2: 0, 3: 0 };
  COMBOS.forEach(function (c) { cnt[c.id] = 0; });
  items.forEach(function (x) {
    var ids = nombresDeMascara(x.m);
    multi[Math.min(3, ids.length)]++;
    ids.forEach(function (a, i) { cnt[a]++; for (var j = i + 1; j < ids.length; j++) { var k = a + "-" + ids[j]; par[k] = (par[k] || 0) + 1; } });
  });
  var pares = [];
  for (var i = 0; i < COMBOS.length; i++) for (var j = i + 1; j < COMBOS.length; j++) {
    var a = COMBOS[i].id, b = COMBOS[j].id, ab = par[a + "-" + b] || 0, na = cnt[a], nb = cnt[b];
    var cont = Math.min(na, nb) ? ab / Math.min(na, nb) : null;
    var lift = na && nb && N ? ab * N / (na * nb) : null;
    var rel;
    if (!na || !nb) rel = "Sin datos hoy";
    else if (cont >= 0.9) rel = "Redundantes: el más chico está casi entero dentro del otro";
    else if (ab === 0) rel = "Excluyentes: ningún ticket en común";
    else if (lift >= 2) rel = "Suelen aparecer juntos";
    else if (lift <= 0.5) rel = "Complementarios: coinciden menos de lo esperado";
    else rel = "Independientes";
    pares.push({ a: a, b: b, na: na, nb: nb, comunes: ab, contencion: cont, lift: lift, relacion: rel });
  }
  return { n: cnt, pares: pares, por_cantidad: multi };
}
// Relaciones que salen de la definición (valen todos los días)
var ESTRUCTURA = [
  { a: 16, b: 3, texto: "El combo 16 es el combo 3 más dos condiciones: todo ticket del 16 está en el 3." },
  { a: 12, b: 11, texto: "Un ticket del combo 12 que no esté repetido entra también en el 11." },
  { a: 12, b: 14, texto: "12 y 14 no pueden coincidir: uno pide Maduro, Tardío o Extendido y el otro Fresco." },
  { a: 14, b: 11, texto: "Un ticket del combo 14 entra en el 11 si además es Bullish y no Oscillating." }
];

// ═══════════════════════════════════════════════════════════════════════
// 4. CONDICIONES (WIN%DIA): frecuencia frente a efectividad
// ═══════════════════════════════════════════════════════════════════════
function tramo(v, cortes, etiquetas) {      // cortes ascendentes; etiquetas.length = cortes.length + 1
  if (!esNum(v)) return null;
  for (var i = 0; i < cortes.length; i++) if (v < cortes[i]) return etiquetas[i];
  return etiquetas[cortes.length];
}
function primera(v) { return vacio(v) ? null : String(v).trim().split(/[\s(\/]/)[0]; }
function cap(v) { return vacio(v) ? null : String(v).charAt(0).toUpperCase() + String(v).slice(1).toLowerCase(); }
// Variables: una etiqueta por ticket (null = no aplica o sin dato)
var VARIABLES = [
  ["Origen", function (o) { return o.origen === "G" ? "tus grupos" : "listado completo"; }],
  ["Tipo", function (o) { return o.etf || o.sector === "ETF" ? "ETF" : "Acción"; }],
  ["Sector", function (o) { return o.etf || o.sector === "ETF" || vacio(o.sector) || o.sector === "—" ? null : o.sector; }],
  ["Precio", function (o) { return tramo(o.close, [1, 5, 20, 100], ["menos de $1", "$1 a $5", "$5 a $20", "$20 a $100", "$100 o más"]); }],
  ["Fase (Game Theory)", function (o) { return o.gt_fase || null; }],
  ["Markov estado", function (o) { return cap(primera(o.mk_estado)); }],
  ["Markov Score", function (o) { return tramo(o.mk_score, [40, 60, 70, 75], ["menos de 40", "40 a 59", "60 a 69", "70 a 74", "75 o más"]); }],
  ["Nash", function (o) { return tramo(o.gt_nash, [0.5, 0.7, 0.8, 0.9], ["menos de 0,50", "0,50 a 0,69", "0,70 a 0,79", "0,80 a 0,89", "0,90 o más"]); }],
  ["Composite", function (o) { return !o.etf && !o.ficha ? null : tramo(o.gt_comp, [40, 55, 70, 85], ["menos de 40", "40 a 54", "55 a 69", "70 a 84", "85 o más"]); }],
  ["Calidad (Entry Zones)", function (o) { return !o.etf && !o.ficha ? null : o.ez_cal || null; }],
  ["Upside", function (o) { return tramo(o.ez_up, [0.0000001, 0.09, 0.12, 0.2], ["cero o negativo", "hasta 9 %", "9 % a 12 %", "12 % a 20 %", "20 % o más"]); }],
  ["Prob (Entry Zones)", function (o) { return tramo(o.ez_prob, [0.6, 0.7, 0.8, 0.9], ["menos de 60 %", "60 % a 69 %", "70 % a 79 %", "80 % a 89 %", "90 % o más"]); }],
  ["Hessian clase", function (o) { return o.h_clase || null; }],
  ["Laplace tendencia", function (o) { return o.lp_tend || null; }],
  ["Laplace estabilidad", function (o) { return o.lp_estab || null; }],
  ["Earliness", function (o) { return cap(primera(o.lp_early)); }],
  ["Laplace señal", function (o) { return o.lp_senal || null; }],
  ["Analysis calidad", function (o) { return o.etf || !o.ficha ? null : o.an_cal || null; }],
  ["Riesgo/deuda", function (o) { return o.etf || !o.ficha || o.an_riesgo === "N/A" ? null : o.an_riesgo || null; }],
  ["RSI", function (o) { return tramo(o.rsi, [30, 45, 55, 70], ["menos de 30", "30 a 44", "45 a 54", "55 a 69", "70 o más"]); }],
  ["ADX", function (o) { return tramo(o.adx, [15, 25, 35], ["menos de 15", "15 a 24", "25 a 34", "35 o más"]); }],
  ["AI", function (o) { return tramo(o.ai, [40, 55, 70], ["menos de 40", "40 a 54", "55 a 69", "70 o más"]); }],
  ["Nota ABC", function (o) { return o.abc || null; }],
  ["Cambio del día anterior", function (o) { return tramo(o.daily, [-2, 0, 0.0000001, 2], ["cayó más de 2 %", "cayó hasta 2 %", "sin cambio", "subió hasta 2 %", "subió más de 2 %"]); }],
  ["20D", function (o) { return tramo(o.d20, [-10, 0, 5, 15], ["menos de −10 %", "−10 % a 0", "0 a 5 %", "5 % a 15 %", "más de 15 %"]); }],
  ["Volumen relativo", function (o) { return tramo(o.rel_vol, [0.8, 1.5], ["menos de 0,8", "0,8 a 1,5", "más de 1,5"]); }],
  ["Precio vs media de 200", function (o) { return esNum(o.sma200_rel) ? (o.sma200_rel >= 0 ? "por encima" : "por debajo") : null; }],
  ["Precio vs media de 50", function (o) { return esNum(o.sma50_rel) ? (o.sma50_rel >= 0 ? "por encima" : "por debajo") : null; }],
  ["Repetición", function (o) { return o.alertas_prev > 0 ? (o.repetida ? "repetida" : "con señales previas, no repetida") : null; }]
];
// Variables que marcan varias cosas a la vez (señales y patrones del Screener)
var MULTI = [
  ["Señal del Screener", function (o) { return o.senales ? o.senales.split("|") : []; }],
  ["Patrón", function (o) { return o.patrones ? o.patrones.split("|") : []; }]
];
function etiquetas(o) {            // ["Variable = valor", …] del ticket
  var out = [];
  for (var i = 0; i < VARIABLES.length; i++) { var v = VARIABLES[i][1](o); if (v !== null && v !== undefined && v !== "") out.push(VARIABLES[i][0] + " = " + v); }
  return out;
}
function etiquetasMulti(o) {
  var out = [];
  MULTI.forEach(function (m) { m[1](o).forEach(function (v) { if (v) out.push(m[0] + " = " + v); }); });
  return out;
}

// items: [{ ret, o (registro) }] → tabla de condiciones y pares de condiciones
function condiciones(items, opciones) {
  opciones = opciones || {};
  var minN = opciones.minN || MIN_CALIFICA, B = base(items.map(function (x) { return x.ret; }));
  var N = B.n, top = B.p90, acc = {}, pares = {};
  function suma(mapa, k, x, esTop) {
    var a = mapa[k] || (mapa[k] = [0, 0, 0, 0, 0]);   // n, positivos, suma, negativos, en el 10 % mejor
    a[0]++; if (x.ret > 0) a[1]++; else if (x.ret < 0) a[3]++; a[2] += Math.min(B.p99, Math.max(B.p01, x.ret)); if (esTop) a[4]++;
  }
  var nTop = 0;
  items.forEach(function (x) {
    var esTop = x.ret >= top && x.ret > 0; if (esTop) nTop++;
    var e = x.et || etiquetas(x.o), em = x.em || etiquetasMulti(x.o);
    e.forEach(function (k) { suma(acc, k, x, esTop); });
    em.forEach(function (k) { suma(acc, k, x, esTop); });
    if (opciones.pares !== false) for (var i = 0; i < e.length; i++) for (var j = i + 1; j < e.length; j++) suma(pares, e[i] + " + " + e[j], x, esTop);
  });
  function fila(k, a, esPar) {
    var n = a[0], p = a[1] / n, p0 = B.pct_pos;
    var varz = n * p0 * (1 - p0) * (N > 1 ? (N - n) / (N - 1) : 1), z = varz > 0 ? (a[1] - n * p0) / Math.sqrt(varz) : null;
    var f = { condicion: k, n: n, frecuencia: n / N, pos: a[1], neg: a[3], pct_pos: p, ventaja: p - p0, media: a[2] / n, z: z,
      entre_ganadores: B.pos ? a[1] / B.pos : null, entre_mejores: nTop ? a[4] / nTop : null,
      sobre_mejores: nTop && n ? (a[4] / nTop) / (n / N) : null };
    if (n < minN) f.lectura = "Muestra insuficiente";
    else if (z >= 2 && f.frecuencia < 0.03) f.lectura = "Poco frecuente, resultado interesante hoy";
    else if (z >= 2) f.lectura = "Mejor que el universo hoy";
    else if (z <= -2 && f.frecuencia >= 0.10) f.lectura = "Frecuente, mal resultado hoy";
    else if (z <= -2) f.lectura = "Peor que el universo hoy";
    else f.lectura = "Como el universo";
    if (esPar) f.par = true;
    return f;
  }
  var tabla = Object.keys(acc).map(function (k) { return fila(k, acc[k], false); });
  tabla.sort(function (a, b) { return (b.z === null ? -99 : b.z) - (a.z === null ? -99 : a.z); });
  var listaPares = [];
  for (var k in pares) if (pares[k][0] >= minN) listaPares.push(fila(k, pares[k], true));
  listaPares.sort(function (a, b) { return b.z - a.z; });
  return { base: { n: N, pos: B.pos, pct_pos: B.pct_pos, mediana: B.mediana, media: B.media, mejores: nTop, corte_mejores: top },
    condiciones: tabla, probadas: tabla.length,
    pares_probados: listaPares.length, pares_mejores: listaPares.slice(0, 25), pares_peores: listaPares.slice(-15).reverse() };
}

// ═══════════════════════════════════════════════════════════════════════
// 5. CONSISTENCIA HISTÓRICA (la unidad es el DÍA, no el ticket)
// ═══════════════════════════════════════════════════════════════════════
var DIAS_INDICIO = 20, DIAS_ROBUSTO = 60;
// dias: registros de data/combos_historial.json
function historico(dias) {
  return COMBOS.map(function (c) {
    var v = [], vm = [], vmean = [], dest = 0, conDatos = 0, acum = 0, acumVent = 0, tickets = 0;
    dias.forEach(function (d) {
      var e = d.combos && d.combos[c.id];
      if (d.destacado && d.destacado.id === c.id) dest++;
      if (!e || !e.n || e.n < MIN_NOTA) return;
      conDatos++; tickets += e.n;
      v.push((e.pct_pos - d.universo.pct_pos) * 100);            // puntos de tasa positiva sobre el universo
      vm.push(e.mediana - d.universo.mediana);
      vmean.push(e.media_sin_ext === null || e.media_sin_ext === undefined ? e.media : e.media_sin_ext);
      acum += vmean[vmean.length - 1]; acumVent += e.mediana - d.universo.mediana;
    });
    var n = v.length, m = media(v), sd = desv(v), t = n >= 2 && sd > 0 ? m / (sd / Math.sqrt(n)) : null;
    var favor = v.filter(function (x) { return x > 0; }).length, pos = vmean.filter(function (x) { return x > 0; }).length;
    var rec = n >= 10 ? media(v.slice(-5)) - media(v.slice(0, n - 5)) : null;
    var lectura;
    if (n < DIAS_INDICIO) lectura = "Historial insuficiente (" + n + " de " + DIAS_INDICIO + " días)";
    else if (n < DIAS_ROBUSTO) lectura = t !== null && t >= 2 ? "En observación: ventaja hasta ahora" : t !== null && t <= -2 ? "En observación: desventaja hasta ahora" : "En observación: sin ventaja clara";
    else if (t !== null && t >= 2 && favor / n >= 0.55) lectura = "Históricamente robusto";
    else if (t !== null && t <= -2) lectura = "Históricamente desfavorable";
    else lectura = "Sin ventaja demostrada";
    return { id: c.id, dias: dias.length, dias_con_datos: n, tickets: tickets, destacado: dest,
      ventaja_media: m, ventaja_desv: sd, t: t, dias_a_favor: favor, dias_en_contra: n - favor,
      dias_positivos: pos, dias_negativos: n - pos, media_diaria: media(vmean), mediana_diaria: vmean.length ? cuantil(ordenar(vmean), 0.5) : null,
      acumulado: acum, ventaja_mediana_acum: acumVent, tendencia: rec, lectura: lectura };
  });
}

return {
  VERSION: VERSION, COMBOS: COMBOS, COMBO_POR_ID: COMBO_POR_ID, CONDICIONES: CONDICIONES, EST_COLS: EST_COLS, ESTRUCTURA: ESTRUCTURA,
  MIN_CALIFICA: MIN_CALIFICA, MIN_NOTA: MIN_NOTA, EXTREMO: EXTREMO, PESOS: PESOS, DIAS_INDICIO: DIAS_INDICIO, DIAS_ROBUSTO: DIAS_ROBUSTO,
  VARIABLES: VARIABLES.map(function (v) { return v[0]; }).concat(MULTI.map(function (v) { return v[0]; })),
  evalCombo: evalCombo, mascaras: mascaras, detalleCombo: detalleCombo, nombresDeMascara: nombresDeMascara,
  registro: registro, aParametros: aParametros, necesitaEma5: necesitaEma5, filaEstado: filaEstado, objetoEstado: objetoEstado,
  sectorIndustria: sectorIndustria, nivelEntrada: nivelEntrada, repetida: repetida, tieneFicha: tieneFicha,
  base: base, estadisticas: estadisticas, calidad: calidad, notasDe: notasDe, bandaAzar: bandaAzar, tablaCombos: tablaCombos, coincidencias: coincidencias,
  condiciones: condiciones, etiquetas: etiquetas, etiquetasMulti: etiquetasMulti, historico: historico,
  mediaAcotada: mediaAcotada, mediaRecortada: mediaRecortada, wilson: wilson, cuantil: cuantil, ordenar: ordenar, media: media, desv: desv, percentilDe: percentilDe
};
});
