#!/usr/bin/env python3
"""
FENIX SCANNER PRO — Seguimiento diario (datos para el Excel/CSV del Historial)

Para cada alerta del Historial guarda, UNA sola vez y del día de la señal:

  · la fila del snapshot con la que se calculan las pestañas (Hessian, Markov,
    Game Theory, Entry Zones, Analysis, Laplace) — así el Excel muestra los
    valores que esas pestañas mostraban ESE día, no los de hoy;
  · Sector e Industria (mismo LISTADO que usa tu Excel: data/universe.json);
  · la distancia a la EMA20 y a la EMA200 en 5 min, 1 hora y 1 día medida EN EL
    FILL: el primer encuentro del precio con el nivel de entrada el día del fill,
    con la misma lógica de tu script de TradingView "Nivel → EMAs + POC (v3)"
    (toque / gap de apertura / gap intradía / aproximación, EMA de la vela del
    encuentro, referencia = nivel escrito):  Δ = EMA_N − nivel  (en $).
    También se guarda el POC del perfil de volumen (300 velas, 80 niveles) en la
    vela del encuentro, igual que el script.

Los parámetros de cada pestaña NO se calculan aquí: los calcula fenix_params.js
(copia literal de las fórmulas de las pestañas) en el navegador y en
scripts/seguimiento_export.js. Aquí solo se guardan los datos de entrada.

Uso:
  python scripts/seguimiento.py                  # corrida normal (workflows)
  python scripts/seguimiento.py --desde-git      # rellena desde el historial git de snapshot.json
  python scripts/seguimiento.py --sin-red        # no descarga velas (solo captura filas)
"""
import argparse, json, math, os, subprocess, sys, time
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")
OUT = os.path.join(DATA, "seguimiento.json")

# Campos de la fila del snapshot que usan las fórmulas de las pestañas
ROW_KEYS = ("ticker", "name", "close", "score", "ai", "rsi", "adx", "ext", "rel_vol",
            "5d", "20d", "upside", "pe", "roe", "roa", "eps_g", "pe_gr", "roe_gr",
            "roa_gr", "eps_gr", "sector", "industry", "state", "hessian", "asof",
            "ema20_d", "ema200_d")
MAX_EMA_TRIES = 3          # intentos por alerta para las distancias EMA
MAX_DOWNLOADS = int(os.environ.get("SEGUIMIENTO_MAX_DESCARGAS", "900"))


def json_safe(o):
    if isinstance(o, dict):
        return {k: json_safe(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [json_safe(v) for v in o]
    if isinstance(o, float) and not math.isfinite(o):
        return None
    return o


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def yf_symbol(t):
    """BRK.B / BRK/B → BRK-B; conserva bolsas extranjeras (0700.HK)."""
    t = str(t).strip().upper().rstrip("*").replace("/", "-")
    if "." in t:
        base, suf = t.rsplit(".", 1)
        if len(suf) >= 2 or base.isdigit():
            return f"{base}.{suf}"
        return f"{base}-{suf}"
    return t


def alert_date(a):
    return a.get("asof") or (a.get("alerted_at") or "")[:10]


# ── Sector / Industria: mismo criterio que las fórmulas de tu hoja ──
#   Sector   = "ETF" si Industry = "Exchange Traded Fund"; si no, el del LISTADO
#   Busca el ticker tal cual y luego con "/" → "-"; si no está, "—".
def sector_industry(ticker, universe, row=None):
    u = universe.get(ticker) or universe.get(str(ticker).replace("/", "-"))
    if u and len(u) >= 3:
        ind = u[2] or "—"
        sec = "ETF" if ind == "Exchange Traded Fund" else (u[1] or "—")
        return sec, ind, "listado"
    if row:   # respaldo: lo que reporta Yahoo para el ticker
        sec = row.get("sector") or "—"
        ind = row.get("industry") or "—"
        if sec in ("ETF", "Fondo"):
            sec, ind = "ETF", (ind if ind != "—" else "Exchange Traded Fund")
        return sec, ind, "yahoo"
    return "—", "—", None


def valid_row(r):
    return (r is not None and r.get("close") is not None and r.get("score") is not None
            and not r.get("stale"))


def snapshot_rows(snap):
    """Filas únicas por ticker (la primera, como getAllStocks del dashboard)."""
    idx = {}
    for rows in (snap.get("groups") or {}).values():
        for r in rows:
            idx.setdefault(r.get("ticker"), r)
    return idx


def sector_roe_avgs(idx):
    """Promedio de ROE por sector sobre todo el universo, igual que la sección 2
    de Analysis (Contexto Sectorial): solo filas con ROE distinto de 0/null.
    La columna "Roe" de tu hoja es  ROE del ticker − ese promedio."""
    acc = {}
    for r in idx.values():
        k = r.get("sector")
        a = acc.setdefault(k, [0.0, 0])
        if r.get("roe"):
            a[0] += r["roe"]; a[1] += 1
    return {k: (v[0] / v[1] if v[1] else 0.0) for k, v in acc.items()}


def capture_rows(seg, alerts, snap, universe, origin, avg_snap=None):
    """Guarda la fila del snapshot para las alertas cuya fecha de señal
    coincide con la vela de ese snapshot. `avg_snap`: de dónde sale el promedio
    de ROE por sector (por defecto, el mismo snapshot = lo que muestra Analysis)."""
    idx = snapshot_rows(snap)
    avg_idx = snapshot_rows(avg_snap) if avg_snap is not None else idx
    avgs = None
    n = 0
    for a in alerts:
        rec = seg["rows"].setdefault(a["id"], {})
        if rec.get("row"):
            continue
        r = idx.get(a["ticker"])
        if not valid_row(r) or r.get("asof") != alert_date(a):
            continue
        if avgs is None:
            avgs = sector_roe_avgs(avg_idx)
        rec["row"] = {k: r.get(k) for k in ROW_KEYS}
        rec["row"]["_sec_roe_avg"] = round(avgs.get(r.get("sector"), 0.0), 6)
        rec["captured_from"] = origin
        rec["snap_built_at"] = snap.get("built_at")
        n += 1
    return n


def fill_sector(seg, alerts, universe):
    for a in alerts:
        rec = seg["rows"].setdefault(a["id"], {})
        if rec.get("sector") and rec.get("sector_src") == "listado":
            continue
        sec, ind, src = sector_industry(a["ticker"], universe, rec.get("row"))
        if src:
            rec["sector"], rec["industry"], rec["sector_src"] = sec, ind, src


# ── Distancias a las EMA EN EL FILL ──────────────────────────────────────────
# Réplica de f_scan() de tu script "Nivel → EMAs + POC (v3)" con sus valores por
# defecto: tolerancia 0, "Medir la distancia desde" = Nivel escrito, gaps de
# apertura e intradía activados, EMA 20/200 sobre el cierre, POC de 300 velas y
# 80 niveles "En la barra del encuentro". Sesión regular (gráfico sin pre/post).
POC_LEN, POC_BINS = 300, 80
EVENTOS = {1: "Toque", 2: "Gap apertura", 3: "Gap intradía", 4: "Aproximación"}


def _clean(df):
    if df is None or len(df) == 0:
        return None
    d = df.dropna(subset=[c for c in ("Open", "High", "Low", "Close") if c in df.columns])
    d = d[~d.index.duplicated(keep="last")].sort_index()
    return d if len(d) else None


def poc_profile(hs, ls, vs, bins=POC_BINS):
    """f_poc() del script: reparte el volumen de cada vela entre los niveles que
    su rango atraviesa y devuelve el nivel más negociado."""
    n = len(hs)
    if n < 20:
        return None
    hiP, loP = max(hs), min(ls)
    span = hiP - loP
    if span <= 0:
        return None
    bz = span / bins
    bv = [0.0] * bins
    for h, l, v in zip(hs, ls, vs):
        b0 = max(0, min(bins - 1, int((l - loP) / bz)))
        b1 = max(0, min(bins - 1, int((h - loP) / bz)))
        hh = h - l
        if hh <= 0 or b0 == b1:
            bv[b0] += v
        else:
            for j in range(b0, b1 + 1):
                bLo = loP + j * bz
                bHi = bLo + bz
                ov = min(h, bHi) - max(l, bLo)
                if ov > 0:
                    bv[j] += v * ov / hh
    pi = bv.index(max(bv))
    return loP + (pi + 0.5) * bz


def scan_nivel(df, day, level):
    """Primer encuentro del precio con `level` el día `day` (AAAA-MM-DD).
    Devuelve evento, hora, EMA20/EMA200 de esa vela y Δ = EMA − nivel."""
    d = _clean(df)
    if d is None:
        return None
    O = d["Open"].astype(float).tolist(); H = d["High"].astype(float).tolist()
    L = d["Low"].astype(float).tolist(); C = d["Close"].astype(float).tolist()
    V = (d["Volume"].fillna(0).astype(float).tolist() if "Volume" in d.columns else [0.0] * len(C))
    cs = d["Close"].astype(float)
    e20 = cs.ewm(span=20, adjust=False).mean().tolist()
    e200 = cs.ewm(span=200, adjust=False).mean().tolist()
    idx = [i for i, x in enumerate(d.index) if str(x.date()) == day]
    if not idx:
        return {"evento": "sin sesión", "dia": day}
    code, hit, best = 0, None, None
    for k, i in enumerate(idx):
        o, h, l = O[i], H[i], L[i]
        pc = C[i - 1] if i > 0 else o
        touch = l <= level <= h
        gapx = (not touch) and min(pc, o) <= level <= max(pc, o)
        if touch:
            code, hit = 1, (i, level)
            break
        if gapx:                                   # gap: se mide desde el nivel escrito
            code, hit = (2 if k == 0 else 3), (i, o)
            break
        dlo, dhi = abs(l - level), abs(h - level)
        dd = min(dlo, dhi)
        if best is None or dd < best:
            best, code, hit = dd, 4, (i, l if dlo < dhi else h)
    i, operado = hit
    ref = float(level)
    dec = 2 if ref >= 1 else 4
    pr = lambda v: None if v is None else round(v, dec)
    pc_ = lambda v, base: None if v is None or not base else round(v / base * 100, 2)
    # POC en la vela del encuentro: últimas 300 velas con volumen, incluida esta
    sel = [j for j in range(0, i + 1) if V[j] > 0][-POC_LEN:]
    poc = poc_profile([H[j] for j in sel], [L[j] for j in sel], [V[j] for j in sel]) if sel else None
    x20, x200 = e20[i], e200[i]
    hora = d.index[i].strftime("%H:%M")
    if hora == "00:00":          # vela diaria: TradingView la muestra con la hora de apertura
        hora = "09:30"
    out = {"evento": EVENTOS[code], "dia": day, "hora": hora,
           "ref": ref, "operado": round(float(operado), 4), "velas_previas": i + 1,
           "ema20": round(x20, 4), "d20": pr(x20 - ref), "p20": pc_(x20 - ref, ref),
           "ema200": round(x200, 4), "d200": pr(x200 - ref), "p200": pc_(x200 - ref, ref),
           "poc": None if poc is None else round(poc, 4), "poc_velas": len(sel)}
    if poc is not None:
        out.update({"dpoc": pr(poc - ref), "ppoc": pc_(poc - ref, ref),
                    "poc_e20": pr(x20 - poc), "poc_e20_p": pc_(x20 - poc, poc),
                    "poc_e200": pr(x200 - poc), "poc_e200_p": pc_(x200 - poc, poc)})
    if i + 1 < 200:
        out["aviso"] = f"solo {i + 1} velas antes del encuentro: la EMA200 aún no es fiable"
    return out


def _now_et():
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("America/New_York"))
    except Exception:
        return datetime.now()


def sesion_cerrada(day):
    """La vela diaria del día del fill ya es definitiva (cierre 16:00 ET + margen)."""
    now = _now_et()
    today = str(now.date())
    return day < today or (day == today and now.hour * 60 + now.minute >= 16 * 60 + 10)


def ema_en_fill(ticker, day, level, cache):
    import yfinance as yf
    sym = yf_symbol(ticker)
    age = (_now_et().date() - datetime.strptime(day, "%Y-%m-%d").date()).days
    def get(key, **kw):
        if (sym, key) not in cache:
            cache[(sym, key)] = yf.Ticker(sym).history(prepost=False, auto_adjust=True, **kw)
        return cache[(sym, key)]
    res = {"version": 2, "dia": day, "nivel": level}
    res["d1"] = scan_nivel(get("1d", period="5y", interval="1d"), day, level)
    res["h1"] = scan_nivel(get("1h", period="730d", interval="1h"), day, level) if age <= 720 else \
        {"no_disponible": "Yahoo solo guarda 730 días de velas de 1 hora"}
    res["m5"] = scan_nivel(get("5m", period="60d", interval="5m"), day, level) if age <= 58 else \
        {"no_disponible": "Yahoo solo guarda 60 días de velas de 5 min"}
    return res


def fill_emas(seg, alerts, max_downloads):
    """Distancias EMA en el fill: solo alertas con fill y con la sesión del fill
    ya cerrada. Se recalculan si el fill o el nivel de entrada cambian."""
    try:
        import yfinance  # noqa
    except Exception:
        print("  ⚠️ yfinance no disponible — sin distancias EMA en esta corrida")
        return 0
    cache, done, calls = {}, 0, 0
    for a in reversed(alerts):              # primero las más recientes (5 min caduca)
        rec = seg["rows"].setdefault(a["id"], {})
        rec.pop("ema", None); rec.pop("ema_intentos", None)   # versión anterior (cierre de la señal)
        fd, lvl = a.get("fill_date"), a.get("entry")
        if not fd or not lvl:
            rec.pop("ema_fill", None)
            continue
        ef = rec.get("ema_fill") or {}
        same = ef.get("dia") == fd and ef.get("nivel") == lvl
        ok = same and all(isinstance(ef.get(k), dict) and (ef[k].get("d20") is not None or "no_disponible" in ef[k])
                          for k in ("m5", "h1", "d1"))
        if ok:
            continue
        if not same:
            rec["ema_fill_intentos"] = 0
        if rec.get("ema_fill_intentos", 0) >= MAX_EMA_TRIES or not sesion_cerrada(fd):
            continue
        if calls >= max_downloads:              # el resto sigue en la próxima corrida
            break
        try:
            before = len(cache)
            new = ema_en_fill(a["ticker"], fd, float(lvl), cache)
            calls += len(cache) - before          # solo cuentan las descargas nuevas
            if same:                              # conserva lo que ya estaba bien
                for k in ("m5", "h1", "d1"):
                    if isinstance(ef.get(k), dict) and ef[k].get("d20") is not None:
                        new[k] = ef[k]
            rec["ema_fill"] = new
            done += 1
        except Exception as e:
            print(f"  ⚠️ EMA en el fill {a['ticker']} {fd}: {e}")
        rec["ema_fill_intentos"] = rec.get("ema_fill_intentos", 0) + 1
        time.sleep(0.2)
    return done


def iter_git_snapshots():
    """(commit, snapshot) en orden cronológico desde el historial git."""
    try:
        out = subprocess.run(["git", "log", "--reverse", "--format=%H", "--", "data/snapshot.json"],
                             cwd=BASE, capture_output=True, text=True, check=True).stdout.split()
    except Exception as e:
        print(f"  ⚠️ git no disponible: {e}")
        return
    for c in out:
        try:
            raw = subprocess.run(["git", "show", f"{c}:data/snapshot.json"], cwd=BASE,
                                 capture_output=True, check=True).stdout
            yield c, json.loads(raw)
        except Exception:
            continue


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--desde-git", action="store_true",
                    help="captura filas de alertas antiguas desde el historial git de data/snapshot.json")
    ap.add_argument("--snapshots-dir", help="(pruebas) carpeta con snapshots *.json en orden de nombre")
    ap.add_argument("--sin-red", action="store_true", help="no descarga velas intradía")
    args = ap.parse_args()

    print("═" * 55 + "\nSEGUIMIENTO (datos para Excel/CSV)\n" + "═" * 55)
    hist = load(os.path.join(DATA, "alerts_history.json"), {"alerts": []})
    alerts = hist.get("alerts", [])
    universe = load(os.path.join(DATA, "universe.json"), {})
    seg = load(OUT, {})
    seg.setdefault("rows", {})
    seg["version"] = 2
    seg["formula_dis_ema"] = ("En el FILL: primer encuentro del precio con el nivel de entrada el día del fill "
                              "(script 'Nivel → EMAs + POC v3'); Δ = EMA_N − nivel (en $), EMA de la vela del encuentro")
    seg["parametros"] = {"markov_periodos": 5, "laplace_s": 0.3, "game_theory": "nash / semana",
                         "entry_zones": "semana"}

    core_snap = load(os.path.join(DATA, "snapshot.json"), {})
    n = capture_rows(seg, alerts, core_snap, universe, "snapshot")
    print(f"  Filas capturadas del snapshot actual: {n}")
    # Alertas del listado completo: fila de data/listado.json; el promedio de ROE
    # por sector es el de tus grupos (lo que muestra la pestaña Analysis por defecto)
    L = load(os.path.join(DATA, "listado.json"), {})
    if L.get("cols"):
        lrows = [dict(zip(L["cols"], v)) for v in L.get("rows", [])]
        n2 = capture_rows(seg, alerts, {"groups": {L.get("grupo", "listado"): lrows}, "built_at": L.get("built_at")},
                          universe, "listado", avg_snap=core_snap)
        print(f"  Filas capturadas del listado completo: {n2}")
    if args.desde_git or args.snapshots_dir:
        tot = 0
        if args.snapshots_dir:
            files = sorted(f for f in os.listdir(args.snapshots_dir) if f.endswith(".json"))
            src = ((f, load(os.path.join(args.snapshots_dir, f), {})) for f in files)
        else:
            src = iter_git_snapshots()
        for c, snap in src:
            tot += capture_rows(seg, alerts, snap, universe, f"git:{str(c)[:7]}")
        print(f"  Filas capturadas del historial: {tot}")
    fill_sector(seg, alerts, universe)
    if not args.sin_red:
        k = fill_emas(seg, alerts, MAX_DOWNLOADS)
        print(f"  Distancias EMA en el fill calculadas para {k} alertas")

    ids = {a["id"] for a in alerts}
    seg["rows"] = {k: v for k, v in seg["rows"].items() if k in ids}
    with_row = sum(1 for v in seg["rows"].values() if v.get("row"))
    with_m5 = sum(1 for v in seg["rows"].values() if isinstance((v.get("ema_fill") or {}).get("m5"), dict)
                  and (v["ema_fill"]["m5"] or {}).get("d20") is not None)
    seg["resumen"] = {"alertas": len(alerts), "con_parametros": with_row, "con_ema_5m": with_m5,
                      "actualizado": datetime.now(timezone.utc).isoformat()[:19] + "Z"}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(json_safe(seg), f, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    print(f"  {with_row}/{len(alerts)} alertas con parámetros · {with_m5} con EMA 5 min en el fill → {OUT}")


if __name__ == "__main__":
    main()
