#!/usr/bin/env python3
"""
FENIX SCANNER PRO — Listado completo del mercado (~9.600 símbolos adicionales)

Evalúa TODO el LISTADO (data/universe.json, el mismo de tu Excel) con la MISMA
función de AndFig que usan tus grupos: build_data.get_stock_data(). Score, AI,
estado, grados, proyección, Hessiana, señales y patrones salen idénticos.

Diferencias SOLO en cómo se obtienen los datos (no en cómo se calculan):
  · Velas: se descargan por lotes de 100 (yf.download) en vez de una por una,
    con la misma limpieza de velas vacías y la misma reconstrucción de la vela
    faltante que build_data.py.
  · Fundamentales (P/E, ROE, ROA, EPS, márgenes, earnings…): cambian una vez
    por trimestre, así que se guardan en caché (cache/fundamentales.json, que
    GitHub guarda entre corridas). Yahoo los entrega con una consulta por
    activo y BLOQUEA a quien pide demasiado rápido, así que el orden importa:
      1º los activos que HOY quedan en ENTRY/ENTRY+ (los únicos que pueden dar
         alerta): una consulta a la vez, con pausa y reintentos si Yahoo
         bloquea; luego se recalculan para que las 4 capas los evalúen con
         fundamentales del día;
      2º se publica el listado;
      3º con el tiempo que quede (20 min por defecto) se renuevan los demás,
         empezando por los más cercanos a ENTRY. Esos se ven desde la noche
         siguiente.
  · Excluidos: tus grupos actuales (ya los calcula build_data.py) y los ETF
    apalancados o inversos (2X, 3X, UltraShort, Bear, Inverse…).
  · RS (percentil) y las etiquetas Top gainers/losers, más volátiles y más
    activas se calculan sobre el listado.

Salida:
  data/listado.json         filas en formato compacto (cols + rows), solo si la
                            salud del listado es OK (si no, se conserva el anterior)
  data/listado_health.json  informe de salud (siempre)

Variables de entorno: LISTADO_BUDGET_MIN (170), LISTADO_LOTE (100),
LISTADO_FUND_POR_NOCHE (2000), LISTADO_FUND_MIN (20), LISTADO_FUND_HILOS (1),
LISTADO_FUND_PAUSA (0.35), LISTADO_FUND_DIAS (21), LISTADO_MAX_REPARAR (10000), LISTADO_MAX_STALE_PCT (10),
FENIX_CACHE_DIR (cache).
"""
import argparse, json, os, re, sys, time, bisect
import concurrent.futures as cf
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_data as bd
import yfinance as _yf_real
import pandas as pd

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")
CACHE_DIR = os.environ.get("FENIX_CACHE_DIR", os.path.join(BASE, "cache"))
FUND_PATH = os.path.join(CACHE_DIR, "fundamentales.json")
OUT = os.path.join(DATA, "listado.json")
OUT_HEALTH = os.path.join(DATA, "listado_health.json")
GROUP = "🌐 Listado completo"

BUDGET_MIN = float(os.environ.get("LISTADO_BUDGET_MIN", "170"))
LOTE = int(os.environ.get("LISTADO_LOTE", "100"))
FUND_NOCHE = int(os.environ.get("LISTADO_FUND_POR_NOCHE", "2000"))
# Yahoo bloqueó la máquina tras ~600 consultas con 4 hilos (1-oct-2026): los
# candidatos se quedaron sin fundamentales y casi ninguno pudo pasar las capas
# Analysis y Game Theory. Una consulta a la vez, como hace build_data.py con tus
# grupos (1.100+ por noche sin bloqueo).
FUND_HILOS = int(os.environ.get("LISTADO_FUND_HILOS", "1"))
FUND_PAUSA = float(os.environ.get("LISTADO_FUND_PAUSA", "0.35"))     # segundos entre consultas
FUND_MIN = float(os.environ.get("LISTADO_FUND_MIN", "20"))           # minutos para la renovación general
RACHA_BLOQUEO = 8      # fallos seguidos = Yahoo está bloqueando (no "activos sin datos")
ROT_DIAS = int(os.environ.get("LISTADO_FUND_DIAS", "21"))            # antigüedad para renovar (cambian por trimestre)
MAX_REPARAR = int(os.environ.get("LISTADO_MAX_REPARAR", "10000"))
MAX_STALE = float(os.environ.get("LISTADO_MAX_STALE_PCT", "10"))
FRESCO_H = 20          # horas: fundamentales "del día" para los candidatos

# Campos de Yahoo que usa get_stock_data() (fundamentales, Buffett, Screener)
INFO_KEYS = ("shortName", "sector", "industry", "quoteType", "marketCap", "trailingPE",
             "returnOnEquity", "returnOnAssets", "earningsQuarterlyGrowth", "grossMargins",
             "operatingMargins", "profitMargins", "debtToEquity", "currentRatio", "quickRatio",
             "freeCashflow", "revenueGrowth", "trailingEps", "bookValue", "forwardPE", "pegRatio",
             "priceToSalesTrailing12Months", "priceToBook", "dividendYield", "payoutRatio", "beta",
             "heldPercentInsiders", "heldPercentInstitutions", "shortPercentOfFloat", "shortRatio",
             "recommendationMean", "sharesOutstanding", "floatShares")
CAL_KEYS = ("Earnings Date", "EarningsDate", "Ex-Dividend Date", "ExDividendDate")

# ── ETF apalancados / inversos (por el nombre del LISTADO) ──
R_NUM = re.compile(r'(?<![\w.])[-+]?\d+(\.\d+)?\s?x\b', re.I)
R_WORDS = re.compile(r'\b(inverse|leveraged?(?!\s+loan)|leverage shares|daily target|bear)\b', re.I)
R_ULTRA = re.compile(r'\bUltraPro\b|\bUltraShort\b(?!\s+(Income|Bond|Duration|Fixed))'
                     r'|\bUltra\b(?!\s*-?\s*[Ss]hort)(?!\s+(Buffer|Dividend|Option))(?!-Small)')
R_SHORT = re.compile(r'(?<!/)(?<!Long-)(?<!Long )(?<!Ultra )(?<!Ultra-)\bShort\b(?!\s*-?\s*(Term|Duration|'
                     r'Maturity|Treasury|Bond|Income|Municipal|Muni|High Yield|Horizon|Government|'
                     r'Investment|Dated|Strategy))', re.I)


def es_apalancado(entry):
    """entry = [Compañía, Sector, Industria] del LISTADO."""
    if not entry or len(entry) < 3 or entry[2] != "Exchange Traded Fund":
        return False
    n = entry[0] or ""
    return bool(R_NUM.search(n) or R_WORDS.search(n) or R_ULTRA.search(n) or R_SHORT.search(n))


def now_iso():
    return datetime.now(timezone.utc).isoformat()[:19] + "Z"


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


# ── Proxy de yfinance: fundamentales desde la caché, velas desde Yahoo ──
class _CachedTicker:
    def __init__(self, sym, prov):
        self._sym, self._prov = sym, prov

    @property
    def info(self):
        return self._prov.info(self._sym)

    @property
    def calendar(self):
        return self._prov.calendar(self._sym)

    def history(self, *a, **k):
        return _yf_real.Ticker(self._sym).history(*a, **k)

    @property
    def fast_info(self):
        return _yf_real.Ticker(self._sym).fast_info


class _YFProxy:
    """Sustituye a `yf` dentro de build_data solo en este proceso."""
    def __init__(self, prov):
        self._prov = prov

    def Ticker(self, sym):
        return _CachedTicker(sym, self._prov)

    def __getattr__(self, name):
        return getattr(_yf_real, name)


class Fundamentales:
    def __init__(self, cache, universe, sym2t):
        self.cache = cache            # {sym: {"info":{...}|None, "cal":{...}, "ts": iso}}
        self.universe = universe
        self.sym2t = sym2t

    def _fallback(self, sym):
        """Sin fundamentales todavía: nombre (y tipo ETF) del LISTADO, nada más."""
        u = self.universe.get(self.sym2t.get(sym, sym)) or []
        d = {"shortName": u[0]} if u else {}
        if len(u) >= 3 and u[2] == "Exchange Traded Fund":
            d["quoteType"] = "ETF"
        return d

    def info(self, sym):
        e = self.cache.get(sym) or {}
        return dict(e["info"]) if e.get("info") else self._fallback(sym)

    def calendar(self, sym):
        return dict((self.cache.get(sym) or {}).get("cal") or {})

    def age_h(self, sym):
        e = self.cache.get(sym) or {}
        if not e.get("info") or not e.get("ts"):
            return 1e9
        try:
            t = datetime.fromisoformat(e["ts"].replace("Z", "+00:00"))
            return (datetime.now(timezone.utc) - t).total_seconds() / 3600
        except Exception:
            return 1e9


def fetch_fund(sym):
    """Una consulta de info + calendario a Yahoo. Devuelve (sym, entrada|None)."""
    t = _yf_real.Ticker(sym)
    try:
        raw = t.info or {}
    except Exception as e:
        return sym, None, str(e)[:80]
    info = {k: raw.get(k) for k in INFO_KEYS if raw.get(k) is not None}
    if not info:
        return sym, None, "sin info"
    cal = {}
    try:
        c = t.calendar
        if isinstance(c, dict):
            for k in CAL_KEYS:
                v = c.get(k)
                if v is None:
                    continue
                if isinstance(v, (list, tuple)):
                    v = [str(pd.Timestamp(x).date()) for x in v if x is not None]
                else:
                    v = str(pd.Timestamp(v).date())
                cal[k] = v
    except Exception:
        pass
    return sym, {"info": info, "cal": cal, "ts": now_iso()}, None


R_BLOQUEO = re.compile(r"too many requests|rate.?limit|\b429\b|\b401\b|unauthorized|crumb|\b403\b|forbidden", re.I)


def _sin_info(prov, sym, err):
    """El activo no tiene ficha en Yahoo (no es un bloqueo): no se reintenta en 7 días."""
    prev = prov.cache.get(sym) or {}
    prev.setdefault("info", None)
    prev["err"] = err; prev["err_ts"] = now_iso()
    prov.cache[sym] = prev


def refresh_fund(prov, syms, deadline, label, reintentos=3, hilos=None, pausa=None):
    """Renueva fundamentales SIN provocar el bloqueo de Yahoo y sin confundirlo
    con "activo sin datos":
      · una consulta a la vez (o `hilos`), con `pausa` entre consultas;
      · un error de límite, o RACHA_BLOQUEO fallos seguidos, es un bloqueo: se
        espera (60, 120, 240 s…) y se REINTENTAN esos mismos activos, hasta
        `reintentos` esperas; si sigue, se deja para la próxima corrida;
      · solo los fallos aislados (entre dos consultas buenas) se anotan como
        "sin info" y se saltan 7 días.
    Devuelve {ok, sin_info, faltan: [símbolos que no se pudieron traer], bloqueado}."""
    hilos = hilos or FUND_HILOS
    pausa = FUND_PAUSA if pausa is None else pausa
    pend = list(dict.fromkeys(syms))
    out = {"ok": 0, "sin_info": 0, "faltan": [], "bloqueado": False}
    if not pend:
        return out
    racha, veces, esperas, i, fin_visto = [], {}, 0, 0, False
    ex = cf.ThreadPoolExecutor(max_workers=hilos) if hilos > 1 else None

    def cerrar_racha():                       # fallos aislados: sin ficha en Yahoo
        for s2, e2 in racha:
            _sin_info(prov, s2, e2); out["sin_info"] += 1
        racha.clear()

    try:
        while True:
            duro = False
            if i < len(pend):
                if time.time() > deadline:
                    out["faltan"] = [x for x, _ in racha] + pend[i:]
                    print(f"  ⏱ {label}: se acabó el tiempo — {len(out['faltan'])} quedan para la próxima corrida")
                    break
                lote = pend[i:i + hilos]; i += len(lote)
                res = list(ex.map(fetch_fund, lote)) if ex else [fetch_fund(lote[0])]
                for sym, entry, err in res:
                    if entry:
                        prov.cache[sym] = entry
                        out["ok"] += 1
                        cerrar_racha()
                    else:
                        racha.append((sym, err))
                        duro = duro or bool(R_BLOQUEO.search(err or ""))
                bloqueo = duro or len(racha) >= RACHA_BLOQUEO
            else:
                # Fin de la lista: 3+ fallos al final también pueden ser un bloqueo
                # (lista corta de candidatos); se comprueba una sola vez.
                bloqueo = len(racha) >= 3 and not fin_visto
                fin_visto = True
                if not bloqueo:
                    cerrar_racha()
                    break
            if not bloqueo:
                time.sleep(pausa)
                continue
            espera = min(300, 60 * 2 ** esperas)
            if esperas >= reintentos or time.time() + espera > deadline:
                if duro or len(racha) >= RACHA_BLOQUEO:
                    out["bloqueado"] = True
                    out["faltan"] = [x for x, _ in racha] + pend[i:]
                    print(f"  ⚠️ {label}: Yahoo sigue limitando — {len(out['faltan'])} quedan para la próxima corrida")
                else:
                    cerrar_racha()
                break
            esperas += 1
            print(f"  ⏸ {label}: posible límite de Yahoo ({len(racha)} fallos seguidos) — pausa de {espera} s "
                  f"y se reintenta ({esperas}/{reintentos})")
            time.sleep(espera)
            otra = []
            for s2, e2 in racha:
                veces[s2] = veces.get(s2, 0) + 1
                if veces[s2] >= 3 and not R_BLOQUEO.search(e2 or ""):   # vacío tras 3 pausas: sin ficha
                    _sin_info(prov, s2, e2); out["sin_info"] += 1
                else:
                    otra.append(s2)
            racha.clear()
            pend[i:i] = otra
    finally:
        if ex:
            ex.shutdown(wait=False, cancel_futures=True)
    print(f"  📚 {label}: {out['ok']} renovados · {out['sin_info']} sin ficha en Yahoo"
          f"{' · ' + str(len(out['faltan'])) + ' pendientes' if out['faltan'] else ''}")
    return out


def fund_fecha(prov, sym):
    """Fecha de los fundamentales usados (None = aún sin fundamentales en caché)."""
    e = prov.cache.get(sym) or {}
    return (e.get("ts") or "")[:10] or None if e.get("info") else None


def extract(df, sym, single):
    try:
        if df is None or len(df) == 0:
            return None
        if single and not isinstance(df.columns, pd.MultiIndex):
            h = df
        elif sym in df.columns.get_level_values(0):
            h = df[sym]
        else:
            return None
        h = h[[c for c in ("Open", "High", "Low", "Close", "Volume") if c in h.columns]]
        return h
    except Exception:
        return None


def download_lote(syms):
    for intento in range(2):
        try:
            return _yf_real.download(syms, period="5y", interval="1d", group_by="ticker",
                                     auto_adjust=True, threads=True, progress=False)
        except Exception as e:
            if intento:
                print(f"  ⚠️ lote {syms[0]}…: {e}")
            time.sleep(5)
    return None


def cross_sectional(rows):
    """RS percentil y etiquetas transversales (mismas reglas que build_data.main)."""
    vals = sorted(r["rs_3m"] for r in rows if r.get("rs_3m") is not None)
    if len(vals) >= 10:
        for r in rows:
            if r.get("rs_3m") is not None:
                pos = bisect.bisect_left(vals, r["rs_3m"])
                r["rs_rank"] = round(pos / max(1, len(vals) - 1) * 100)
    def top(key, n, rev):
        v = [r for r in rows if r.get(key) is not None]
        v.sort(key=lambda r: r[key], reverse=rev)
        return {r["ticker"] for r in v[:n]}
    tg, tl = top("daily", 20, True), top("daily", 20, False)
    mv, ma = top("vol_m", 25, True), top("avg_vol_m", 25, True)
    for r in rows:
        s = r.get("signals") or []
        if r["ticker"] in tg: s.append("top_gainers")
        if r["ticker"] in tl: s.append("top_losers")
        if r["ticker"] in mv: s.append("most_volatile")
        if r["ticker"] in ma: s.append("most_active")
        r["signals"] = s


def compact(rows):
    cols = []
    seen = set()
    for r in rows:
        for k in r:
            if k not in seen:
                seen.add(k); cols.append(k)
    return cols, [[r.get(c) for c in cols] for r in rows]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=0, help="(pruebas) limita el número de símbolos")
    ap.add_argument("--force-publish", action="store_true")
    args = ap.parse_args()
    t0 = time.time()
    deadline = t0 + BUDGET_MIN * 60
    print("═" * 60 + f"\nFENIX — LISTADO COMPLETO · {datetime.now()}\n" + "═" * 60)

    universe = load(os.path.join(DATA, "universe.json"), {})
    core = {bd.yf_symbol(t) for v in bd.GROUPS.values() for t in v}
    lista, apal = [], 0
    for t, e in universe.items():
        s = bd.yf_symbol(t)
        if s in core:
            continue
        if es_apalancado(e):
            apal += 1
            continue
        lista.append(t)
    if args.max:
        lista = lista[:args.max]
    sym2t = {bd.yf_symbol(t): t for t in lista}
    print(f"  LISTADO {len(universe)} · tus grupos {len(core)} · apalancados/inversos excluidos {apal} · a evaluar {len(lista)}")

    # Fundamentales en caché + proxy dentro de build_data
    os.makedirs(CACHE_DIR, exist_ok=True)
    prov = Fundamentales(load(FUND_PATH, {}), universe, sym2t)
    bd.yf = _YFProxy(prov)

    # Sesión de referencia (SPY) y SPY para RS, igual que build_data.main
    ref = bd.resolve_session_ref()
    spy_hist = bd.fetch_history("SPY")
    if spy_hist is not None and len(spy_hist) > 1 and bd._last_date(spy_hist) == bd._now_et().date() \
       and bd.is_us_session_open(bd._now_et()):
        spy_hist = spy_hist.iloc[:-1]
    spy_close = spy_hist["Close"].tail(260) if spy_hist is not None and len(spy_hist) > 0 else None
    print(f"  📅 Sesión de referencia (SPY): {ref}")

    # 1) Caché de fundamentales. La versión anterior anotaba como "sin info" los
    #    activos que fallaron porque Yahoo estaba bloqueando; se limpia una vez
    #    para que no esperen 7 días.
    syms = list(sym2t)
    if (prov.cache.get("_meta") or {}).get("v", 1) < 2:
        for e in prov.cache.values():
            if isinstance(e, dict):
                e.pop("err_ts", None)
        prov.cache["_meta"] = {"v": 2}
    def err_reciente(s):     # símbolos sin ficha en Yahoo: se reintentan cada 7 días, no cada noche
        e = (prov.cache.get(s) or {}).get("err_ts")
        try:
            return (datetime.now(timezone.utc) - datetime.fromisoformat(e.replace("Z", "+00:00"))).days < 7
        except Exception:
            return False

    # 2) Velas por lotes + filas con get_stock_data()
    rows, keep_hist = {}, {}
    sin_datos, reparadas, rep_fail, procesados = [], 0, 0, 0
    deadline_rows = deadline - 15 * 60
    abierto = bd.is_us_session_open(bd._now_et())
    for i in range(0, len(syms), LOTE):
        if time.time() > deadline_rows:
            print(f"  ⏱ Presupuesto de tiempo agotado: {procesados}/{len(syms)} procesados")
            break
        lote = syms[i:i + LOTE]
        df = download_lote(lote)
        for s in lote:
            t = sym2t[s]
            h = bd._clean_ohlc(extract(df, s, len(lote) == 1))
            procesados += 1
            if h is None or len(h) < 60:
                sin_datos.append(t)
                continue
            ld = bd._last_date(h)
            if bd.SESSION_REF is not None and ld is not None and ld < bd.SESSION_REF and not abierto:
                if reparadas + rep_fail < MAX_REPARAR:
                    h2, src = bd.repair_last_candle(t, h, bd.SESSION_REF)
                    if src:
                        h = h2; reparadas += 1; bd.HEALTH["reparadas"].append(t)
                    else:
                        rep_fail += 1
            bd._HIST_CACHE[t] = h
            row = bd.get_stock_data(t, spy_close=spy_close)
            bd._ROW_CACHE.pop(t, None)
            if row:
                row["fund_fecha"] = fund_fecha(prov, s)
                rows[t] = row
                if row.get("state") in ("ENTRY", "ENTRY+"):
                    keep_hist[t] = h
            bd._HIST_CACHE.pop(t, None)
        time.sleep(1)                       # pausa corta entre lotes: evita bloqueos de Yahoo
        if (i // LOTE) % 10 == 0:
            print(f"  … {procesados}/{len(syms)} · filas {len(rows)} · reparadas {reparadas} · "
                  f"{(time.time() - t0) / 60:.1f} min")

    # 3) Candidatos de hoy (ENTRY/ENTRY+): fundamentales frescos ANTES que nadie
    #    (son los únicos que pueden dar alerta) y recálculo. Primero los de mayor Score.
    orden = sorted(keep_hist, key=lambda t: -((rows.get(t) or {}).get("score") or 0))
    cand = [bd.yf_symbol(t) for t in orden if prov.age_h(bd.yf_symbol(t)) > FRESCO_H]
    print(f"  🎯 En ENTRY/ENTRY+ hoy: {len(keep_hist)} · necesitan fundamentales del día: {len(cand)}")
    rc = refresh_fund(prov, cand, deadline - 5 * 60, "Fundamentales de candidatos", reintentos=4)
    cand_ok = sum(1 for t in keep_hist if prov.age_h(bd.yf_symbol(t)) <= FRESCO_H)
    cand_sin_ficha = sum(1 for t in keep_hist if prov.age_h(bd.yf_symbol(t)) > FRESCO_H
                         and bd.yf_symbol(t) not in rc["faltan"])
    for t, h in keep_hist.items():
        bd._HIST_CACHE[t] = h
        bd._ROW_CACHE.pop(t, None)
        row = bd.get_stock_data(t, spy_close=spy_close)
        if row:
            row["fund_fecha"] = fund_fecha(prov, bd.yf_symbol(t))
            rows[t] = row
        bd._HIST_CACHE.pop(t, None)
    with open(FUND_PATH, "w", encoding="utf-8") as f:
        json.dump(prov.cache, f, ensure_ascii=False, separators=(",", ":"))

    # 4) Filas no procesadas (presupuesto agotado): se conservan las de ayer, marcadas
    prev = load(OUT, {})
    if prev.get("cols") and procesados < len(syms):
        pc, mis_t, sd = prev["cols"], set(sym2t.values()), set(sin_datos)
        for vals in prev.get("rows", []):
            r = dict(zip(pc, vals))
            if r.get("ticker") in mis_t and r["ticker"] not in rows and r["ticker"] not in sd:
                r["stale"] = True
                rows[r["ticker"]] = r

    out_rows = sorted(rows.values(), key=lambda r: (-(r.get("score") or 0), r["ticker"]))
    cross_sectional([r for r in out_rows if not r.get("stale")])
    stale = [r["ticker"] for r in out_rows if r.get("stale")]
    n = max(1, len(out_rows))
    pct = round(len(stale) / n * 100, 1)
    con_fund = sum(1 for s in syms if (prov.cache.get(s) or {}).get("info"))
    status = "OK" if (pct <= MAX_STALE and len(out_rows) >= 0.5 * len(syms)) else "FAILED"
    health = {
        "built_at": now_iso(), "status": status, "session_ref": str(bd.SESSION_REF) if bd.SESSION_REF else None,
        "a_evaluar": len(syms), "filas": len(out_rows), "procesados": procesados, "sin_datos": len(sin_datos),
        "desactualizados": len(stale), "pct_desactualizados": pct, "umbral_pct": MAX_STALE,
        "reparados": reparadas, "reparacion_fallida": rep_fail,
        "apalancados_excluidos": apal, "con_fundamentales": con_fund,
        "en_entry_hoy": len(keep_hist),
        # Candidatos evaluados con fundamentales del día (sin ellos no pueden pasar Analysis ni Game Theory)
        "candidatos_con_fundamentales": cand_ok, "candidatos_sin_ficha_yahoo": cand_sin_ficha,
        "candidatos_pendientes": len(rc["faltan"]), "yahoo_bloqueo_candidatos": rc["bloqueado"],
        "minutos": round((time.time() - t0) / 60, 1),
    }
    rng = {}
    for k in ("daily", "5d", "20d"):
        v = [r[k] for r in out_rows if r.get(k) is not None]
        rng[k] = [min(v) if v else -5, max(v) if v else 5]
    bd.dump_json(health, OUT_HEALTH)
    print(f"\n  🩺 Listado: {status} · {len(out_rows)} filas · {pct}% desactualizadas · reparadas {reparadas} · "
          f"sin datos {len(sin_datos)} · con fundamentales {con_fund}/{len(syms)} · {health['minutos']} min")
    print(f"  🎯 Candidatos con fundamentales del día: {cand_ok}/{len(keep_hist)}"
          f"{' · ' + str(cand_sin_ficha) + ' sin ficha en Yahoo' if cand_sin_ficha else ''}"
          f"{' · ' + str(len(rc['faltan'])) + ' sin traer (Yahoo limitó)' if rc['faltan'] else ''}")
    if status != "OK" and not args.force_publish:
        print("  ⛔ No se publica el listado (se conserva el anterior; sus alertas no se usan hoy).")
    else:
        cols, vals = compact(out_rows)
        bd.dump_json({"built_at": health["built_at"], "grupo": GROUP, "session_ref": health["session_ref"],
                      "health": health, "column_ranges": rng, "cols": cols, "rows": vals}, OUT)
        print(f"  ✅ {OUT} — {len(out_rows)} filas ({os.path.getsize(OUT) / 1e6:.1f} MB)")

    # 5) Con el listado ya publicado: renovación general de fundamentales con el
    #    tiempo que quede. Primero los que nunca se han traído y están más cerca
    #    de ENTRY (ACCUM, mayor Score); después los más antiguos. Se verán desde
    #    la próxima corrida. Si Yahoo limita, se deja para mañana.
    if rc["bloqueado"]:
        print("  ℹ️ Renovación general omitida hoy: Yahoo ya estaba limitando con los candidatos.")
        return
    con_fila = {bd.yf_symbol(r["ticker"]): r for r in out_rows if not r.get("stale")}
    def prioridad(sy):
        r = con_fila[sy]
        return (0 if prov.age_h(sy) >= 1e9 else 1, 0 if r.get("state") == "ACCUM" else 1,
                -(r.get("score") or 0), -min(prov.age_h(sy), 1e9))
    rot = sorted((sy for sy in con_fila if prov.age_h(sy) > 24 * ROT_DIAS and not err_reciente(sy)),
                 key=prioridad)[:FUND_NOCHE]
    rr = refresh_fund(prov, rot, min(deadline - 60, time.time() + FUND_MIN * 60), "Renovación general de fundamentales",
                      reintentos=1)
    with open(FUND_PATH, "w", encoding="utf-8") as f:
        json.dump(prov.cache, f, ensure_ascii=False, separators=(",", ":"))
    try:
        health["con_fundamentales"] = sum(1 for sy in syms if (prov.cache.get(sy) or {}).get("info"))
        health["renovados_hoy"] = rr["ok"]; health["yahoo_bloqueo_renovacion"] = rr["bloqueado"]
        health["minutos"] = round((time.time() - t0) / 60, 1)
        bd.dump_json(health, OUT_HEALTH)
        print(f"  📚 Fundamentales en caché: {health['con_fundamentales']}/{len(syms)}")
    except Exception as e:
        print(f"  ⚠️ no se pudo actualizar la salud del listado: {e}")


if __name__ == "__main__":
    main()
