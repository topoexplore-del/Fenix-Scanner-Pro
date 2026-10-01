#!/usr/bin/env python3
"""
FENIX SCANNER PRO — Seguimiento diario (datos para el Excel/CSV del Historial)

Para cada alerta del Historial guarda, UNA sola vez y del día de la señal:

  · la fila del snapshot con la que se calculan las pestañas (Hessian, Markov,
    Game Theory, Entry Zones, Analysis, Laplace) — así el Excel muestra los
    valores que esas pestañas mostraban ESE día, no los de hoy;
  · Sector e Industria (mismo LISTADO que usa tu Excel: data/universe.json);
  · la distancia del precio a la EMA20 y a la EMA200 en 5 min, 1 hora y 1 día,
    medida al cierre de la sesión de la señal:  Dis Ema N = EMA_N − Precio  (en $),
    igual que la columna de tu hoja (negativa cuando el precio está por encima).

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


# ── Distancias a las EMA (5 min, 1 hora, 1 día) ──
def _ema_at_close(df, date_str):
    """EMA20/EMA200 y precio de la última vela de `date_str`.
    Devuelve dict con d20/d200 (= EMA − precio, en $) o None."""
    import pandas as pd  # noqa
    if df is None or len(df) == 0:
        return None
    d = df.dropna(subset=[c for c in ("Open", "High", "Low", "Close") if c in df.columns])
    d = d[~d.index.duplicated(keep="last")].sort_index()
    c = d["Close"]
    e20 = c.ewm(span=20, adjust=False).mean()
    e200 = c.ewm(span=200, adjust=False).mean()
    mask = [str(x.date()) == date_str for x in d.index]
    if not any(mask):
        return None
    i = max(k for k, m in enumerate(mask) if m)
    price = float(c.iloc[i])
    out = {"precio": round(price, 4), "ema20": round(float(e20.iloc[i]), 4),
           "d20": round(float(e20.iloc[i]) - price, 2), "barras": i + 1}
    if i + 1 >= 200:
        out["ema200"] = round(float(e200.iloc[i]), 4)
        out["d200"] = round(float(e200.iloc[i]) - price, 2)
    else:
        out["d200"] = None
    return out


def ema_distances(ticker, date_str, row, cache):
    import yfinance as yf
    sym = yf_symbol(ticker)
    res = {}
    today = datetime.now(timezone.utc).date()
    age = (today - datetime.strptime(date_str, "%Y-%m-%d").date()).days
    # 5 minutos: Yahoo solo guarda ~60 días de velas de 5 min
    if age <= 58:
        key = (sym, "5m")
        if key not in cache:
            cache[key] = yf.Ticker(sym).history(period="60d", interval="5m", prepost=False, auto_adjust=True)
        res["m5"] = _ema_at_close(cache[key], date_str)
    else:
        res["m5"] = {"no_disponible": "Yahoo solo guarda 60 días de velas de 5 min"}
    # 1 hora (hasta 730 días)
    if age <= 720:
        key = (sym, "1h")
        if key not in cache:
            cache[key] = yf.Ticker(sym).history(period="730d", interval="1h", prepost=False, auto_adjust=True)
        res["h1"] = _ema_at_close(cache[key], date_str)
    # 1 día: de la fila del snapshot si trae las EMA; si no, de la historia diaria
    if row and row.get("ema20_d") is not None and row.get("close") is not None:
        c = float(row["close"])
        res["d1"] = {"precio": c, "ema20": row["ema20_d"], "d20": round(row["ema20_d"] - c, 2),
                     "ema200": row.get("ema200_d"),
                     "d200": round(row["ema200_d"] - c, 2) if row.get("ema200_d") is not None else None,
                     "fuente": "snapshot"}
    else:
        key = (sym, "1d")
        if key not in cache:
            cache[key] = yf.Ticker(sym).history(period="5y", interval="1d", auto_adjust=True)
        res["d1"] = _ema_at_close(cache[key], date_str)
    return res


def fill_emas(seg, alerts, max_downloads):
    try:
        import yfinance  # noqa
    except Exception:
        print("  ⚠️ yfinance no disponible — sin distancias EMA en esta corrida")
        return 0
    cache, done, calls = {}, 0, 0
    for a in reversed(alerts):              # primero las más recientes (5 min caduca)
        rec = seg["rows"].setdefault(a["id"], {})
        ema = rec.get("ema") or {}
        complete = all(isinstance(ema.get(k), dict) and ("d20" in ema[k] or "no_disponible" in ema[k])
                       for k in ("m5", "h1", "d1"))
        if complete or rec.get("ema_intentos", 0) >= MAX_EMA_TRIES:
            continue
        ds = alert_date(a)
        if not ds:
            continue
        if calls >= max_downloads:              # el resto sigue en la próxima corrida
            break
        try:
            before = len(cache)
            new = ema_distances(a["ticker"], ds, rec.get("row"), cache)
            calls += len(cache) - before          # solo cuentan las descargas nuevas
            for k, v in new.items():
                if v is not None and not (isinstance(ema.get(k), dict) and "d20" in ema[k]):
                    ema[k] = v
            rec["ema"] = ema
            done += 1
        except Exception as e:
            print(f"  ⚠️ EMA {a['ticker']} {ds}: {e}")
        rec["ema_intentos"] = rec.get("ema_intentos", 0) + 1
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
    seg["version"] = 1
    seg["formula_dis_ema"] = "EMA_N − precio de cierre de la sesión de la señal (en $)"
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
        print(f"  Distancias EMA calculadas para {k} alertas")

    ids = {a["id"] for a in alerts}
    seg["rows"] = {k: v for k, v in seg["rows"].items() if k in ids}
    with_row = sum(1 for v in seg["rows"].values() if v.get("row"))
    with_m5 = sum(1 for v in seg["rows"].values() if isinstance((v.get("ema") or {}).get("m5"), dict)
                  and (v["ema"]["m5"] or {}).get("d20") is not None)
    seg["resumen"] = {"alertas": len(alerts), "con_parametros": with_row, "con_ema_5m": with_m5,
                      "actualizado": datetime.now(timezone.utc).isoformat()[:19] + "Z"}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(json_safe(seg), f, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    print(f"  {with_row}/{len(alerts)} alertas con parámetros · {with_m5} con EMA 5 min → {OUT}")


if __name__ == "__main__":
    main()
