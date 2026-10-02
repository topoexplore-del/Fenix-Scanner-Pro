#!/usr/bin/env python3
"""
FENIX SCANNER PRO — EMA 20 y EMA 200 de 5 minutos al cierre de la sesión
(tercera condición del combo 15: "Dis Ema 20 < 0 y Dis Ema 200 < 0").

Lo llama scripts/combos.js, y solo con los tickets que ya cumplen las otras dos
condiciones del combo (Laplace avoid + Markov Bullish): no se descargan velas
de 5 minutos de los más de 9.000 tickets.

Medición (misma definición que el Seguimiento: Dis Ema = EMA − precio):
  · velas de 5 min de la sesión regular (sin pre/post market), como el gráfico;
  · EMA 20 y EMA 200 sobre el cierre, en la ÚLTIMA vela de la sesión;
  · precio de referencia = cierre de esa última vela.
En la hoja el nivel es el precio de entrada en el momento del fill; en el
universo no hay fill, así que se mide al cierre de la sesión.

Uso: python scripts/combos_ema5.py --sesion AAAA-MM-DD --pedidos archivo.json --salida data/combos_ema5.json
Nunca falla la actualización: lo que no se pueda descargar queda "sin dato".
"""
import argparse, json, os, re, sys, time
from datetime import datetime, timedelta, timezone

LOTE = 60
MIN_VELAS = 200                      # menos velas: la EMA 200 no es fiable
PRESUPUESTO_MIN = float(os.environ.get("COMBOS_EMA5_MIN", "12"))
R_BLOQUEO = re.compile(r"too many requests|rate.?limit|\b429\b|\b401\b|unauthorized|crumb|\b403\b|forbidden", re.I)


def yf_symbol(t):
    """BRK.B / BRK/B → BRK-B; conserva bolsas extranjeras (0700.HK)."""
    t = str(t).strip().upper().rstrip("*").replace("/", "-")
    if "." in t:
        base, suf = t.rsplit(".", 1)
        if len(suf) >= 2 or base.isdigit():
            return f"{base}.{suf}"
        return f"{base}-{suf}"
    return t


def medir(df, sesion):
    """EMA20, EMA200 y cierre de la última vela de 5 min de `sesion`.
    Devuelve [ema20, ema200, ref, 'HH:MM', n_velas] o None."""
    if df is None or len(df) == 0 or "Close" not in df.columns:
        return None
    d = df.dropna(subset=["Close"])
    d = d[~d.index.duplicated(keep="last")].sort_index()
    if not len(d):
        return None
    dias = [str(x.date()) for x in d.index]
    idx = [i for i, x in enumerate(dias) if x == sesion]
    if not idx:
        return None
    i = idx[-1]
    cs = d["Close"].astype(float).iloc[: i + 1]
    if len(cs) < MIN_VELAS:
        return None
    e20 = float(cs.ewm(span=20, adjust=False).mean().iloc[-1])
    e200 = float(cs.ewm(span=200, adjust=False).mean().iloc[-1])
    ref = float(cs.iloc[-1])
    if not all(v == v and abs(v) != float("inf") for v in (e20, e200, ref)) or ref <= 0:
        return None
    return [round(e20, 4), round(e200, 4), round(ref, 4), d.index[i].strftime("%H:%M"), int(len(cs))]


def extraer(df, sym, unico):
    try:
        import pandas as pd
        if df is None or len(df) == 0:
            return None
        if isinstance(df.columns, pd.MultiIndex):
            if sym in df.columns.get_level_values(0):
                return df[sym]
            if sym in df.columns.get_level_values(1):
                return df.xs(sym, axis=1, level=1)
            return None
        return df if unico else None
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sesion", required=True)
    ap.add_argument("--pedidos", required=True)
    ap.add_argument("--salida", required=True)
    a = ap.parse_args()
    t0 = time.time()
    try:
        ped = json.load(open(a.pedidos, encoding="utf-8"))
        tickers = list(dict.fromkeys(ped.get("tickers") or []))
    except Exception as e:
        print(f"  ⚠️ EMA 5 min: no se pudo leer la lista de tickets ({e})")
        return
    try:
        out = json.load(open(a.salida, encoding="utf-8"))
        if out.get("sesion") != a.sesion:
            out = {}
    except Exception:
        out = {}
    out.setdefault("sesion", a.sesion)
    out.setdefault("rows", {})
    sin = set(out.get("sin_dato") or [])
    tickers = [t for t in tickers if t not in out["rows"] and t not in sin]
    bloqueado, vacios = False, 0
    if tickers:
        try:
            import yfinance as yf
        except Exception as e:
            print(f"  ⚠️ EMA 5 min: yfinance no disponible ({e})")
            tickers, yf = [], None
        ses = datetime.strptime(a.sesion, "%Y-%m-%d")
        ini, fin = (ses - timedelta(days=21)).strftime("%Y-%m-%d"), (ses + timedelta(days=1)).strftime("%Y-%m-%d")
        for k in range(0, len(tickers), LOTE):
            if (time.time() - t0) / 60 > PRESUPUESTO_MIN:
                print(f"  ⏱ EMA 5 min: se agotó el tiempo ({PRESUPUESTO_MIN:.0f} min); el resto queda para la próxima corrida")
                break
            lote = tickers[k:k + LOTE]
            syms = {yf_symbol(t): t for t in lote}
            df, err = None, ""
            for intento in range(2):
                try:
                    df = yf.download(list(syms), start=ini, end=fin, interval="5m", group_by="ticker",
                                     auto_adjust=True, prepost=False, threads=True, progress=False)
                    break
                except Exception as e:
                    err = str(e)
                    time.sleep(4)
            ok = 0
            for sym, t in syms.items():
                m = medir(extraer(df, sym, len(syms) == 1), a.sesion)
                if m:
                    out["rows"][t] = m
                    ok += 1
                else:
                    sin.add(t)
            if ok == 0:
                vacios += 1
                for t in lote:                     # un lote entero vacío no prueba nada de cada ticker
                    sin.discard(t)
                if R_BLOQUEO.search(err) or vacios >= 2:
                    bloqueado = True
                    print("  ⚠️ EMA 5 min: Yahoo dejó de responder; se usa lo que alcanzó a llegar")
                    break
                time.sleep(20)
            else:
                vacios = 0
            time.sleep(0.5)
    out["sin_dato"] = sorted(sin)
    out["bloqueado"] = bloqueado
    out["built_at"] = datetime.now(timezone.utc).isoformat()[:19] + "Z"
    out["definicion"] = ("EMA 20 y EMA 200 sobre el cierre de las velas de 5 min (sesión regular) en la última vela de la sesión; "
                         "rows[ticker] = [ema20, ema200, cierre de esa vela, hora ET, velas usadas]")
    os.makedirs(os.path.dirname(os.path.abspath(a.salida)), exist_ok=True)
    with open(a.salida, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  EMA 5 min ({a.sesion}): {len(out['rows'])} tickets con dato, {len(sin)} sin velas suficientes"
          f"{' · interrumpido' if bloqueado else ''} · {(time.time() - t0) / 60:.1f} min")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:                       # nunca tumba la actualización
        print(f"  ⚠️ EMA 5 min no se calculó: {e}")
    sys.exit(0)
