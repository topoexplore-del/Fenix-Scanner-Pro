#!/usr/bin/env python3
"""
Seguimiento de resultados de alertas (Historial del lado del servidor).

Mantiene data/alerts_history.json: cada señal 4/4 confirmada se registra y se
sigue día a día con máximos/mínimos REALES hasta su desenlace:

  · SIN FILL   — el precio nunca bajó a la zona de entrada en 7 sesiones
                 (no cuenta ni como ganancia ni como pérdida: no se pudo entrar)
  · ACTIVA     — entrada ejecutada, ni TP ni SL tocados aún (muestra P&L vivo)
  · TP1        — tocó el primer objetivo (parcial); se sigue hasta TP2 o SL
  · TP2 (WIN)  — objetivo final alcanzado
  · SL (LOSS)  — stop tocado (si TP y SL se tocan el mismo día: SL, conservador)
  · EXPIRADA   — 45 sesiones sin desenlace; se cierra al último precio

El win rate se calcula SOLO sobre operaciones cerradas con fill (TP2 vs SL),
que es la única forma honesta de medirlo.

Corrección Fenix (auditoría 2026-09-30): la señal nace al CIERRE de su vela
(`asof`), así que la orden de entrada solo puede llenarse desde la sesión
SIGUIENTE. En AndFig, cuando el seguimiento corría la misma noche de la señal,
la única vela descargada era la de la propia señal y se usaba para el fill
(fills imposibles). Ahora solo cuentan las velas posteriores a `asof`.
Las alertas afectadas se re-evalúan una sola vez y sus valores originales
quedan guardados en `andfig_original` para poder compararlos.
"""
import json, os, math
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")
FILL_WINDOW = 7      # sesiones para que la orden límite se llene
EXPIRY_DAYS = 45     # sesiones máximas de seguimiento tras el fill

def json_safe(o):
    if isinstance(o, dict): return {k: json_safe(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)): return [json_safe(v) for v in o]
    if isinstance(o, float) and not math.isfinite(o): return None
    return o

def load(name, default):
    try:
        with open(os.path.join(DATA, name), encoding="utf-8") as f:
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

def clean_ohlc(df):
    """Quita velas vacías (Yahoo entrega la última con NaN después de 00:00 UTC)."""
    if df is None or len(df) == 0:
        return df
    d = df.dropna(subset=[c for c in ("Open", "High", "Low", "Close") if c in df.columns])
    return d[~d.index.duplicated(keep="last")].sort_index()

def prefetch(open_alerts, lote=100):
    """Velas diarias de todos los tickers con alertas abiertas, por lotes."""
    try:
        import yfinance as yf
        import pandas as pd
    except Exception:
        return {}
    starts = {}
    for a in open_alerts:
        st = a.get("asof") or (a.get("alerted_at") or "")[:10]
        if st:
            s = yf_symbol(a["ticker"])
            starts[s] = min(starts.get(s, st), st)
    if not starts:
        return {}
    syms = sorted(starts)
    first = min(starts.values())
    out = {}
    for i in range(0, len(syms), lote):
        chunk = syms[i:i + lote]
        try:
            df = yf.download(chunk, start=first, interval="1d", group_by="ticker",
                             auto_adjust=True, threads=True, progress=False)
        except Exception as e:
            print(f"  ⚠️ lote {chunk[0]}…: {e}")
            continue
        for s in chunk:
            try:
                h = df[s] if isinstance(df.columns, pd.MultiIndex) else df
                h = clean_ohlc(h[[c for c in ("Open", "High", "Low", "Close", "Volume") if c in h.columns]])
                if h is not None and len(h):
                    out[s] = h
            except Exception:
                pass
    print(f"  Velas por lotes: {len(out)}/{len(syms)} tickers")
    return out

def migrate_same_candle_fills(hist):
    """Una sola vez: re-evalúa las alertas cuyo fill quedó en la vela de la
    propia señal (imposible: la alerta llega después del cierre)."""
    if hist.get("fenix_migracion"):
        return 0
    n = 0
    for a in hist["alerts"]:
        start = a.get("asof") or (a.get("alerted_at") or "")[:10]
        if a.get("fill_date") and start and a["fill_date"] <= start:
            a["andfig_original"] = {k: a.get(k) for k in
                                    ("status", "fill_date", "outcome_date", "result_pct", "live_pct", "tp1_date")}
            a.update({"status": "PENDIENTE", "fill_date": None, "outcome_date": None,
                      "result_pct": None, "live_pct": None})
            a.pop("tp1_date", None)
            n += 1
    hist["fenix_migracion"] = {"fecha": datetime.now(timezone.utc).isoformat()[:19] + "Z",
                               "reevaluadas": n,
                               "motivo": "fill contado en la vela de la señal (AndFig)"}
    print(f"  🔁 Migración Fenix: {n} alertas con fill en la vela de la señal se re-evalúan")
    return n

def main():
    print("═" * 55 + "\nSEGUIMIENTO DE ALERTAS (historial con resultados)\n" + "═" * 55)
    hist = load("alerts_history.json", {"alerts": []})
    migrate_same_candle_fills(hist)
    alerts_now = load("alerts.json", {})
    existing = {a.get("id") for a in hist["alerts"]}

    # ── 1) Registrar señales nuevas del último chequeo ──
    added = 0
    for s in alerts_now.get("signals", []):
        aid = f"{s['ticker']}_{s.get('asof') or alerts_now.get('checked_at','')[:10]}"
        if aid in existing:
            continue
        z = s.get("zones") or {}
        if not z.get("entry") or not z.get("sl"):
            continue
        hist["alerts"].append({
            "id": aid, "ticker": s["ticker"], "asof": s.get("asof"),
            "alerted_at": alerts_now.get("checked_at"),
            "entry": z["entry"], "sl": z["sl"], "tp1": z.get("tp1"), "tp2": z.get("tp2"),
            "composite": s.get("composite"), "prob": s.get("prob"),
            "buffett": s.get("buffett"), "rs_rank": s.get("rs_rank"), "group": s.get("group"),
            "status": "PENDIENTE", "fill_date": None, "outcome_date": None,
            "result_pct": None, "live_pct": None,
        })
        existing.add(aid); added += 1
    print(f"  Nuevas registradas: {added} | total en historial: {len(hist['alerts'])}")

    # ── 2) Seguir las abiertas con velas diarias reales ──
    open_alerts = [a for a in hist["alerts"] if a["status"] in ("PENDIENTE", "ACTIVA", "TP1")]
    if open_alerts:
        try:
            import yfinance as yf
        except Exception:
            print("  ⚠️ yfinance no disponible — solo registro, sin seguimiento.")
            open_alerts = []
    # Fenix: con el listado completo hay cientos de alertas abiertas; se bajan
    # las velas por lotes de 100 tickers (una sola consulta por lote) y cada
    # alerta usa su tramo desde la fecha de la señal. Mismo dato que antes.
    pref = prefetch(open_alerts) if open_alerts else {}
    tracked = 0
    for a in open_alerts:
        try:
            start = a.get("asof") or (a.get("alerted_at") or "")[:10]
            if not start:
                continue
            full = pref.get(yf_symbol(a["ticker"]))
            if full is not None and len(full) and str(full.index[0].date()) <= start:
                df = full[[str(x.date()) >= start for x in full.index]]
            else:
                df = clean_ohlc(yf.Ticker(yf_symbol(a["ticker"])).history(start=start, auto_adjust=True))
            if df is None or len(df) < 1:
                continue
            # Solo velas POSTERIORES a la de la señal (la señal nace a su cierre).
            # AndFig usaba la propia vela de la señal cuando era la única descargada.
            days = df[[str(x.date()) > start for x in df.index]]
            if len(days) == 0:
                continue
            entry, slv, tp1, tp2 = a["entry"], a["sl"], a.get("tp1"), a.get("tp2")
            fill_i = None
            if a["status"] == "PENDIENTE":
                for i in range(min(FILL_WINDOW, len(days))):
                    if float(days["Low"].iloc[i]) <= entry:
                        fill_i = i
                        a["status"] = "ACTIVA"
                        a["fill_date"] = str(days.index[i].date())
                        break
                if fill_i is None:
                    if len(days) >= FILL_WINDOW:
                        a["status"] = "SIN FILL"
                        a["outcome_date"] = str(days.index[min(FILL_WINDOW, len(days)) - 1].date())
                    tracked += 1
                    continue
            else:
                # ya estaba llena: localizar el índice del fill en esta descarga
                fd = a.get("fill_date")
                fill_i = 0
                for i in range(len(days)):
                    if str(days.index[i].date()) >= (fd or start):
                        fill_i = i; break
            # recorrer día a día desde el fill (mismo día del fill incluido)
            for i in range(fill_i, len(days)):
                lo, hi = float(days["Low"].iloc[i]), float(days["High"].iloc[i])
                dstr = str(days.index[i].date())
                if lo <= slv:  # conservador: si SL y TP se tocan el mismo día, gana el SL
                    a["status"] = "SL"; a["outcome_date"] = dstr
                    a["result_pct"] = round((slv / entry - 1) * 100, 2)
                    break
                if tp2 and hi >= tp2:
                    a["status"] = "TP2"; a["outcome_date"] = dstr
                    a["result_pct"] = round((tp2 / entry - 1) * 100, 2)
                    break
                if tp1 and hi >= tp1 and a["status"] == "ACTIVA":
                    a["status"] = "TP1"; a["tp1_date"] = dstr
            if a["status"] in ("ACTIVA", "TP1"):
                last = float(days["Close"].iloc[-1])
                a["live_pct"] = round((last / entry - 1) * 100, 2)
                if len(days) - fill_i >= EXPIRY_DAYS:
                    a["status"] = "EXPIRADA"
                    a["outcome_date"] = str(days.index[-1].date())
                    a["result_pct"] = a["live_pct"]
            tracked += 1
        except Exception as e:
            print(f"  ⚠️ {a['ticker']}: {e}")

    # ── 3) Resumen honesto: win rate solo sobre cerradas con fill ──
    al = hist["alerts"]
    wins = [a for a in al if a["status"] == "TP2"]
    losses = [a for a in al if a["status"] == "SL"]
    tp1s = [a for a in al if a["status"] == "TP1"]
    closed = len(wins) + len(losses)
    hist["summary"] = {
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "total": len(al),
        "activas": sum(1 for a in al if a["status"] in ("ACTIVA", "TP1", "PENDIENTE")),
        "tp1_parciales": len(tp1s),
        "wins_tp2": len(wins),
        "losses_sl": len(losses),
        "sin_fill": sum(1 for a in al if a["status"] == "SIN FILL"),
        "expiradas": sum(1 for a in al if a["status"] == "EXPIRADA"),
        "win_rate": round(len(wins) / closed * 100, 1) if closed else None,
        "avg_win_pct": round(sum(a["result_pct"] for a in wins) / len(wins), 2) if wins else None,
        "avg_loss_pct": round(sum(a["result_pct"] for a in losses) / len(losses), 2) if losses else None,
        "avg_expirada_pct": (lambda e: round(sum(x["result_pct"] or 0 for x in e) / len(e), 2) if e else None)(
            [a for a in al if a["status"] == "EXPIRADA"]),
    }
    hist["alerts"] = al[-1000:]
    with open(os.path.join(DATA, "alerts_history.json"), "w", encoding="utf-8") as f:
        json.dump(json_safe(hist), f, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    s = hist["summary"]
    print(f"  Seguidas: {tracked} | WIN(TP2): {s['wins_tp2']} | LOSS(SL): {s['losses_sl']} | "
          f"TP1: {s['tp1_parciales']} | win rate: {s['win_rate']}%")

if __name__ == "__main__":
    main()
