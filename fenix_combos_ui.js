/*
 * FENIX SCANNER PRO — Pestañas COMBOS y WIN%DIA
 * ------------------------------------------------------------------
 * Solo lee los archivos data/combos_*.json que genera scripts/combos.js en
 * cada actualización y usa fenix_combos.js para recalcular cuando filtras.
 * No toca ninguna otra pestaña ni ningún otro dato del dashboard.
 */
(function () {
"use strict";
var C = window.FenixCombos;
var SHEETJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
var S = { cargado: false, cargando: null, error: null, dia: null, hist: null, det: null, prev: null, hoy: null, hoyCargando: null,
  modo: "pred", origen: "", fecha: null, combo: "todos", res: "todos", q: "", sector: "", orden: { k: "ret", d: -1 }, limite: 300,
  wRes: "pos", wOrigen: "", wCombo: "todos", wSector: "", wQ: "", wOrden: { k: "ret", d: -1 }, wLimite: 200, cVar: "", cOrden: { k: "z", d: -1 }, cMin: true };

// ── utilidades ──
function esc(v) { return String(v === null || v === undefined ? "" : v).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function num(v, d) { return v === null || v === undefined || !isFinite(v) ? "—" : Number(v).toFixed(d === undefined ? 2 : d); }
function pct(v, d) { return v === null || v === undefined || !isFinite(v) ? "—" : (v * 100).toFixed(d === undefined ? 1 : d) + "%"; }
function sig(v, d) { return v === null || v === undefined || !isFinite(v) ? "—" : (v > 0 ? "+" : "") + Number(v).toFixed(d === undefined ? 2 : d); }
function col(v) { return v > 0 ? "var(--green)" : v < 0 ? "var(--red)" : "var(--txt3)"; }
function ret(v) { return '<span style="color:' + col(v) + ';font-weight:700">' + sig(v, 2) + "%</span>"; }
function fecha(iso) { if (!iso) return "—"; var p = iso.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
function get(u) { return fetch(u + "?v=" + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
function $(id) { return document.getElementById(id); }
function loadScriptOnce(src) {
  return new Promise(function (res, rej) {
    if (window.XLSX) return res();
    var s = document.createElement("script"); s.src = src; s.onload = function () { res(); }; s.onerror = function () { rej(new Error("no se pudo cargar " + src)); };
    document.head.appendChild(s);
  });
}
function idsDe(m) { return C.nombresDeMascara(m); }
function chips(m, ne) {
  var h = idsDe(m).map(function (id) { return '<span class="grade-pill good" title="' + esc(C.COMBO_POR_ID[id].titulo) + '">' + id + "</span>"; }).join(" ");
  if (ne) h += (h ? " " : "") + idsDe(ne).map(function (id) { return '<span class="grade-pill neutral" title="No evaluable: falta un dato">' + id + "?</span>"; }).join(" ");
  return h || '<span style="color:var(--txt3)">—</span>';
}
function notaPill(q) {
  if (q === null || q === undefined) return '<span style="color:var(--txt3)">—</span>';
  var c = q >= 55 ? "excellent" : q >= 50 ? "good" : q >= 45 ? "fair" : "poor";
  return '<span class="grade-pill ' + c + '">' + q.toFixed(1) + "</span>";
}
function seccion(n, titulo, cuerpo, abierta, color) {
  return '<div class="an-section' + (abierta ? " open" : "") + '"><div class="an-section-hdr" onclick="this.parentNode.classList.toggle(\'open\')">' +
    '<div class="an-section-num" style="background:' + (color || "rgba(68,138,255,.15)") + ';color:var(--txt)">' + n + '</div>' +
    '<div class="an-section-title">' + titulo + '</div><div class="an-section-arrow">▶</div></div><div class="an-section-body">' + cuerpo + "</div></div>";
}
function metrica(l, v, c) { return '<div class="ez-metric"><div class="ez-metric-label">' + l + '</div><div class="ez-metric-val" style="' + (c ? "color:" + c : "") + '">' + v + "</div></div>"; }
function nota(t) { return '<div style="color:var(--txt2);font-size:11px;line-height:1.5;margin:6px 0">' + t + "</div>"; }

// ── carga ──
function cargar() {
  if (S.cargado) return Promise.resolve();
  if (S.cargando) return S.cargando;
  S.cargando = Promise.all([get("data/combos_dia.json"), get("data/combos_historial.json"), get("data/combos_estado_prev.json"), get("data/combos_detalle.json")])
    .then(function (r) {
      S.dia = r[0]; S.hist = r[1] || { dias: [] }; S.det = r[3] || { sesiones: {} };
      S.prev = null;
      if (r[2] && r[2].rows) {
        S.prevMeta = r[2]; S.prev = {};
        r[2].rows.forEach(function (f) { var o = C.objetoEstado(r[2].cols, f); S.prev[o.ticker] = o; });
      }
      S.items = [];
      if (S.dia && S.dia.valido && S.dia.rows && S.prev && S.prevMeta.sesion === S.dia.sesion_prev) {
        S.dia.rows.forEach(function (f) {
          var o = S.prev[f[0]]; if (!o) return;
          S.items.push({ t: f[0], ret: f[1], m: o.m, ne: o.ne, mh: f[2], neh: f[3], o: o });
        });
      }
      S.fecha = S.dia ? S.dia.sesion : null;
      S.cargado = true; S.cargando = null;
    }).catch(function (e) { S.error = String(e && e.message || e); S.cargando = null; });
  return S.cargando;
}
function cargarHoy() {
  if (S.hoy) return Promise.resolve();
  if (!S.hoyCargando) S.hoyCargando = get("data/combos_estado.json").then(function (E) {
    S.hoy = {}; S.hoyMeta = E;
    if (E && E.rows) E.rows.forEach(function (f) { var o = C.objetoEstado(E.cols, f); S.hoy[o.ticker] = o; });
  });
  return S.hoyCargando;
}
// Lista de tickets según la lectura elegida
function itemsModo() {
  var l = S.origen ? S.items.filter(function (x) { return x.o.origen === S.origen; }) : S.items;
  if (S.modo === "mismo") return l.map(function (x) { return { t: x.t, ret: x.ret, m: x.mh, ne: x.neh, o: (S.hoy && S.hoy[x.t]) || x.o }; });
  return l;
}
function sectores(items) { var s = {}; items.forEach(function (x) { if (x.o.sector) s[x.o.sector] = 1; }); return Object.keys(s).sort(); }

// ═══════════════════════════ COMBOS ═══════════════════════════
function vacio(id, txt) { $(id).innerHTML = '<div style="padding:40px;text-align:center;color:var(--txt2);line-height:1.7">' + txt + "</div>"; }
function sinDatos(id) {
  var d = S.dia;
  if (S.error) return vacio(id, "No se pudieron leer los datos de combos: " + esc(S.error));
  if (!d) return vacio(id, "Todavía no hay datos de combos.<br>Se generan en la próxima actualización diaria (scripts/combos.js).");
  if (!d.valido) return vacio(id, "Sesión " + fecha(d.sesion) + ": sin evaluación.<br>" + esc(d.motivo || "") );
  return vacio(id, "Los archivos de combos no corresponden a la misma sesión. Se corrige en la próxima actualización.");
}
function controlesCombos() {
  var h = '<span class="ctrl-label" style="color:var(--cyan);font-weight:700">🧩 Combos</span>';
  h += '<span class="ctrl-label">Lectura:</span><select class="ctrl-select" id="cb-modo" title="Predictiva: los combos que cada ticket cumplía al cierre anterior, medidos con el % de hoy. Mismo día: los combos que cumple hoy con el % de hoy (los parámetros ya incluyen el movimiento del día, así que solo describe)."><option value="pred">Cierre anterior → % de hoy</option><option value="mismo">Mismo día (solo describe)</option></select>';
  h += '<span class="ctrl-label">Fecha:</span><select class="ctrl-select" id="cb-fecha"></select>';
  h += '<select class="ctrl-select" id="cb-origen" title="Con qué universo se compara: todos los tickets, solo los de tus grupos o solo el listado completo. Las estadísticas y la Calidad se recalculan contra el universo elegido."><option value="">Todo el universo</option><option value="G">Solo tus grupos</option><option value="L">Solo el listado completo</option></select>';
  h += '<span class="ctrl-label">Combo:</span><select class="ctrl-select" id="cb-combo"><option value="todos">Los seis</option>' + C.COMBOS.map(function (c) { return '<option value="' + c.id + '">Combo ' + c.id + "</option>"; }).join("") + "</select>";
  h += '<span class="ctrl-label">Resultado:</span><select class="ctrl-select" id="cb-res"><option value="todos">Todos</option><option value="pos">Positivos</option><option value="neg">Negativos</option><option value="neu">Neutros</option></select>';
  h += '<select class="ctrl-select" id="cb-sector"><option value="">Todos los sectores</option></select>';
  h += '<input class="ctrl-select" id="cb-q" placeholder="Ticket…" style="width:90px;cursor:text">';
  h += '<select class="ctrl-select" id="cb-fmt"><option value="xlsx">Excel (.xlsx)</option><option value="csv_es">CSV español ( ; )</option><option value="csv">CSV ( , )</option></select>';
  h += '<button id="cb-dl" style="padding:5px 14px;background:var(--cyan);color:#000;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:800;font-family:inherit">Descargar</button>';
  h += '<span style="margin-left:auto;color:var(--txt3);font-size:10px" id="cb-status"></span>';
  return h;
}
function enlazarCombos() {
  var el = $("cb-controls"); if (el.getAttribute("data-ok")) return;
  el.innerHTML = controlesCombos(); el.setAttribute("data-ok", "1");
  $("cb-modo").onchange = function () { S.modo = this.value; (S.modo === "mismo" ? cargarHoy() : Promise.resolve()).then(pintarCombos); };
  $("cb-fecha").onchange = function () { S.fecha = this.value; pintarCombos(); };
  $("cb-origen").onchange = function () { S.origen = this.value; S.limite = 300; pintarCombos(); };
  $("cb-combo").onchange = function () { S.combo = this.value; S.limite = 300; pintarCombos(); };
  $("cb-res").onchange = function () { S.res = this.value; pintarDetalle(); };
  $("cb-sector").onchange = function () { S.sector = this.value; pintarDetalle(); };
  $("cb-q").oninput = function () { S.q = this.value.trim().toUpperCase(); pintarDetalle(); };
  $("cb-dl").onclick = descargarCombos;
}
function tablaDelDia() {
  // Sin filtros de usuario: es la tabla oficial de la sesión
  return C.tablaCombos(itemsModo());
}
function htmlHistorial(dias, H) {
  var hh = '<div style="overflow-x:auto"><table class="an-table"><thead><tr><th>Fecha</th><th>Universo % pos.</th>' + C.COMBOS.map(function (c) { return "<th>Combo " + c.id + "</th>"; }).join("") + "<th>Combo destacado</th></tr></thead><tbody>";
  dias.forEach(function (x) {
    hh += "<tr><td>" + fecha(x.sesion) + (x.parcial ? ' <span class="grade-pill fair" title="Esa noche faltó parte del universo">parcial</span>' : "") + "</td><td>" + pct(x.universo.pct_pos) + " <span style='color:var(--txt3);font-size:10px'>n=" + x.universo.evaluados + "</span></td>" + C.COMBOS.map(function (c) {
      var y = x.combos[c.id]; if (!y || !y.n) return '<td style="color:var(--txt3)">—</td>';
      return "<td>" + pct(y.pct_pos, 0) + ' <span style="color:var(--txt3);font-size:10px">n=' + y.n + "</span> " + notaPill(y.nota) + "</td>"; }).join("") +
      "<td>" + (x.destacado && x.destacado.id ? "<b>Combo " + x.destacado.id + "</b>" : '<span style="color:var(--txt3)">' + esc((x.destacado && x.destacado.texto) || "—") + "</span>") + "</td></tr>";
  });
  hh += "</tbody></table></div>";
  hh += '<div style="overflow-x:auto;margin-top:10px"><table class="an-table"><thead><tr><th>Consistencia histórica</th><th>Sesiones con datos</th><th>Veces destacado</th><th title="Promedio diario de (tasa positiva del combo − tasa del universo)">Ventaja media</th><th>Días a favor</th><th>Días en contra</th><th title="Ventaja media ÷ su error estándar entre días">t</th><th>Rend. medio diario</th><th>Días positivos</th><th>Acumulado</th><th title="Ventaja de las últimas 5 sesiones menos la de las anteriores">Tendencia</th><th>Lectura</th></tr></thead><tbody>';
  H.forEach(function (x) {
    hh += "<tr><td><b>Combo " + x.id + "</b></td><td>" + x.dias_con_datos + " de " + x.dias + "</td><td>" + x.destacado + "</td><td style='color:" + col(x.ventaja_media) + "'>" + (x.ventaja_media === null ? "—" : sig(x.ventaja_media, 1) + " pts") +
      "</td><td>" + x.dias_a_favor + "</td><td>" + x.dias_en_contra + "</td><td>" + (x.t === null ? "—" : sig(x.t, 2)) + "</td><td>" + (x.media_diaria === null ? "—" : ret(x.media_diaria)) + "</td><td>" + x.dias_positivos +
      "</td><td>" + (x.dias_con_datos ? ret(x.acumulado) : "—") + "</td><td>" + (x.tendencia === null ? "—" : sig(x.tendencia, 1) + " pts") + "</td><td>" + esc(x.lectura) + "</td></tr>";
  });
  hh += "</tbody></table></div>";
  hh += nota("Aquí la unidad es el día, no el ticket: los tickets de una misma sesión se mueven juntos, así que la evidencia que cuenta es que la ventaja se repita en sesiones distintas. " +
             "Solo cuentan las sesiones en que el combo tuvo " + C.MIN_NOTA + " tickets o más. Con menos de " + C.DIAS_INDICIO + " sesiones no se opina; con " + C.DIAS_ROBUSTO + " o más y t ≥ 2 se habla de robusto.");
  return seccion("4", "Historial y consistencia de los combos (" + dias.length + " sesión" + (dias.length === 1 ? "" : "es") + ")", hh, true);
}
function pintarCombos() {
  enlazarCombos();
  var dias = (S.hist.dias || []).slice().sort(function (a, b) { return a.sesion < b.sesion ? 1 : -1; });
  if (!S.dia) return sinDatos("cb-content");
  var sel = $("cb-fecha");
  if (!sel.options.length || sel.getAttribute("data-n") !== String(dias.length)) {
    var ops = dias.map(function (d) { return d.sesion; }); if (ops.indexOf(S.dia.sesion) < 0) ops.unshift(S.dia.sesion);
    sel.innerHTML = ops.map(function (s) { return '<option value="' + s + '">' + fecha(s) + "</option>"; }).join(""); sel.setAttribute("data-n", String(dias.length));
  }
  sel.value = S.fecha; $("cb-combo").value = S.combo; $("cb-modo").value = S.modo;
  if (S.fecha !== S.dia.sesion) return pintarFechaPasada();
  if (!S.dia.valido || !S.items.length) {      // sesión sin evaluación: el motivo y, debajo, el historial
    sinDatos("cb-content");
    if (dias.length) $("cb-content").innerHTML += htmlHistorial(dias, C.historico(S.hist.dias || []));
    return;
  }
  var items = itemsModo(), T = tablaDelDia(), B = T.base, d = S.dia, H = C.historico(S.hist.dias || []);
  var ss = $("cb-sector"); if (ss.options.length < 2) ss.innerHTML = '<option value="">Todos los sectores</option>' + sectores(items).map(function (s) { return "<option>" + esc(s) + "</option>"; }).join("");
  $("cb-status").textContent = "Sesión " + fecha(d.sesion) + " · combos del " + fecha(S.modo === "mismo" ? d.sesion : d.sesion_prev) + " · " + B.n + " tickets";
  var h = "";
  // 1. ANÁLISIS DIARIO
  var D = T.destacado, e = D.id ? T.combos.filter(function (x) { return x.id === D.id; })[0] : null;
  var hc = D.id ? H.filter(function (x) { return x.id === D.id; })[0] : null;
  var a = '<div class="ez-body" style="grid-template-columns:repeat(6,1fr)">';
  a += metrica("Fecha de actualización", fecha(d.sesion), "var(--cyan)");
  a += metrica("Tickets analizados" + (S.origen ? (S.origen === "G" ? " (tus grupos)" : " (listado)") : ""), B.n);
  a += metrica("Con rendimiento positivo", B.pos + " <span style='font-size:10px;color:var(--txt3)'>(" + pct(B.pct_pos) + ")</span>", "var(--green)");
  a += metrica("Con rendimiento negativo", B.neg + " <span style='font-size:10px;color:var(--txt3)'>(" + pct(B.pct_neg) + ")</span>", "var(--red)");
  a += metrica("Neutros (0 %)", B.neu);
  a += metrica("Mediana del universo", sig(B.mediana, 2) + "%", col(B.mediana));
  a += "</div>";
  a += '<div class="ez-zone" style="grid-template-columns:repeat(7,1fr)">';
  function zi(l, v) { return '<div class="ez-zone-item"><div class="ez-zone-label">' + l + '</div><div class="ez-zone-val">' + v + "</div></div>"; }
  if (e) {
    a += zi("Combo con mejor comportamiento", '<span style="color:var(--gold)">Combo ' + e.id + "</span>");
    a += zi("Tickets del combo", e.n) + zi("% positivo", pct(e.pct_pos) + ' <span style="font-size:9px;color:var(--txt3)">' + sig(e.ventaja_pos * 100, 1) + " pts</span>");
    a += zi("Rend. promedio", ret(e.media)) + zi("Rend. mediano", ret(e.mediana)) + zi("Rend. acumulado", ret(e.suma));
    a += zi("Calidad", notaPill(e.calidad.nota));
  } else {
    a += '<div class="ez-zone-item" style="grid-column:1 / -1"><div class="ez-zone-label">Combo con mejor comportamiento</div><div class="ez-zone-val" style="color:var(--amber)">' + esc(D.texto) + "</div></div>";
  }
  a += "</div>";
  var lect = "";
  if (e) {
    lect = "<b>Confianza del día:</b> " + esc(e.calidad.nivel) + ". " +
      "<b>Mejor del día no es lo mismo que robusto:</b> " + (hc ? esc(hc.lectura) + " (" + hc.dias_con_datos + " sesión" + (hc.dias_con_datos === 1 ? "" : "es") + " con datos; se necesita un mínimo de " + C.DIAS_INDICIO + " para empezar a opinar y " + C.DIAS_ROBUSTO + " para llamarlo robusto)." : "");
    if (D.empate) lect += " El combo " + D.empate + " queda a menos de 1 punto: empate práctico.";
  } else if (D.indicativo) lect = "El de mejor nota con muestra pequeña fue el combo " + D.indicativo.id + " (" + D.indicativo.n + " tickets, nota " + D.indicativo.nota.toFixed(1) + "): solo indicativo.";
  if (S.modo === "mismo") lect += " <span style='color:var(--amber)'>Lectura del mismo día: los parámetros ya incluyen el movimiento de hoy, así que no dice nada sobre mañana.</span>";
  if (d.aviso_parcial) lect += " <span style='color:var(--amber)'>" + esc(d.aviso_parcial) + "</span>";
  a += '<div style="padding:8px 16px">' + nota(lect) + "</div>";
  h += '<div class="ez-card"><div class="ez-card-hdr"><span class="ez-ticker" style="font-size:13px">ANÁLISIS DIARIO</span><span class="ez-name">' +
       (S.modo === "mismo" ? "combos y % del mismo día" : "combos que cada ticket cumplía al cierre del " + fecha(d.sesion_prev) + " → % diario del " + fecha(d.sesion)) + "</span></div>" + a + "</div>";

  // 2. TABLA PRINCIPAL
  var t = '<div style="overflow-x:auto"><table class="an-table"><thead><tr><th>Combo</th><th>Tickets</th><th>Positivos</th><th>Negativos</th><th>Neutros</th><th>% Positivos</th><th title="Puntos de tasa positiva por encima o por debajo del universo">vs universo</th><th>Rend. promedio</th><th>Mediana</th><th>Acumulado</th><th>Mejor</th><th>Peor</th><th title="Desviación estándar de los % diarios">Desv.</th><th title="Tickets del combo que superan la mediana del universo">Consistencia</th><th title="Fiabilidad de la tasa positiva: 1 − ancho del intervalo de Wilson al 95 %">Muestra</th><th>Calidad</th><th>No evaluables</th></tr></thead><tbody>';
  T.combos.forEach(function (x) {
    var c = C.COMBO_POR_ID[x.id], selx = String(S.combo) === String(x.id);
    t += '<tr style="cursor:pointer' + (selx ? ";background:var(--bg4)" : "") + '" onclick="FenixCombosUI.elegir(' + x.id + ')" title="' + esc(c.titulo) + '">';
    t += '<td><b style="color:var(--cyan)">Combo ' + x.id + "</b>" + (D.id === x.id ? " ⭐" : "") + "</td><td>" + x.n + "</td>";
    if (!x.n) { t += '<td colspan="14" style="color:var(--txt3)">Ningún ticket lo cumplía</td>'; }
    else {
      t += '<td class="up">' + x.pos + '</td><td class="dn">' + x.neg + "</td><td>" + x.neu + "</td>";
      t += "<td><b>" + pct(x.pct_pos) + '</b> <span style="color:var(--txt3);font-size:10px">(' + pct(x.ic_lo, 0) + "–" + pct(x.ic_hi, 0) + ")</span></td>";
      t += '<td style="color:' + col(x.ventaja_pos) + '">' + sig(x.ventaja_pos * 100, 1) + " pts</td>";
      t += "<td>" + ret(x.media) + "</td><td>" + ret(x.mediana) + "</td><td>" + ret(x.suma) + "</td><td>" + ret(x.mejor) + "</td><td>" + ret(x.peor) + "</td>";
      t += "<td>" + num(x.desv, 2) + "</td><td>" + pct(x.supera_mediana) + "</td>";
      t += "<td>" + (x.calidad.fiabilidad === null ? "—" : pct(x.calidad.fiabilidad, 0)) + (x.n < C.MIN_CALIFICA ? ' <span class="grade-pill fair">chica</span>' : "") + "</td>";
      t += "<td>" + notaPill(x.calidad.nota) + "</td>";
    }
    t += '<td style="color:var(--txt3)">' + (x.no_evaluables || 0) + "</td></tr>";
  });
  t += '<tr style="background:var(--bg3)"><td><b>Todo el universo</b></td><td>' + B.n + '</td><td class="up">' + B.pos + '</td><td class="dn">' + B.neg + "</td><td>" + B.neu + "</td><td><b>" + pct(B.pct_pos) +
       "</b></td><td>—</td><td>" + ret(B.media) + "</td><td>" + ret(B.mediana) + "</td><td>—</td><td>" + ret(B.mejor) + "</td><td>" + ret(B.peor) + "</td><td>" + num(B.desv, 2) + "</td><td>50.0%</td><td>—</td><td>" + notaPill(50) + "</td><td>—</td></tr>";
  t += "</tbody></table></div>";
  t += nota("Haz clic en un combo para ver sus tickets. ⭐ = combo destacado del día (mejor Calidad entre los que tienen " + C.MIN_CALIFICA + " tickets o más). " +
            "Calidad: 50 = igual que el universo ese día; por encima, mejor.");
  t += '<details style="margin:4px 0 8px"><summary style="cursor:pointer;color:var(--blue);font-size:11px">Cómo se calcula la Calidad</summary>' + nota(
    "Cuatro notas de 0 a 100, cada una medida contra el universo del mismo día y con el mismo peso (25 %):<br>" +
    "· <b>Tasa positiva</b>: qué parte del margen posible sobre la tasa del universo captura el combo (50 = igual que el universo).<br>" +
    "· <b>Rendimiento</b>: percentil que ocupa el promedio del combo entre los % diarios del universo, comparado con el del promedio del propio universo (valores acotados al 1 %–99 % del universo para que un dato defectuoso no decida).<br>" +
    "· <b>Consistencia</b>: % de tickets del combo que superan la mediana del universo.<br>" +
    "· <b>Robustez</b>: lo mismo que Rendimiento, pero con el promedio sin el 10 % de mejores ni el 10 % de peores tickets: si cae mucho, el resultado dependía de unos pocos.<br>" +
    "Un grupo sacado al azar del universo recibe 50 en las cuatro.<br>" +
    "El <b>tamaño de muestra</b> no suma puntos: multiplica. Fiabilidad = 1 − ancho del intervalo de Wilson (95 %) de la tasa positiva. " +
    "<b>Calidad = 50 + fiabilidad × (promedio de las cuatro notas − 50)</b>. Con pocos tickets la nota se queda cerca de 50. " +
    "Los pesos son iguales porque todavía no hay historial que justifique otros; se revisan con " + C.DIAS_ROBUSTO + " sesiones o más.<br>" +
    "<b>Lo que da el azar</b>: la Calidad que obtienen grupos del mismo tamaño sacados al azar del universo ese día (percentil 5 al 95 de 300 sorteos). Si la nota del combo cae dentro de ese rango, no se distingue de elegir tickets a ciegas.") + "</details>";
  if (T.combos.some(function (x) { return x.calidad && x.calidad.notas; })) {
    t += '<div style="overflow-x:auto"><table class="an-table"><thead><tr><th>Notas de la Calidad</th><th>Tasa positiva</th><th>Rendimiento</th><th>Consistencia</th><th>Robustez</th><th>Promedio</th><th>Fiabilidad</th><th>Calidad</th><th title="Calidad que obtienen grupos del mismo tamaño sacados al azar del universo ese día (del percentil 5 al 95 de 300 sorteos)">Lo que da el azar</th><th>Confianza del día</th><th title="Positivos frente a sacar el mismo número de tickets al azar del universo">z</th></tr></thead><tbody>';
    T.combos.forEach(function (x) {
      if (!x.calidad || !x.calidad.notas) return; var q = x.calidad;
      t += "<tr><td><b>Combo " + x.id + "</b></td><td>" + num(q.notas.tasa, 1) + "</td><td>" + num(q.notas.rendimiento, 1) + "</td><td>" + num(q.notas.consistencia, 1) + "</td><td>" + num(q.notas.robustez, 1) +
           "</td><td>" + num(q.promedio, 1) + "</td><td>" + pct(q.fiabilidad, 0) + "</td><td>" + notaPill(q.nota) + "</td><td style='color:var(--txt2)'>" + (q.azar ? num(q.azar[0], 1) + " a " + num(q.azar[1], 1) : "—") + "</td><td>" + esc(q.nivel) + "</td><td>" + sig(x.z, 2) + "</td></tr>";
    });
    t += "</tbody></table></div>";
  }
  if (T.avisos.length) {
    t += '<div class="flag-list" style="margin-top:10px">' + T.avisos.map(function (w) {
      return '<div class="flag-item warning"><div class="flag-icon">⚠️</div><div class="flag-body"><div class="flag-ticker">Combo ' + w.id + '</div><div class="flag-msg">' + w.avisos.map(esc).join(" · ") + "</div></div></div>"; }).join("") + "</div>";
  }
  h += seccion("1", "Los seis combos frente al universo", t, true);
  h += '<div id="cb-detalle"></div>';

  // 4. COINCIDENCIAS
  var co = C.coincidencias(items), m = '<div style="overflow-x:auto"><table class="an-table"><thead><tr><th>Tickets en común</th>' + C.COMBOS.map(function (c) { return "<th>Combo " + c.id + "</th>"; }).join("") + "</tr></thead><tbody>";
  C.COMBOS.forEach(function (c1) {
    m += "<tr><td><b>Combo " + c1.id + "</b></td>" + C.COMBOS.map(function (c2) {
      if (c1.id === c2.id) return '<td style="color:var(--txt3)">' + co.n[c1.id] + "</td>";
      var p = co.pares.filter(function (x) { return (x.a === c1.id && x.b === c2.id) || (x.a === c2.id && x.b === c1.id); })[0];
      return "<td" + (p.comunes ? ' style="color:var(--cyan);font-weight:700"' : ' style="color:var(--txt3)"') + ">" + p.comunes + "</td>"; }).join("") + "</tr>";
  });
  m += "</tbody></table></div>";
  m += '<div style="overflow-x:auto;margin-top:8px"><table class="an-table"><thead><tr><th>Par</th><th>En común</th><th title="Parte del combo más chico que también está en el otro">Contención</th><th title="Veces lo esperado si fueran independientes">Lift</th><th>Relación hoy</th></tr></thead><tbody>' +
    co.pares.filter(function (p) { return p.na && p.nb; }).map(function (p) {
      return "<tr><td>" + p.a + " y " + p.b + "</td><td>" + p.comunes + "</td><td>" + pct(p.contencion, 0) + "</td><td>" + num(p.lift, 1) + "×</td><td>" + esc(p.relacion) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  m += nota("Tickets que cumplían un solo combo: " + co.por_cantidad[1] + " · dos: " + co.por_cantidad[2] + " · tres o más: " + co.por_cantidad[3] + ". " +
            "Cada ticket cuenta en todos los combos que cumple.") + nota("<b>Por definición:</b> " + C.ESTRUCTURA.map(function (x) { return esc(x.texto); }).join(" "));
  h += seccion("3", "Tickets que cumplen varios combos", m, false);

  // 5. HISTORIAL
  h += htmlHistorial(dias, H);

  // 6. COBERTURA
  var u = d.universo, cp = (d.cobertura && d.cobertura.prev) || {}, e5 = cp.ema5 || {};
  var cb = '<table class="an-table"><tbody>';
  function fila(a2, b2) { cb += "<tr><td style='white-space:normal'>" + a2 + "</td><td style='white-space:normal'>" + b2 + "</td></tr>"; }
  var ch = (d.cobertura && d.cobertura.hoy) || {};
  fila("Universo de la sesión", u.filas + " tickets = " + (ch.de_grupos || 0) + " de tus grupos + " + (ch.de_listado || 0) + " del listado completo · evaluados " + u.evaluados);
  fila("Fuera del cálculo", u.sin_vela_hoy + " sin la vela de hoy · " + u.sin_vela_prev + " sin la vela anterior · " + u.nuevos + " nuevas · " + (u.desaparecidos || 0) + " que ya no están");
  fila("Cierre anterior coherente con el % diario", pct(u.coherencia) + " de los tickets (prueba de que la sesión guardada es la anterior)");
  fila("Ficha fundamental (Calidad EXCELENTE, combos 3 y 16)", (cp.con_ficha || 0) + " tickets con ficha · " + (cp.acciones_sin_ficha || 0) + " acciones sin ficha (no evaluables) · " + (cp.etf || 0) + " ETF (la Calidad no aplica)");
  fila("Velas de 5 minutos (combo 15)", e5.calculado ? e5.con_dato + " de " + e5.pedidos + " tickets con Laplace avoid + Markov Bullish" + (e5.bloqueado ? " · descarga interrumpida" : "") : "no se descargaron para esa sesión: el combo 15 queda sin evaluar");
  fila("Anti-repetición (combos 11, 14 y 16)", "Repetida = el ticket ya tuvo una señal y su nivel de entrada de hoy supera en más de 1,5 % la entrada más baja de esas señales (fórmula de tu columna BI con el historial de alertas)");
  fila("Valores extremos", "Se marca todo % diario de ±" + C.EXTREMO + " % o más (posible split o dato defectuoso). No se eliminan: la Calidad los acota al 1 %–99 % del universo");
  cb += "</tbody></table>";
  h += seccion("5", "Cobertura de datos y límites", cb, false);
  $("cb-content").innerHTML = h;
  pintarDetalle();
}

var DET_COLS = [
  ["t", "Ticket"], ["ret", "% Diario"], ["estado", "Estado"], ["m", "Combos"], ["sector", "Sector"], ["gt_fase", "Fase"], ["lp_early", "Earliness"], ["lp_tend", "Tendencia"],
  ["lp_estab", "Estabilidad"], ["lp_senal", "Lp señal"], ["mk_score", "Markov"], ["mk_estado", "Mk estado"], ["ez_cal", "Calidad"], ["gt_comp", "Composite"],
  ["ez_up", "Upside"], ["gt_nash", "Nash"], ["h_clase", "Hessian"], ["m5_20", "5m Ema20"], ["m5_200", "5m Ema200"], ["repetida", "Repetida"], ["close", "Cierre"]
];
function valor(x, k) { if (k === "t") return x.t; if (k === "ret") return x.ret; if (k === "m") return x.m; if (k === "estado") return x.ret > 0 ? 1 : x.ret < 0 ? -1 : 0; return x.o[k]; }
function ordenar(lista, ord) {
  var k = ord.k, d = ord.d;
  return lista.slice().sort(function (a, b) {
    var x = valor(a, k), y = valor(b, k);
    if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * d;
  });
}
function filtrados() {
  var items = itemsModo(), bit = S.combo === "todos" ? 0 : C.COMBO_POR_ID[S.combo].bit;
  return items.filter(function (x) {
    if (bit ? !(x.m & bit) : !x.m) return false;
    if (S.res === "pos" && !(x.ret > 0)) return false;
    if (S.res === "neg" && !(x.ret < 0)) return false;
    if (S.res === "neu" && x.ret !== 0) return false;
    if (S.sector && x.o.sector !== S.sector) return false;
    if (S.q && x.t.indexOf(S.q) !== 0) return false;
    return true;
  });
}
var DE_FICHA = { ez_cal: 1, gt_comp: 1, an_roe: 1, an_roa: 1, an_eps: 1, an_cal: 1, an_riesgo: 1 };
function sinFicha(o, k) { return DE_FICHA[k] && !o.etf && !o.ficha; }
var SF = '<span style="color:var(--txt3)" title="Acción sin ficha fundamental cargada: el sistema no puede calcular este dato">sin ficha</span>';
function celda(x, k) {
  var v = valor(x, k);
  if (sinFicha(x.o, k)) return SF;
  if (k === "t") return '<b style="color:var(--cyan)">' + esc(v) + "</b>" + (x.o.alerta ? ' <span title="Fue señal de Fenix ese día">🔔</span>' : "");
  if (k === "ret") return ret(v) + (Math.abs(v) >= C.EXTREMO ? ' <span title="Valor extremo: posible split o dato defectuoso">⚠️</span>' : "");
  if (k === "estado") return v > 0 ? '<span class="grade-pill excellent">Positivo</span>' : v < 0 ? '<span class="grade-pill poor">Negativo</span>' : '<span class="grade-pill neutral">Neutro</span>';
  if (k === "m") return chips(x.m, x.ne);
  if (k === "ez_up" || k === "gt_nash") return v === null ? "—" : pct(v, k === "ez_up" ? 1 : 0);
  if (k === "repetida") return x.o.alertas_prev ? (v ? "Sí" : "No") + ' <span style="color:var(--txt3);font-size:10px">(' + x.o.alertas_prev + ")</span>" : '<span style="color:var(--txt3)">—</span>';
  if (k === "mk_score" || k === "close" || k === "m5_20" || k === "m5_200") return v === null || v === undefined ? "—" : num(v, 2);
  return v === null || v === undefined || v === "" ? '<span style="color:var(--txt3)">—</span>' : esc(v);
}
function pintarDetalle() {
  var el = $("cb-detalle"); if (!el) return;
  var lista = ordenar(filtrados(), S.orden), items = itemsModo(), B = C.base(items.map(function (x) { return x.ret; }));
  var st = C.estadisticas(lista.map(function (x) { return x.ret; }), B, false), h = "";
  if (S.combo !== "todos") {
    var c = C.COMBO_POR_ID[S.combo];
    h += '<div style="margin-bottom:8px"><b style="color:var(--cyan)">Combo ' + c.id + "</b> · " + esc(c.titulo) + "</div>";
    h += '<div style="overflow-x:auto"><table class="an-table"><thead><tr><th>Condición (punto 8 del informe)</th><th>Columna de la hoja</th><th>Tickets del universo que la cumplen</th><th>No evaluables</th></tr></thead><tbody>' + c.cond.map(function (k) {
      var cd = C.CONDICIONES[k], si = 0, ne = 0;
      items.forEach(function (x) { var v = cd.f(C.aParametros(x.o)); if (v === true) si++; else if (v === null) ne++; });
      return "<tr><td>" + esc(cd.texto) + "</td><td style='color:var(--txt2)'>" + esc(cd.columna) + "</td><td>" + si + " <span style='color:var(--txt3);font-size:10px'>(" + pct(si / items.length) + ")</span></td><td style='color:var(--txt3)'>" + ne + "</td></tr>"; }).join("") + "</tbody></table></div>";
    h += nota("Muestra del informe para este combo: " + c.ranking.muestra + " operaciones cerradas (" + c.ranking.win + " WIN, " + c.ranking.loss + " LOSS). Aquí se mide otra cosa: el % diario de la sesión siguiente en todo el universo.");
  }
  h += '<div style="margin:8px 0;color:var(--txt2)">' + lista.length + " ticket" + (lista.length === 1 ? "" : "s") + (lista.length ? " · positivos " + st.pos + " (" + pct(st.pct_pos) + ") · negativos " + st.neg + " · mediana " + sig(st.mediana, 2) + "% · promedio " + sig(st.media, 2) + "%" : "") + "</div>";
  h += '<div style="overflow-x:auto"><table class="an-table"><thead><tr><th>Fecha</th>' + DET_COLS.map(function (cc) {
    return '<th style="cursor:pointer' + (S.orden.k === cc[0] ? ";color:var(--cyan)" : "") + '" onclick="FenixCombosUI.ordenar(\'' + cc[0] + "')\">" + cc[1] + (S.orden.k === cc[0] ? (S.orden.d > 0 ? " ▲" : " ▼") : "") + "</th>"; }).join("") + "</tr></thead><tbody>";
  lista.slice(0, S.limite).forEach(function (x) {
    h += "<tr><td style='color:var(--txt3)'>" + fecha(S.dia.sesion) + "</td>" + DET_COLS.map(function (cc) { return "<td>" + celda(x, cc[0]) + "</td>"; }).join("") + "</tr>";
  });
  if (!lista.length) h += '<tr><td colspan="' + (DET_COLS.length + 1) + '" style="color:var(--txt3);padding:16px">Ningún ticket con esos filtros.</td></tr>';
  h += "</tbody></table></div>";
  if (lista.length > S.limite) h += '<div style="padding:8px"><button class="ctrl-select" onclick="FenixCombosUI.mas()">Mostrar ' + Math.min(300, lista.length - S.limite) + " más (" + (lista.length - S.limite) + " restantes)</button></div>";
  h += nota("Los parámetros son los del cierre " + (S.modo === "mismo" ? "de hoy" : "anterior (lo que se sabía antes del movimiento)") + ". Combos con «?» = no evaluable por falta de un dato. 🔔 = además fue señal de Fenix.");
  // Cumplen hoy
  h += '<div style="margin-top:10px"><button class="ctrl-select" onclick="FenixCombosUI.verHoy()">Ver los tickets que cumplen hoy (se evalúan con la próxima sesión)</button><div id="cb-hoy"></div></div>';
  el.innerHTML = seccion("2", S.combo === "todos" ? "Tickets que cumplían algún combo" : "Tickets del combo " + S.combo, h, true, "rgba(0,229,255,.15)");
}
function verHoy() {
  cargarHoy().then(function () {
    var bit = S.combo === "todos" ? 0 : C.COMBO_POR_ID[S.combo].bit, l = [];
    for (var t in S.hoy) { var o = S.hoy[t]; if (!o.stale && (bit ? (o.m & bit) : o.m)) l.push(o); }
    l.sort(function (a, b) { return a.ticker < b.ticker ? -1 : 1; });
    var h = '<div style="margin:8px 0;color:var(--txt2)">' + l.length + " tickets cumplen " + (bit ? "el combo " + S.combo : "algún combo") + " al cierre del " + fecha(S.hoyMeta && S.hoyMeta.sesion) + ". Todavía no tienen resultado.</div>";
    h += '<div style="overflow-x:auto;max-height:340px;overflow-y:auto"><table class="an-table"><thead><tr><th>Ticket</th><th>Combos</th><th>Sector</th><th>Fase</th><th>Earliness</th><th>Tendencia</th><th>Estabilidad</th><th>Markov</th><th>Calidad</th><th>Cierre</th></tr></thead><tbody>' +
      l.slice(0, 600).map(function (o) { return "<tr><td><b style='color:var(--cyan)'>" + esc(o.ticker) + "</b></td><td>" + chips(o.m, o.ne) + "</td><td>" + esc(o.sector) + "</td><td>" + esc(o.gt_fase) + "</td><td>" + esc(o.lp_early) + "</td><td>" + esc(o.lp_tend) + "</td><td>" + esc(o.lp_estab) + "</td><td>" + num(o.mk_score, 2) + "</td><td>" + esc(o.ez_cal) + "</td><td>" + num(o.close, 2) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    $("cb-hoy").innerHTML = h;
  });
}
// Fechas anteriores: resumen guardado + tickets de cada combo (sin parámetros completos)
function pintarFechaPasada() {
  var x = (S.hist.dias || []).filter(function (d) { return d.sesion === S.fecha; })[0];
  if (!x) return vacio("cb-content", "No hay registro de la sesión " + fecha(S.fecha) + ".");
  $("cb-status").textContent = "Sesión " + fecha(x.sesion) + " · combos del " + fecha(x.sesion_prev) + " · " + x.universo.evaluados + " tickets";
  var h = '<div class="ez-card"><div class="ez-card-hdr"><span class="ez-ticker" style="font-size:13px">ANÁLISIS DIARIO</span><span class="ez-name">' + fecha(x.sesion_prev) + " → " + fecha(x.sesion) + '</span></div><div class="ez-body">' +
    metrica("Tickets analizados", x.universo.evaluados) + metrica("Positivos", x.universo.pos + " (" + pct(x.universo.pct_pos) + ")", "var(--green)") + metrica("Negativos", x.universo.neg, "var(--red)") +
    metrica("Mediana del universo", sig(x.universo.mediana, 2) + "%") + metrica("Combo destacado", x.destacado && x.destacado.id ? "Combo " + x.destacado.id : "—", "var(--gold)") + metrica("Calidad", x.destacado && x.destacado.nota ? x.destacado.nota.toFixed(1) : "—") + "</div></div>";
  var t = '<table class="an-table"><thead><tr><th>Combo</th><th>Tickets</th><th>Positivos</th><th>Negativos</th><th>% Positivos</th><th>vs universo</th><th>Rend. promedio</th><th>Mediana</th><th>Acumulado</th><th>Mejor</th><th>Peor</th><th>Calidad</th></tr></thead><tbody>';
  C.COMBOS.forEach(function (c) {
    var y = x.combos[c.id] || { n: 0 };
    t += "<tr><td><b style='color:var(--cyan)'>Combo " + c.id + "</b></td><td>" + (y.n || 0) + "</td>" + (y.n ? '<td class="up">' + y.pos + '</td><td class="dn">' + y.neg + "</td><td>" + pct(y.pct_pos) + "</td><td>" + sig(y.ventaja_pos * 100, 1) + " pts</td><td>" + ret(y.media) + "</td><td>" + ret(y.mediana) + "</td><td>" + ret(y.suma) + "</td><td>" + ret(y.mejor) + "</td><td>" + ret(y.peor) + "</td><td>" + notaPill(y.nota) + "</td>" : '<td colspan="10" style="color:var(--txt3)">Ningún ticket</td>') + "</tr>";
  });
  t += "</tbody></table>";
  h += seccion("1", "Los seis combos frente al universo", t, true);
  var ds = S.det.sesiones && S.det.sesiones[S.fecha], bit = S.combo === "todos" ? 0 : C.COMBO_POR_ID[S.combo].bit, r = "";
  if (ds) {
    var l = ds.rows.filter(function (f) { return (bit ? (f[2] & bit) : f[2]) && (!S.q || f[0].indexOf(S.q) === 0) && (S.res === "todos" || (S.res === "pos" ? f[1] > 0 : S.res === "neg" ? f[1] < 0 : f[1] === 0)); })
      .sort(function (a, b) { return b[1] - a[1]; });
    r = '<div style="color:var(--txt2);margin-bottom:6px">' + l.length + " tickets</div><div style='overflow-x:auto'><table class='an-table'><thead><tr><th>Ticket</th><th>Fecha</th><th>Combos</th><th>% Diario</th><th>Estado</th></tr></thead><tbody>" +
      l.slice(0, 800).map(function (f) { return "<tr><td><b style='color:var(--cyan)'>" + esc(f[0]) + "</b></td><td>" + fecha(S.fecha) + "</td><td>" + chips(f[2], 0) + "</td><td>" + ret(f[1]) + "</td><td>" + (f[1] > 0 ? "Positivo" : f[1] < 0 ? "Negativo" : "Neutro") + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      nota("De las sesiones anteriores se guardan los tickets de cada combo y su % diario. Los parámetros completos solo se conservan para la última sesión (y quedan en el historial del repositorio).");
  } else r = nota("El detalle de tickets se conserva para las últimas 60 sesiones.");
  h += seccion("2", "Tickets de la sesión", r, true, "rgba(0,229,255,.15)");
  $("cb-content").innerHTML = h;
}

// ═══════════════════════════ WIN%DIA ═══════════════════════════
var WIN_GRUPOS = [
  ["Ticket", [["ticker", "Ticket"], ["nombre", "Nombre"], ["origen", "Origen"], ["grupo", "Grupo"], ["sector", "Sector"], ["industria", "Industry"]]],
  ["Resultado", [["ret", "% Diario"], ["combos", "Combos que cumplía"], ["no_eval", "Combos no evaluables"], ["alerta", "Señal Fenix"]]],
  ["Radar / Screener", [["close", "Cierre anterior"], ["estado", "Estado"], ["score", "Score"], ["ai", "AI"], ["abc", "ABC"], ["rsi", "RSI"], ["adx", "ADX"], ["ext", "Ext"],
    ["rel_vol", "Vol rel"], ["daily", "% día anterior"], ["d5", "5D"], ["d20", "20D"], ["atr", "ATR"], ["rs_rank", "RS rank"], ["sma50_rel", "vs SMA50"], ["sma200_rel", "vs SMA200"],
    ["from_hi52", "Desde máx 52s"], ["senales", "Señales"], ["patrones", "Patrones"]]],
  ["Hessian", [["h_clase", "Clase"], ["h_fxx", "F_XX"], ["h_fyy", "F_YY"], ["h_det", "Det(h)"], ["h_curv", "Curvatura"], ["h_senal", "Señal"]]],
  ["Markov", [["mk_score", "Score"], ["mk_estado", "Estado / Signal"], ["mk_abs", "Absorcion"], ["mk_estac", "Estacionaria"]]],
  ["Game Theory", [["gt_nash", "Nash"], ["gt_comp", "Composite"], ["gt_rr", "R/R"], ["gt_fase", "Fase"], ["gt_eq", "Nash Esquilibrium"]]],
  ["Entry Zones", [["ez_prob", "Prob"], ["ez_up", "Upside"], ["ez_20d", "20D"], ["ez_cal", "Calidad"]]],
  ["Analysis", [["an_roe", "Roe"], ["an_roa", "Roa"], ["an_eps", "Eps"], ["an_cal", "Calidad"], ["an_riesgo", "Riesgo/deuda"]]],
  ["Laplace", [["lp_tend", "Tendencia"], ["lp_estab", "Estabilidad"], ["lp_early", "Eariness"], ["lp_score", "Lp Score"], ["lp_senal", "Señal"]]],
  ["Otros", [["m5_20", "5m Dis Ema 20"], ["m5_200", "5m Dis Ema 200"], ["entrada", "Nivel de entrada"], ["repetida", "Repetida"], ["alertas_prev", "Señales previas"], ["ficha", "Ficha fundamental"]]]
];
var WIN_PANTALLA = ["ticker", "ret", "combos", "sector", "estado", "score", "ai", "rsi", "daily", "d20", "h_clase", "mk_score", "mk_estado", "gt_nash", "gt_comp", "gt_fase",
  "ez_prob", "ez_up", "ez_cal", "an_cal", "lp_tend", "lp_estab", "lp_early", "lp_score", "lp_senal", "senales", "patrones", "close"];
var ABREV = { "Hessian": "H", "Markov": "Mk", "Game Theory": "GT", "Entry Zones": "EZ", "Analysis": "An", "Laplace": "Lp" };
var WIN_TIT = {}; WIN_GRUPOS.forEach(function (g) { g[1].forEach(function (c) { WIN_TIT[c[0]] = (ABREV[g[0]] ? ABREV[g[0]] + " · " : "") + c[1]; }); });
var FRACC = { gt_nash: 1, ez_prob: 1, ez_up: 1, ez_20d: 1, mk_abs: 1 };
function wValor(x, k) {
  if (k === "ret") return x.ret; if (k === "ticker") return x.t;
  if (k === "combos") return idsDe(x.m).join(", "); if (k === "no_eval") return idsDe(x.ne).join(", ");
  if (k === "repetida") return x.o.alertas_prev ? (x.o.repetida ? "Sí" : "No") : "";
  if (k === "alerta" || k === "ficha") return x.o[k] ? "Sí" : "No";
  if (k === "origen") return x.o.origen === "G" ? "Tus grupos" : "Listado completo";
  return x.o[k];
}
function wCelda(x, k) {
  var v = wValor(x, k);
  if (sinFicha(x.o, k)) return SF;
  if (k === "ticker") return '<b style="color:var(--cyan)">' + esc(v) + "</b>" + (x.o.alerta ? " 🔔" : "");
  if (k === "ret") return ret(v) + (Math.abs(v) >= C.EXTREMO ? " ⚠️" : "");
  if (k === "combos") return chips(x.m, x.ne);
  if (FRACC[k]) return v === null || v === undefined ? "—" : pct(v, 1);
  if (k === "daily" || k === "d5" || k === "d20") return v === null || v === undefined ? "—" : '<span style="color:' + col(v) + '">' + sig(v, 2) + "%</span>";
  if (typeof v === "number") return num(v, Math.abs(v) < 10 && v % 1 ? 2 : (v % 1 ? 1 : 0));
  if (k === "senales" || k === "patrones") return v ? '<span style="color:var(--txt2)">' + esc(String(v).replace(/\|/g, ", ")) + "</span>" : "—";
  return v === null || v === undefined || v === "" ? '<span style="color:var(--txt3)">—</span>' : esc(v);
}
function wFiltrados() {
  var bit = S.wCombo === "todos" ? 0 : S.wCombo === "alguno" ? -1 : C.COMBO_POR_ID[S.wCombo].bit;
  return S.items.filter(function (x) {
    if (S.wRes === "pos" && !(x.ret > 0)) return false;
    if (S.wRes === "neg" && !(x.ret < 0)) return false;
    if (S.wRes === "neu" && x.ret !== 0) return false;
    if (bit === -1 ? !x.m : bit ? !(x.m & bit) : false) return false;
    if (S.wOrigen && x.o.origen !== S.wOrigen) return false;
    if (S.wSector && x.o.sector !== S.wSector) return false;
    if (S.wQ && x.t.indexOf(S.wQ) !== 0) return false;
    return true;
  });
}
function wOrdenar(l) {
  var k = S.wOrden.k, d = S.wOrden.d;
  return l.slice().sort(function (a, b) {
    var x = wValor(a, k), y = wValor(b, k);
    if (x === null || x === undefined || x === "") return 1; if (y === null || y === undefined || y === "") return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * d;
  });
}
function enlazarWin() {
  var el = $("wd-controls"); if (el.getAttribute("data-ok")) return;
  var h = '<span class="ctrl-label" style="color:var(--green);font-weight:700">✅ WIN%DIA</span>';
  h += '<span class="ctrl-label">Mostrar:</span><select class="ctrl-select" id="wd-res"><option value="pos">Positivos del día</option><option value="neg">Negativos</option><option value="neu">Neutros</option><option value="todos">Todos</option></select>';
  h += '<span class="ctrl-label">Combo:</span><select class="ctrl-select" id="wd-combo"><option value="todos">Con o sin combo</option><option value="alguno">Con algún combo</option>' + C.COMBOS.map(function (c) { return '<option value="' + c.id + '">Combo ' + c.id + "</option>"; }).join("") + "</select>";
  h += '<select class="ctrl-select" id="wd-origen"><option value="">Todo el universo</option><option value="G">Solo tus grupos</option><option value="L">Solo el listado completo</option></select>';
  h += '<select class="ctrl-select" id="wd-sector"><option value="">Todos los sectores</option></select>';
  h += '<input class="ctrl-select" id="wd-q" placeholder="Ticket…" style="width:90px;cursor:text">';
  h += '<select class="ctrl-select" id="wd-fmt"><option value="xlsx">Excel (.xlsx)</option><option value="csv_es">CSV español ( ; )</option><option value="csv">CSV ( , )</option></select>';
  h += '<button id="wd-dl" style="padding:5px 14px;background:var(--green);color:#000;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:800;font-family:inherit">Descargar</button>';
  h += '<span style="margin-left:auto;color:var(--txt3);font-size:10px" id="wd-status"></span>';
  el.innerHTML = h; el.setAttribute("data-ok", "1");
  $("wd-res").onchange = function () { S.wRes = this.value; S.wLimite = 200; pintarWinTabla(); };
  $("wd-combo").onchange = function () { S.wCombo = this.value; S.wLimite = 200; pintarWinTabla(); };
  $("wd-origen").onchange = function () { S.wOrigen = this.value; S.wLimite = 200; pintarWinTabla(); };
  $("wd-sector").onchange = function () { S.wSector = this.value; pintarWinTabla(); };
  $("wd-q").oninput = function () { S.wQ = this.value.trim().toUpperCase(); pintarWinTabla(); };
  $("wd-dl").onclick = descargarWin;
}
function pintarWin() {
  enlazarWin();
  if (!S.dia || !S.dia.valido || !S.items.length) return sinDatos("wd-content");
  var d = S.dia, u = d.universo;
  var ss = $("wd-sector"); if (ss.options.length < 2) ss.innerHTML = '<option value="">Todos los sectores</option>' + sectores(S.items).map(function (s) { return "<option>" + esc(s) + "</option>"; }).join("");
  $("wd-status").textContent = "Sesión " + fecha(d.sesion) + " · parámetros del cierre del " + fecha(d.sesion_prev);
  var h = '<div class="ez-card"><div class="ez-card-hdr"><span class="ez-ticker" style="font-size:13px">GANADORES DEL DÍA</span><span class="ez-name">% diario del ' + fecha(d.sesion) + " con todo lo que el sistema decía de cada ticket al cierre del " + fecha(d.sesion_prev) + '</span></div><div class="ez-body">' +
    metrica("Tickets analizados", u.evaluados) + metrica("Positivos", u.pos + " <span style='font-size:10px;color:var(--txt3)'>(" + pct(u.pct_pos) + ")</span>", "var(--green)") + metrica("Negativos", u.neg, "var(--red)") + metrica("Neutros", u.neu) +
    metrica("Mediana del universo", sig(u.mediana, 2) + "%", col(u.mediana)) + metrica("Positivos con algún combo", S.items.filter(function (x) { return x.ret > 0 && x.m; }).length, "var(--cyan)") + "</div></div>";
  h += '<div id="wd-tabla"></div><div id="wd-cond"></div>';
  $("wd-content").innerHTML = h;
  pintarWinTabla(); pintarCond();
}
function pintarWinTabla() {
  var el = $("wd-tabla"); if (!el) return;
  var l = wOrdenar(wFiltrados());
  var h = '<div style="color:var(--txt2);margin-bottom:6px">' + l.length + " tickets · la tabla muestra las columnas principales; la descarga trae todas (" + WIN_GRUPOS.reduce(function (a, g) { return a + g[1].length; }, 0) + ")</div>";
  h += '<div style="overflow:auto;max-height:560px"><table class="an-table"><thead><tr>' + WIN_PANTALLA.map(function (k) {
    return '<th style="cursor:pointer;position:sticky;top:0' + (S.wOrden.k === k ? ";color:var(--cyan)" : "") + '" onclick="FenixCombosUI.wOrdenar(\'' + k + "')\">" + esc(WIN_TIT[k]) + (S.wOrden.k === k ? (S.wOrden.d > 0 ? " ▲" : " ▼") : "") + "</th>"; }).join("") + "</tr></thead><tbody>";
  l.slice(0, S.wLimite).forEach(function (x) { h += "<tr>" + WIN_PANTALLA.map(function (k) { return "<td>" + wCelda(x, k) + "</td>"; }).join("") + "</tr>"; });
  if (!l.length) h += '<tr><td colspan="' + WIN_PANTALLA.length + '" style="color:var(--txt3);padding:16px">Ningún ticket con esos filtros.</td></tr>';
  h += "</tbody></table></div>";
  if (l.length > S.wLimite) h += '<div style="padding:8px"><button class="ctrl-select" onclick="FenixCombosUI.wMas()">Mostrar 300 más (' + (l.length - S.wLimite) + " restantes)</button></div>";
  var tit = { pos: "Tickets con rendimiento positivo", neg: "Tickets con rendimiento negativo", neu: "Tickets sin cambio", todos: "Todos los tickets evaluados" }[S.wRes];
  el.innerHTML = seccion("1", tit, h, true, "rgba(0,230,118,.15)");
}
var COND_COLS = [["condicion", "Condición"], ["n", "Tickets"], ["frecuencia", "% del universo"], ["pct_pos", "% positivos"], ["ventaja", "vs universo"], ["media", "Rend. medio"],
  ["entre_ganadores", "% de los ganadores"], ["sobre_mejores", "Presencia en el 10 % mejor"], ["z", "z"], ["dias", "Días a favor"], ["lectura", "Lectura"]];
function persistencia() {     // días en que cada condición quedó por encima del universo
  var out = {};
  (S.hist.dias || []).forEach(function (d) {
    if (!d.cond) return;
    for (var k in d.cond) { var a = d.cond[k], o = out[k] || (out[k] = [0, 0]); o[1]++; if (a[1] / a[0] > d.universo.pct_pos) o[0]++; }
  });
  return out;
}
function pintarCond() {
  var el = $("wd-cond"); if (!el) return;
  if (!S.cond) S.cond = C.condiciones(S.items);
  var cd = S.cond, per = persistencia(), vars = {};
  cd.condiciones.forEach(function (f) { vars[f.condicion.split(" = ")[0]] = 1; });
  var l = cd.condiciones.filter(function (f) { return (!S.cVar || f.condicion.indexOf(S.cVar + " = ") === 0) && (!S.cMin || f.n >= C.MIN_CALIFICA); });
  l.forEach(function (f) { var p = per[f.condicion]; f.dias = p ? p[0] / p[1] : null; f._dias = p; });
  var k = S.cOrden.k, dd = S.cOrden.d;
  l.sort(function (a, b) { var x = a[k], y = b[k]; if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1; return (x < y ? -1 : x > y ? 1 : 0) * dd; });
  var azar = Math.round(cd.probadas * 0.0455);
  var h = '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px"><span class="ctrl-label">Variable:</span><select class="ctrl-select" onchange="FenixCombosUI.cVar(this.value)"><option value="">Todas</option>' +
    Object.keys(vars).sort().map(function (v) { return "<option" + (S.cVar === v ? " selected" : "") + ">" + esc(v) + "</option>"; }).join("") + '</select>' +
    '<label style="color:var(--txt2);cursor:pointer"><input type="checkbox"' + (S.cMin ? " checked" : "") + ' onchange="FenixCombosUI.cMin(this.checked)"> solo con ' + C.MIN_CALIFICA + " tickets o más</label></div>";
  h += '<div style="overflow:auto;max-height:520px"><table class="an-table"><thead><tr>' + COND_COLS.map(function (c) {
    return '<th style="cursor:pointer;position:sticky;top:0' + (S.cOrden.k === c[0] ? ";color:var(--cyan)" : "") + '" onclick="FenixCombosUI.cOrdenar(\'' + c[0] + "')\">" + c[1] + (S.cOrden.k === c[0] ? (S.cOrden.d > 0 ? " ▲" : " ▼") : "") + "</th>"; }).join("") + "</tr></thead><tbody>";
  l.forEach(function (f) {
    var cl = f.lectura.indexOf("interesante") >= 0 || f.lectura.indexOf("Mejor") >= 0 ? "good" : f.lectura.indexOf("mal") >= 0 || f.lectura.indexOf("Peor") >= 0 ? "poor" : "neutral";
    h += "<tr><td>" + esc(f.condicion) + "</td><td>" + f.n + "</td><td>" + pct(f.frecuencia) + "</td><td><b>" + pct(f.pct_pos) + "</b></td><td style='color:" + col(f.ventaja) + "'>" + sig(f.ventaja * 100, 1) + " pts</td><td>" + ret(f.media) +
      "</td><td>" + pct(f.entre_ganadores) + "</td><td>" + (f.sobre_mejores === null ? "—" : num(f.sobre_mejores, 2) + "×") + "</td><td>" + sig(f.z, 1) + "</td><td>" + (f._dias ? f._dias[0] + " de " + f._dias[1] : "—") +
      '</td><td><span class="grade-pill ' + cl + '">' + esc(f.lectura) + "</span></td></tr>";
  });
  h += "</tbody></table></div>";
  h += nota("<b>Frecuencia no es efectividad.</b> «% de los ganadores» dice cuántos ganadores tenían la condición; «% positivos» dice qué pasó con todos los que la tenían. " +
            "Una condición muy común aparece en muchos ganadores aunque no ayude. «Presencia en el 10 % mejor»: 1× = lo esperado por su frecuencia.") +
       nota("Se probaron " + cd.probadas + " condiciones y " + cd.pares_probados + " pares en un solo día. Solo por azar, unas " + azar + " condiciones y " + Math.round(cd.pares_probados * 0.0455) +
            " pares salen con |z| ≥ 2. Además, los tickets de un mismo día se mueven juntos (por ejemplo, todos los ETF a la vez), así que z sirve para ordenar, no como prueba. " +
            "Lo que vale es que una condición se repita: mira «Días a favor» cuando haya historial.");
  el.innerHTML = seccion("2", "Condiciones: qué tenían en común los ganadores (y qué no sirvió)", h, true, "rgba(255,171,0,.15)");
  function tp(lista, tit) {
    return "<b style='color:var(--txt)'>" + tit + "</b><div style='overflow-x:auto;margin:6px 0 12px'><table class='an-table'><thead><tr><th>Par de condiciones</th><th>Tickets</th><th>% positivos</th><th>vs universo</th><th>Rend. medio</th><th>z</th></tr></thead><tbody>" +
      lista.map(function (f) { return "<tr><td style='white-space:normal'>" + esc(f.condicion) + "</td><td>" + f.n + "</td><td><b>" + pct(f.pct_pos) + "</b></td><td style='color:" + col(f.ventaja) + "'>" + sig(f.ventaja * 100, 1) + " pts</td><td>" + ret(f.media) + "</td><td>" + sig(f.z, 1) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  }
  el.innerHTML += seccion("3", "Pares de condiciones (candidatos a nuevos combos)", tp(cd.pares_mejores, "Los 25 mejores") + tp(cd.pares_peores, "Los 15 peores") +
    nota("Son hipótesis de un día, elegidas después de ver el resultado. Antes de convertir un par en combo, comprueba que se sostenga en varias sesiones."), false, "rgba(179,136,255,.15)");
}

// ═══════════════════════════ DESCARGAS ═══════════════════════════
function blob(content, name, type) {
  var b = new Blob([content], { type: type }), a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function csv(aoa, es) {
  var sep = es ? ";" : ",";
  return "﻿" + aoa.map(function (r) { return r.map(function (v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return es ? String(v).replace(".", ",") : String(v);
    v = String(v); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(sep); }).join("\r\n") + "\r\n";
}
function exportar(hojas, nombre, fmt, st) {
  if (fmt !== "xlsx") { blob(csv(hojas[0][1], fmt === "csv_es"), nombre + ".csv", "text/csv;charset=utf-8"); st.textContent = "Descargado " + nombre + ".csv"; return; }
  st.textContent = "Preparando Excel…";
  loadScriptOnce(SHEETJS_URL).then(function () {
    var wb = window.XLSX.utils.book_new();
    hojas.forEach(function (hj) { var ws = window.XLSX.utils.aoa_to_sheet(hj[1]); ws["!cols"] = hj[1][0].map(function (t) { return { wch: Math.max(9, Math.min(34, String(t).length + 3)) }; }); window.XLSX.utils.book_append_sheet(wb, ws, hj[0]); });
    window.XLSX.writeFile(wb, nombre + ".xlsx"); st.textContent = "Descargado " + nombre + ".xlsx";
  }).catch(function () { blob(csv(hojas[0][1], true), nombre + ".csv", "text/csv;charset=utf-8"); st.textContent = "Sin conexión al generador de Excel: se descargó CSV"; });
}
function filaWin(x) {
  var r = [];
  WIN_GRUPOS.forEach(function (g) { g[1].forEach(function (c) { var v = wValor(x, c[0]); if ((c[0] === "senales" || c[0] === "patrones") && v) v = String(v).replace(/\|/g, ", "); r.push(v === undefined ? null : v); }); });
  return r;
}
function cabeceraWin() { var r = []; WIN_GRUPOS.forEach(function (g) { g[1].forEach(function (c) { r.push(g[0] === "Ticket" || g[0] === "Resultado" || g[0] === "Otros" ? c[1] : g[0] + " " + c[1]); }); }); return r; }
function descargarWin() {
  if (!S.items.length) return;
  var d = S.dia, l = wOrdenar(wFiltrados()), aoa = [["Fecha"].concat(cabeceraWin())];
  l.forEach(function (x) { aoa.push([d.sesion].concat(filaWin(x))); });
  if (!S.cond) S.cond = C.condiciones(S.items);
  var cd = [["Condición", "Tickets", "% del universo", "Positivos", "% positivos", "vs universo (pts)", "Rend. medio", "% de los ganadores", "Presencia en el 10 % mejor", "z", "Lectura"]];
  S.cond.condiciones.forEach(function (f) { cd.push([f.condicion, f.n, +(f.frecuencia * 100).toFixed(2), f.pos, +(f.pct_pos * 100).toFixed(2), +(f.ventaja * 100).toFixed(2), +f.media.toFixed(3), f.entre_ganadores === null ? null : +(f.entre_ganadores * 100).toFixed(2), f.sobre_mejores === null ? null : +f.sobre_mejores.toFixed(2), f.z === null ? null : +f.z.toFixed(2), f.lectura]); });
  var pr = [["Par de condiciones", "Tickets", "Positivos", "% positivos", "vs universo (pts)", "Rend. medio", "z"]];
  S.cond.pares_mejores.concat(S.cond.pares_peores).forEach(function (f) { pr.push([f.condicion, f.n, f.pos, +(f.pct_pos * 100).toFixed(2), +(f.ventaja * 100).toFixed(2), +f.media.toFixed(3), +f.z.toFixed(2)]); });
  var suf = { pos: "positivos", neg: "negativos", neu: "neutros", todos: "todos" }[S.wRes];
  exportar([["WIN%DIA", aoa], ["CONDICIONES", cd], ["PARES", pr]], "Fenix_WIN_DIA_" + d.sesion + "_" + suf, $("wd-fmt").value, $("wd-status"));
}
function descargarCombos() {
  if (!S.items.length || S.fecha !== S.dia.sesion) return;
  var d = S.dia, T = tablaDelDia(), B = T.base;
  var res = [["Fecha", "Combos del cierre", "Combo", "Condiciones", "Tickets", "Positivos", "Negativos", "Neutros", "% Positivos", "IC 95 % inf.", "IC 95 % sup.", "vs universo (pts)", "Rend. promedio", "Mediana", "Acumulado", "Mejor", "Peor", "Desv. estándar", "Rango intercuartil", "Frecuencia en el universo %", "Consistencia %", "Fiabilidad de la muestra %", "Nota tasa", "Nota rendimiento", "Nota consistencia", "Nota robustez", "Calidad", "Confianza del día", "z", "Valores extremos", "No evaluables"]];
  var p2 = function (v) { return v === null || v === undefined ? null : +(v * 100).toFixed(2); }, n3 = function (v) { return v === null || v === undefined ? null : +(+v).toFixed(3); };
  var prevF = S.modo === "mismo" ? d.sesion : d.sesion_prev;
  T.combos.forEach(function (x) {
    var c = C.COMBO_POR_ID[x.id], q = x.calidad || {}, nn = q.notas || {};
    res.push([d.sesion, prevF, "Combo " + x.id, c.titulo, x.n, x.pos, x.neg, x.neu, p2(x.pct_pos), p2(x.ic_lo), p2(x.ic_hi), p2(x.ventaja_pos), n3(x.media), n3(x.mediana), n3(x.suma), n3(x.mejor), n3(x.peor), n3(x.desv), n3(x.iqr),
      p2(x.frecuencia), p2(x.supera_mediana), p2(q.fiabilidad), n3(nn.tasa), n3(nn.rendimiento), n3(nn.consistencia), n3(nn.robustez), n3(q.nota), q.nivel || null, n3(x.z), x.extremos || 0, x.no_evaluables || 0]);
  });
  res.push([d.sesion, prevF, "Todo el universo", "", B.n, B.pos, B.neg, B.neu, p2(B.pct_pos), null, null, 0, n3(B.media), n3(B.mediana), null, n3(B.mejor), n3(B.peor), n3(B.desv), n3(B.p75 - B.p25), 100, 50, null, null, null, null, null, 50, null, null, null, null]);
  var cab = cabeceraWin(), iRet = cab.indexOf("% Diario") + 1;      // "Estado" va justo después del % diario
  var det = [["Fecha"].concat(cab.slice(0, iRet), ["Estado"], cab.slice(iRet))];
  var lista = ordenar(filtrados(), S.orden);
  lista.forEach(function (x) { var f = filaWin(x); det.push([d.sesion].concat(f.slice(0, iRet), [x.ret > 0 ? "Positivo" : x.ret < 0 ? "Negativo" : "Neutro"], f.slice(iRet))); });
  var hi = [["Fecha", "Universo evaluado", "Universo % positivos", "Universo mediana"].concat([].concat.apply([], C.COMBOS.map(function (c) { return ["C" + c.id + " tickets", "C" + c.id + " % pos.", "C" + c.id + " mediana", "C" + c.id + " promedio", "C" + c.id + " calidad"]; }))).concat(["Combo destacado"])];
  (S.hist.dias || []).forEach(function (x) {
    hi.push([x.sesion, x.universo.evaluados, p2(x.universo.pct_pos), x.universo.mediana].concat([].concat.apply([], C.COMBOS.map(function (c) { var y = x.combos[c.id] || {}; return [y.n || 0, y.n ? p2(y.pct_pos) : null, y.n ? y.mediana : null, y.n ? y.media : null, y.n ? y.nota : null]; }))).concat([x.destacado && x.destacado.id ? "Combo " + x.destacado.id : (x.destacado && x.destacado.texto) || ""]));
  });
  var fmt = $("cb-fmt").value, nombre = "Fenix_COMBOS_" + d.sesion + (S.combo === "todos" ? "" : "_combo" + S.combo);
  exportar(fmt === "xlsx" ? [["COMBOS", res], ["DETALLE", det], ["HISTORIAL", hi]] : [["DETALLE", det]], nombre, fmt, $("cb-status"));
}

// ═══════════════════════════ API ═══════════════════════════
window.FenixCombosUI = {
  render: function (tab) {
    var id = tab === "combos" ? "cb-content" : "wd-content";
    if (!C) return vacio(id, "No se cargó fenix_combos.js.");
    if (!S.cargado) vacio(id, "Cargando los datos del universo completo…");
    cargar().then(function () { if (tab === "combos") pintarCombos(); else pintarWin(); });
  },
  elegir: function (id) { S.combo = String(S.combo) === String(id) ? "todos" : String(id); S.limite = 300; pintarCombos(); var e = $("cb-detalle"); if (e && e.scrollIntoView) e.scrollIntoView({ block: "nearest" }); },
  ordenar: function (k) { S.orden = { k: k, d: S.orden.k === k ? -S.orden.d : (k === "t" || k === "sector" ? 1 : -1) }; pintarDetalle(); },
  mas: function () { S.limite += 300; pintarDetalle(); },
  verHoy: verHoy,
  wOrdenar: function (k) { S.wOrden = { k: k, d: S.wOrden.k === k ? -S.wOrden.d : (k === "ticker" || k === "sector" ? 1 : -1) }; pintarWinTabla(); },
  wMas: function () { S.wLimite += 300; pintarWinTabla(); },
  cOrdenar: function (k) { S.cOrden = { k: k, d: S.cOrden.k === k ? -S.cOrden.d : (k === "condicion" ? 1 : -1) }; pintarCond(); },
  cVar: function (v) { S.cVar = v; pintarCond(); },
  cMin: function (v) { S.cMin = !!v; pintarCond(); },
  _estado: S
};
})();
