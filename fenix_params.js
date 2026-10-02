/*
 * FENIX SCANNER PRO — Parámetros del Seguimiento (Excel / CSV)
 * ------------------------------------------------------------------
 * Calcula, para cada alerta del Historial, los valores que muestran las
 * pestañas Hessian, Markov, Game Theory, Entry Zones, Analysis y Laplace,
 * con los MISMOS ajustes por defecto del dashboard:
 *   Markov = 5 periodos · Laplace s = 0.3 · Game Theory = Nash / Semanal ·
 *   Entry Zones = Semanal.
 *
 * Las funciones del bloque "COPIA LITERAL" son copias exactas (texto idéntico)
 * de index.html; los bloques marcados "(líneas de renderX)" reproducen las
 * líneas de esas funciones de render sin cambios. Así el Excel coincide con
 * lo que ves en cada pestaña. Funciona en el navegador (window.FenixParams)
 * y en Node (require) para generar data/seguimiento.csv en los workflows.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FenixParams = factory();
})(typeof self !== "undefined" ? self : this, function () {

// ═══ COPIA LITERAL de index.html (AndFig v18) ═══
var MK_STATES=["BEARISH","NEUTRAL","BULLISH","STRONG"];

function gradeScore(g){if(!g)return 0;var l=g.toLowerCase();if(l==="excel"||l==="strong"||l==="cheap")return 5;if(l==="good"||l==="solid")return 4;if(l==="fair"||l==="mod")return 3;if(l==="med"||l==="pricey")return 2;return l==="n/a"?0:1}

function compositeScore(r){return Math.round(((gradeScore(r.eps_gr)*.30+gradeScore(r.roe_gr)*.25+gradeScore(r.roa_gr)*.20+gradeScore(r.pe_gr)*.25)/5)*100)}

function compositeGrade(s){if(s>=80)return{t:"EXCELENTE",c:"excellent"};if(s>=65)return{t:"BUENO",c:"good"};if(s>=45)return{t:"REGULAR",c:"fair"};return{t:"DÉBIL",c:"poor"}}

function isEtfOrIndex(r){var s=r.sector||"";return s==="Index"||s==="ETF"||s==="Commodity"||s==="Fixed Income"}

function earlinessScore(r){
  var rsi=r.rsi||50, d20=r["20d"]||0, d5=r["5d"]||0, close=r.close||0;
  var ext=r.ext||0; // extension from moving average
  var e=50; // neutral start
  
  // RSI: best entry is RSI 40-55 (coming out of oversold)
  if(rsi>=40&&rsi<=55)e+=20;           // Sweet spot — fresh move
  else if(rsi>=30&&rsi<40)e+=25;       // Oversold recovery — very early
  else if(rsi>=55&&rsi<=65)e+=10;      // Early momentum
  else if(rsi>65&&rsi<=72)e-=5;        // Getting extended
  else if(rsi>72)e-=20;                // Already overbought — LATE
  else if(rsi<30)e+=15;                // Deep oversold — contrarian early
  
  // 20D momentum: positive but not excessive = early trend
  if(d20>=0&&d20<=8)e+=15;             // Fresh uptrend forming
  else if(d20>8&&d20<=15)e+=5;         // Established trend
  else if(d20>15&&d20<=25)e-=10;       // Extended trend
  else if(d20>25)e-=25;                // Too far gone — LATE
  else if(d20<0&&d20>=-8)e+=10;        // Bottoming / accumulation
  else if(d20<-8)e+=5;                 // Deep pullback opportunity
  
  // 5D vs 20D: recent acceleration on fresh base = ideal early entry
  if(d5>0&&d20<=5&&d20>=-5)e+=15;      // Breaking out from base
  else if(d5>3&&d20>10)e-=10;          // Acceleration into top
  
  // Extension from MA: low extension = fresh
  if(ext>=-2&&ext<=3)e+=10;            // Near MA = fresh entry
  else if(ext>3&&ext<=8)e+=0;          // Slightly extended
  else if(ext>8)e-=15;                 // Extended far from MA
  
  return Math.max(0,Math.min(100,Math.round(e)));
}

function earlinessLabel(e){
  if(e>=70)return{t:"TEMPRANO",c:"var(--green)",desc:"Inicio de movimiento"};
  if(e>=55)return{t:"FRESCO",c:"var(--cyan)",desc:"Movimiento en desarrollo"};
  if(e>=40)return{t:"MADURO",c:"var(--amber)",desc:"Tendencia establecida"};
  if(e>=25)return{t:"TARDIO",c:"var(--orange)",desc:"Movimiento avanzado"};
  return{t:"EXTENDIDO",c:"var(--red)",desc:"Cerca de techo"};
}

function mkCurrentState(r){
  var s=r.score||0;
  if(s>=75)return 3;if(s>=55)return 2;if(s>=35)return 1;return 0;
}

function mkEstimateTransitionMatrix(r){
  // Estimate P(i->j) from technical indicators
  var rsi=r.rsi||50,adx=r.adx||15,d20=r["20d"]||0,ai=r.ai||50,score=r.score||0;
  // p_up: probability of improving one state
  var p_up=0.35;
  if(rsi<30)p_up+=0.12;else if(rsi<40)p_up+=0.06;else if(rsi>70)p_up-=0.10;else if(rsi>60)p_up-=0.04;
  if(d20>5)p_up+=0.08;else if(d20>0)p_up+=0.04;else if(d20<-5)p_up-=0.08;else if(d20<0)p_up-=0.04;
  if(adx>25)p_up+=0.05;else if(adx<12)p_up-=0.03;
  if(ai>70)p_up+=0.07;else if(ai>60)p_up+=0.03;else if(ai<40)p_up-=0.05;
  p_up=Math.max(0.05,Math.min(0.65,p_up));
  var p_dn=Math.max(0.05,Math.min(0.65,1-p_up-0.15));
  var p_stay=1-p_up-p_dn;
  // Build 4x4 transition matrix (birth-death chain, Sec 2.9 of PDF)
  // From state i: can go to i-1 (q_i), stay at i (r_i), or go to i+1 (p_i)
  var P=[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  // State 0 (BEARISH): q0=0 (boundary), r0, p0
  P[0][0]=p_dn+p_stay*0.4; P[0][1]=p_up*0.7+p_stay*0.4; P[0][2]=p_up*0.25+p_stay*0.15; P[0][3]=p_up*0.05+p_stay*0.05;
  // State 1 (NEUTRAL): q1, r1, p1
  P[1][0]=p_dn*0.6; P[1][1]=p_stay+p_dn*0.25; P[1][2]=p_up*0.75+p_dn*0.1; P[1][3]=p_up*0.25+p_dn*0.05;
  // State 2 (BULLISH): q2, r2, p2
  P[2][0]=p_dn*0.15; P[2][1]=p_dn*0.5; P[2][2]=p_stay+p_dn*0.2; P[2][3]=p_up*0.85+p_dn*0.15;
  // State 3 (STRONG): p3=0 (boundary), r3, q3
  P[3][0]=p_dn*0.05; P[3][1]=p_dn*0.15; P[3][2]=p_dn*0.45+p_stay*0.3; P[3][3]=p_up+p_stay*0.7+p_dn*0.35;
  // Normalize each row to sum to 1
  for(var i=0;i<4;i++){var s=0;for(var j=0;j<4;j++)s+=P[i][j];for(var j=0;j<4;j++)P[i][j]=Math.round(P[i][j]/s*10000)/10000}
  return P;
}

function mkMatMul(A,B){
  // 4x4 matrix multiplication
  var C=[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  for(var i=0;i<4;i++)for(var j=0;j<4;j++){var s=0;for(var k=0;k<4;k++)s+=A[i][k]*B[k][j];C[i][j]=Math.round(s*10000)/10000}
  return C;
}

function mkMatPow(P,n){
  // P^n via repeated squaring (Chapman-Kolmogorov, Theorem 2.1)
  var R=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];// Identity
  var base=P.map(function(row){return row.slice()});
  while(n>0){if(n%2===1)R=mkMatMul(R,base);base=mkMatMul(base,base);n=Math.floor(n/2)}
  return R;
}

function mkSteadyState(P){
  // Steady-state via power iteration: pi = pi*P converges as n->inf (Eq 2.12)
  var Pn=mkMatPow(P,200);
  // All rows converge to steady state
  return Pn[0];
}

function mkAbsorptionProb(P){
  // Probability of reaching STRONG(3) before BEARISH(0) from each state
  // Using birth-death chain formula (Proposition 2.8):
  // P_k(H_a < H_b) = sum(j=k..b-1) gamma_j / sum(j=a..b-1) gamma_j
  // gamma_j = prod(i=1..j) q_i/p_i
  // Here a=0 (BEARISH), b=3 (STRONG)
  // q_i = P[i][i-1], p_i = P[i][i+1]
  var gamma=[1]; // gamma_0 = 1
  for(var j=1;j<4;j++){
    var qi=j>0?P[j][j-1]:0;
    var pi=j<3?P[j][j+1]:0;
    if(pi<0.001)pi=0.001;
    gamma.push(gamma[j-1]*(qi/pi));
  }
  // P_k(H_3 < H_0) = sum(j=0..k-1) gamma_j / sum(j=0..2) gamma_j
  var totalGamma=gamma[0]+gamma[1]+gamma[2];
  var probs=[0,0,0,1];// state 3 already there = 1
  for(var k=1;k<3;k++){
    var num=0;for(var j=0;j<k;j++)num+=gamma[j];
    probs[k]=Math.round(num/totalGamma*10000)/10000;
  }
  return probs;// [P(0->3), P(1->3), P(2->3), 1]
}

function laplaceTransform(samples,s){
  // Discrete Laplace: sum_{k=0}^{n-1} f(k) * e^(-s*k)
  var L=0;
  for(var k=0;k<samples.length;k++){
    L+=samples[k]*Math.exp(-s*k);
  }
  return L;
}

function laplaceAnalysis(r,s){
  // Synthesize a discrete signal from the available indicators
  // [close_today, close_5d_ago_proxy, close_20d_ago_proxy, momentum, rsi_normalized]
  var close=r.close||0;
  var d5=r["5d"]||0, d20=r["20d"]||0;
  var rsi=(r.rsi||50)/100; // normalize to 0-1
  var adx=(r.adx||15)/50;  // normalize
  var score=(r.score||0)/100;
  var ai=(r.ai||50)/100;
  
  // Reconstruct price time-series (approximate)
  var p20=close/(1+d20/100);
  var p5=close/(1+d5/100);
  var p_today=close;
  // Build "deviation from baseline" signal f(t) — relative returns
  // f(0)=today, f(1)=5d, f(2)=20d, f(3)=momentum, f(4)=rsi_signal
  var signal=[d5/100, d20/100, (d5-d20)/200, rsi-0.5, score-0.5];
  
  // Compute L{f} at given s
  var L=laplaceTransform(signal,s);
  
  // Estimate "dominant pole" from signal decay rate
  // A pure exponential f(t) = A*e^(-a*t) has Laplace L(s) = A/(s+a)
  // So a ~ -ln(f(1)/f(0)) if both positive
  var pole=0;
  if(signal[0]!==0&&signal[1]!==0){
    var ratio=signal[1]/signal[0];
    if(ratio>0&&ratio<1){pole=-Math.log(ratio)} // decaying - stable
    else if(ratio>1){pole=Math.log(ratio)}      // growing - unstable
    else{pole=0.5} // oscillating
  }
  
  // Stability: negative pole = stable (trend damping), positive = unstable (trend accelerating)
  var stability=pole<=0?"STABLE":pole<0.3?"DAMPED":pole<0.7?"OSCILLATING":"UNSTABLE";
  var stabColor=pole<=0?"var(--green)":pole<0.3?"var(--cyan)":pole<0.7?"var(--amber)":"var(--red)";
  
  // Frequency response magnitude |L(s)| - how strong the signal is at frequency s
  var magnitude=Math.abs(L);
  
  // Phase angle (conceptual for market cycles)
  // Using signal component relationships
  var phase=Math.atan2(signal[1],signal[0])*180/Math.PI;
  
  // Final value theorem: lim_{t->inf} f(t) = lim_{s->0} s*F(s)
  // Predicts long-term tendency
  var finalValue=s*laplaceTransform(signal,0.01);
  var trend=finalValue>0.05?"BULLISH":finalValue>-0.05?"NEUTRAL":"BEARISH";
  
  // Laplace Score: combines stability + magnitude + trend direction
  var lpScore=50;
  if(stability==="STABLE")lpScore+=25;
  else if(stability==="DAMPED")lpScore+=15;
  else if(stability==="OSCILLATING")lpScore-=5;
  else lpScore-=25;
  
  if(trend==="BULLISH")lpScore+=20;
  else if(trend==="BEARISH")lpScore-=20;
  
  if(magnitude>0.3&&magnitude<1.5)lpScore+=10;
  else if(magnitude>2)lpScore-=10;
  
  lpScore=Math.max(0,Math.min(100,Math.round(lpScore)));
  
  var signal_rec=lpScore>=65?"BUY":lpScore>=50?"HOLD":"AVOID";
  var sigColor=lpScore>=65?"var(--green)":lpScore>=50?"var(--amber)":"var(--red)";
  
  return{
    L:Math.round(L*10000)/10000,
    pole:Math.round(pole*10000)/10000,
    stability:stability,stabColor:stabColor,
    magnitude:Math.round(magnitude*10000)/10000,
    phase:Math.round(phase*100)/100,
    finalValue:Math.round(finalValue*10000)/10000,
    trend:trend,
    lpScore:lpScore,
    signal:signal_rec,sigColor:sigColor,
    samples:signal
  };
}
// ═══ fin de la copia literal ═══

var DEFAULTS = { mkSteps: 5, lpS: 0.3, gtModel: "nash", gtHorizon: "week", ezHorizon: "week" };

function pf(v, d) { return v != null ? v.toFixed(d || 2) : "—"; }
function tc(s) {  // "STRONG BUY" → "Strong Buy" (formato de tu hoja)
  return String(s).toLowerCase().replace(/(^|[\s\/(])([a-záéíóúñ])/g, function (m, a, b) { return a + b.toUpperCase(); });
}
function r2(v) { return v == null || !isFinite(v) ? null : Math.round(v * 100) / 100; }
function r3(v) { return v == null || !isFinite(v) ? null : Math.round(v * 1000) / 1000; }
function r4(v) { return v == null || !isFinite(v) ? null : Math.round(v * 10000) / 10000; }

// ── Markov (líneas de renderMarkov) ──
function markov(r, nSteps) {
  nSteps = nSteps || DEFAULTS.mkSteps;
  var state=mkCurrentState(r);
  var P=mkEstimateTransitionMatrix(r);
  var Pn=mkMatPow(P,nSteps);
  var steady=mkSteadyState(P);
  var absProb=mkAbsorptionProb(P);
  var pStrong=Pn[state][3];// P(reach STRONG in n steps)
  var pBearish=Pn[state][0];// P(fall to BEARISH in n steps)
  var absorb=absProb[state];// P(reach STRONG before BEARISH)
  var mkScore=Math.round((pStrong*40+absorb*30+(1-pBearish)*20+steady[3]*10)*100)/100;
  var signal=mkScore>=55?"STRONG BUY":mkScore>=40?"BUY":mkScore>=25?"HOLD":"AVOID";
  var estac='B:'+(steady[0]*100).toFixed(0)+'% N:'+(steady[1]*100).toFixed(0)+'% Bu:'+(steady[2]*100).toFixed(0)+'% S:'+(steady[3]*100).toFixed(0)+'%';
  return { state: state, stateName: MK_STATES[state], mkScore: mkScore, signal: signal,
           absorb: absorb, steady: steady, estacionaria: estac, pStrong: pStrong, pBearish: pBearish };
}

// ── Game Theory (líneas de renderGameTheory) ──
function gameTheory(r, model, hz) {
  model = model || DEFAULTS.gtModel; hz = hz || DEFAULTS.gtHorizon;
  var tgt=hz==="week"?{min:3,max:6,sl:2}:hz==="month"?{min:6,max:10,sl:4}:{min:6,max:10,sl:6};
  if(model==="bayesian"){tgt.min*=1.15;tgt.max*=1.2;tgt.sl*=0.8}// Bayesian: tighter stops, higher targets
  if(model==="sequential"){tgt.min*=0.9;tgt.max*=0.95;tgt.sl*=1.1}// Sequential: conservative
  tgt.min=Math.round(tgt.min*10)/10;tgt.max=Math.round(tgt.max*10)/10;tgt.sl=Math.round(tgt.sl*10)/10;
  var cs=compositeScore(r);var etf=isEtfOrIndex(r);
  var candidate=(function(){
    if(etf){return r.score>=25&&(r.upside||0)>0&&(r["20d"]||0)>-3}
    if(model==="nash")return cs>=40&&r.score>=20&&(r.upside||0)>0;
    if(model==="bayesian")return cs>=45&&(r.ai||0)>=50&&(r.upside||0)>0;
    return cs>=35&&(r.state==="ENTRY+"||r.state==="ENTRY"||r.state==="ACCUM")&&(r.upside||0)>0;
  })();
  var rsi=r.rsi||50,adx=r.adx||15,ai=r.ai||50,d20=r["20d"]||0,d5=r["5d"]||0,rv=r.rel_vol||1;
  var lk_rsi_up=(rsi>40&&rsi<65)?0.62:rsi<=40?0.48:0.38;
  var lk_rsi_dn=(rsi>40&&rsi<65)?0.42:rsi<=40?0.55:0.60;
  var lk_adx_up=adx>20?(adx>30?0.58:0.55):0.45;
  var lk_adx_dn=adx>20?(adx>30?0.52:0.48):0.50;
  var lk_score_up=r.score>=60?0.68:r.score>=40?0.52:0.35;
  var lk_score_dn=r.score>=60?0.30:r.score>=40?0.48:0.62;
  var lk_cs_up=cs>=65?0.66:cs>=45?0.52:0.38;
  var lk_cs_dn=cs>=65?0.35:cs>=45?0.48:0.60;
  var lk_mom_up=d20>5?0.70:d20>0?0.58:0.35;
  var lk_mom_dn=d20>5?0.32:d20>0?0.44:0.65;
  var lk_vol_up=rv>1.2?0.60:rv>0.8?0.52:0.42;
  var lk_vol_dn=rv>1.2?0.50:rv>0.8?0.48:0.52;
  var posterior,nashEq,seqPhase;
  if(model==="nash"){
    var prior_up=0.52;// Historical base rate (52% of weeks are up for S&P)
    var joint_up=prior_up*lk_rsi_up*lk_adx_up*lk_score_up*lk_cs_up*lk_mom_up;
    var joint_dn=(1-prior_up)*lk_rsi_dn*lk_adx_dn*lk_score_dn*lk_cs_dn*lk_mom_dn;
    posterior=joint_up/(joint_up+joint_dn);
    var buyer_str=(r.score/100)*0.3+(ai/100)*0.3+((r.upside||0)/20)*0.2+(d20>0?0.2:0);
    var seller_str=((rsi>70?0.3:0)+(cs<40?0.3:0)+((r.pe||20)>40?0.2:0)+(d20<-5?0.2:0));
    buyer_str=Math.max(0.1,buyer_str);seller_str=Math.max(0.1,seller_str);
    nashEq=r.close*(1+(buyer_str-seller_str)*0.1);
  }else if(model==="bayesian"){
    var prior_up=0.50;// Uninformative prior
    var lk_ai_up=ai>=70?0.72:ai>=55?0.58:0.40;
    var lk_ai_dn=ai>=70?0.30:ai>=55?0.45:0.58;
    var joint_up=prior_up*lk_rsi_up*lk_adx_up*lk_score_up*lk_cs_up*lk_mom_up*lk_vol_up*lk_ai_up;
    var joint_dn=(1-prior_up)*lk_rsi_dn*lk_adx_dn*lk_score_dn*lk_cs_dn*lk_mom_dn*lk_vol_dn*lk_ai_dn;
    posterior=joint_up/(joint_up+joint_dn);
    nashEq=r.close*(1+(r.upside||0)/200);
  }else{
    var stage1=r.state==="ENTRY+"?0.90:r.state==="ENTRY"?0.80:r.state==="ACCUM"?0.65:0.30;// P(institutional active)
    var stage2=d20>5?0.75:d20>0?0.60:0.35;// P(momentum follows | institutional active)
    var stage3=ai>70?0.70:ai>55?0.55:0.40;// P(retail follows | momentum)
    posterior=Math.min(0.93,stage1*stage2*stage3*1.8);// Scaled to reasonable range
    posterior=Math.max(0.2,posterior);
    nashEq=r.close*(1+(r.upside||0)/200);
    seqPhase=r.state==="ENTRY+"?"Fase 3: Retail entry (instituc. + momentum confirmados)":r.state==="ENTRY"?"Fase 2-3: Momentum activo":r.state==="ACCUM"?"Fase 1-2: Acumulación institucional":"Pre-Fase 1: Sin actividad institucional";
  }
  posterior=Math.min(0.95,Math.max(0.15,posterior));
  var probPct=Math.round(posterior*100);
  if(!seqPhase)seqPhase=r.state==="ENTRY+"?"Señal máxima":r.state==="ENTRY"?"Señal activa":r.state==="ACCUM"?"Acumulación":"Espera";
  return { probPct: probPct, cs: cs, rr: (tgt.min/tgt.sl).toFixed(1)+':1', fase: seqPhase,
           nashEq: nashEq, nashEqTxt: pf(nashEq,2), candidate: candidate };
}

// ── Entry Zones (líneas de renderEntryZones) ──
function entryZones(r, hz) {
  hz = hz || DEFAULTS.ezHorizon;
  var minS = 0; // el filtro de la pestaña no cambia los valores de cada fila
  var cs=compositeScore(r),cg=compositeGrade(cs);
  var etf=isEtfOrIndex(r);
  var candidate=etf?(r.score>=30&&r.upside>0&&(r["20d"]||0)>-3):(cs>=minS&&r.upside>0&&(r.eps_g||0)>=-5);
  var prob=Math.min(95,Math.max(55,50+cs*.3+(r.ai||0)*.15+(r.upside>10?10:r.upside>5?5:0)));
  return { prob: prob, probTxt: pf(prob,0)+'%', cs: cs, calidad: cg.t, upside: r.upside, upsideTxt: pf(r.upside,1),
           d20: r["20d"], d20Txt: pf(r["20d"],1), candidate: candidate };
}

// ── Analysis (líneas de renderAnalysis, secciones 2, 4 y 5) ──
// secRoeAvg = promedio de ROE del sector en todo el universo ese día (sección 2).
function analysis(r, secRoeAvg) {
  var vs = secRoeAvg == null ? null : (r.roe||0)-secRoeAvg;   // "ROE +x" de la tarjeta del sector
  var es=gradeScore(r.eps_gr),ra=gradeScore(r.roa_gr),isETF=isEtfOrIndex(r);var q;
  if(isETF){q="N/A (ETF/Índice)"}else if(es>=4&&ra>=4){q="Alta"}else if(es>=4&&ra<=2){q="Sospechosa"}else if(es>=3&&ra>=3){q="Aceptable"}else{q="Débil"}
  var ro=r.roe||0,ra2=r.roa||0,ratio=(ro>0&&ra2>0)?ro/ra2:0;var risk=isETF?"N/A":ratio>3?"ALTO":ratio>2?"MOD":ratio>0?"BAJO":"N/A";
  return { etf: isETF, roe: r.roe, roeVsSector: vs == null ? null : parseFloat(pf(vs,1)),
           roa: r.roa, eps: r.eps_g, calidad: q, riesgo: risk };
}

// ── Hessian (líneas de renderHessian; sin el relleno aleatorio de AndFig) ──
function hessian(r) {
  if(!r.hessian||r.hessian.det===undefined) return null;
  var H=r.hessian,cls=H["class"];
  var signal=cls==="LOCAL_MIN"?"COMPRAR":cls==="LOCAL_MAX"?"EVITAR":cls==="SADDLE"?"ESPERAR":"NEUTRAL";
  return { clase: cls.replace("_"," "), fxx: H.fxx, fyy: H.fyy, det: H.det, curvature: H.curvature, signal: signal };
}

// ── Laplace (líneas de renderLaplace) ──
function laplace(r, s) {
  s = s == null ? DEFAULTS.lpS : s;
  var la=laplaceAnalysis(r,s);
  var e=earlinessScore(r);
  var eLbl=earlinessLabel(e);
  return { trend: la.trend, stability: la.stability, earliness: e, earlinessTxt: eLbl.t+' ('+e+')',
           lpScore: la.lpScore, signal: la.signal };
}

// ═══ Columnas de la hoja SEGUIMIENTO (A → AY) ═══
var GROUPS = [
  ["Seguimiento de Señales", 13], ["Temp 5 minutos", 3], ["Temp 1 Hora", 3], ["Temp 1 Dia", 3],
  ["Hessian", 6], ["Markov", 4], ["Game Theory", 5], ["Entry Zones", 4], ["Analysis", 5], ["Laplace", 5]
];
// [clave, encabezado de tu hoja, nombre único para CSV, formato Excel]
var COLUMNS = [
  ["ticker","Ticket","Ticket","@"], ["sector","Sector","Sector","@"], ["industry","Industry","Industry","@"],
  ["f_senal","Fecha Señal","Fecha Señal","dd/mm/yyyy"], ["f_fill","Fecha Fill","Fecha Fill","dd/mm/yyyy"],
  ["entry","$ Entrada","$ Entrada",'"$"#,##0.00'], ["tp1","TP1","TP1",'"$"#,##0.00'], ["tp2","TP2","TP2",'"$"#,##0.00'],
  ["sl","$ Stop Loss","$ Stop Loss",'"$"#,##0.00'], ["f_cierre","Fecha Cierre","Fecha Cierre","dd/mm/yyyy"],
  ["p_cierre","$ Cierre","$ Cierre",'"$"#,##0.00'], ["gan","% Gan/Per","% Gan/Per",'0.00%;\\(0.00%\\);"—"'],
  ["estado","Estado","Estado","@"],
  ["m5_20","Dis Ema 20","5m Dis Ema 20","0.00"], ["m5_200","Dis Ema 200","5m Dis Ema 200","0.00"], ["m5_dif","Dif","5m Dif","0.00"],
  ["h1_20","Dis Ema 20","1h Dis Ema 20","0.00"], ["h1_200","Dis Ema 200","1h Dis Ema 200","0.00"], ["h1_dif","Dif","1h Dif","0.00"],
  ["d1_20","Dis Ema 20","1D Dis Ema 20","0.00"], ["d1_200","Dis Ema 200","1D Dis Ema 200","0.00"], ["d1_dif","Dif","1D Dif","0.00"],
  ["h_clase","Clase","Hessian Clase","@"], ["h_fxx","F_XX","F_XX","0.0000"], ["h_fyy","F_YY","F_YY","0.0000"],
  ["h_det","Det(h)","Det(h)","0.0000"], ["h_curv","Curvatura","Curvatura","0.0000"], ["h_senal","Señal","Hessian Señal","@"],
  ["mk_score","Score","Markov Score","0.00"], ["mk_estado","Estado / Signal","Markov Estado / Signal","@"],
  ["mk_abs","Absorcion","Absorcion","0.0%"], ["mk_estac","Estacionaria","Estacionaria","@"],
  ["gt_nash","Nash","Nash","0.0%"], ["gt_comp","Composite","Composite","0"], ["gt_rr","R/R","R/R","@"],
  ["gt_fase","Fase","Fase","@"], ["gt_eq","Nash Esquilibrium","Nash Esquilibrium",'"$"#,##0.00'],
  ["ez_prob","Prob","Prob","0.0%"], ["ez_up","Upside","Upside","0.0%"], ["ez_20d","20D","20D","0.0%"],
  ["ez_cal","Calidad","EZ Calidad","@"],
  ["an_roe","Roe","Roe","0.00"], ["an_roa","Roa","Roa",'0.0"%"'], ["an_eps","Eps","Eps",'0.0"%"'],
  ["an_cal","Calidad","Analysis Calidad","@"], ["an_riesgo","Riesgo/deuda","Riesgo/deuda","@"],
  ["lp_tend","Tendencia","Tendencia","@"], ["lp_estab","Estabilidad","Estabilidad","@"],
  ["lp_early","Eariness","Eariness","@"], ["lp_score","Lp Score","Lp Score","0"], ["lp_senal","Señal","Laplace Señal","@"]
];
var ESTADOS = { "TP2": "WIN", "SL": "LOSS", "TP1": "PARCIAL TP1", "ACTIVA": "ACTIVA",
                "PENDIENTE": "ESPERANDO FILL", "EXPIRADA": "EXPIRADA", "SIN FILL": "SIN FILL" };

function emaTrip(e) {
  if (!e || e.d20 == null) return [null, null, null];
  var d20 = e.d20, d200 = e.d200 == null ? null : e.d200;
  // Dif = ABS(Dis Ema 20) − ABS(Dis Ema 200)  (misma fórmula de tu hoja)
  return [d20, d200, d200 == null ? null : r2(Math.abs(d20) - Math.abs(d200))];
}

function emaFill(a, cap) {
  var ef = (cap && cap.ema_fill) || null;
  if (!a.fill_date || !ef || ef.dia !== a.fill_date || ef.nivel !== a.entry) return {};
  return ef;
}

// Hoja 2 del Excel: el detalle de cada medición, con la misma tabla de tu script
var VERIF_COLUMNS = [
  ["Ticket", "@"], ["Fecha Señal", "dd/mm/yyyy"], ["Fecha Fill", "dd/mm/yyyy"], ["Nivel ($ Entrada)", '"$"#,##0.00'],
  ["TF", "@"], ["Evento", "@"], ["Hora", "@"], ["Ref", '"$"#,##0.00'],
  ["EMA 20", "0.00"], ["Δ", "0.00"], ["%", "0.00"], ["EMA 200", "0.00"], ["Δ", "0.00"], ["%", "0.00"],
  ["POC", "0.00"], ["Δ", "0.00"], ["%", "0.00"], ["POC→E20", "0.00"], ["%", "0.00"], ["POC→E200", "0.00"], ["%", "0.00"],
  ["Nota", "@"]
];
function r2n(v) { return v == null ? null : Math.round(v * 100) / 100; }
function buildVerif(history, seg, mode, day) {
  var alerts = (history && history.alerts) || [], rows = (seg && seg.rows) || {}, out = [];
  alerts.filter(function (a) { return inRange(a, mode, day); }).forEach(function (a) {
    var ef = emaFill(a, rows[a.id]);
    if (!a.fill_date) return;
    [["1D", "d1"], ["1h", "h1"], ["5m", "m5"]].forEach(function (tf) {
      var e = ef[tf[1]];
      var base = [a.ticker, a.asof || null, a.fill_date, a.entry, tf[0]];
      if (!e) { out.push(base.concat([null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, "se calcula en la corrida nocturna del día del fill"])); return; }
      if (e.no_disponible || e.evento === "sin sesión") { out.push(base.concat([e.evento || null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, e.no_disponible || "sin sesión ese día"])); return; }
      out.push(base.concat([e.evento, e.hora, e.ref, r2n(e.ema20), e.d20, e.p20, r2n(e.ema200), e.d200, e.p200,
        r2n(e.poc), e.dpoc == null ? null : e.dpoc, e.ppoc == null ? null : e.ppoc,
        e.poc_e20 == null ? null : e.poc_e20, e.poc_e20_p == null ? null : e.poc_e20_p,
        e.poc_e200 == null ? null : e.poc_e200, e.poc_e200_p == null ? null : e.poc_e200_p,
        (e.evento === "Gap apertura" || e.evento === "Gap intradía" ? "operado a " + e.operado + "; " : "") + (e.aviso || "")]));
    });
  });
  return out;
}

// Fila del snapshot con la que se calculan los parámetros de las pestañas.
//   "fill"  (por defecto): la del día del fill; null si aún no hay fill o si
//            no existe snapshot de ese día.
//   "senal": la del día en que apareció la señal.
function paramRow(a, cap, dia) {
  cap = cap || {};
  if (dia === "senal") return cap.row || null;
  var rf = cap.row_fill;
  return (a.fill_date && rf && rf.asof === a.fill_date) ? rf : null;
}
// Por qué una alerta no tiene parámetros (para el mensaje de la descarga)
function paramEstado(a, cap, dia) {
  if (paramRow(a, cap, dia)) return "ok";
  if (dia === "senal") return "sin_fila";
  if (!a.fill_date) return "sin_fill";
  return (cap && cap.row_fill_falta) ? "sin_snapshot" : "pendiente";
}

// Una fila de la hoja SEGUIMIENTO a partir de la alerta y de lo capturado
function buildRow(a, cap, opts) {
  opts = opts || {};
  cap = cap || {};
  var o = {};
  o.ticker = a.ticker;
  o.sector = cap.sector || "—"; o.industry = cap.industry || "—";
  o.f_senal = a.asof || (a.alerted_at || "").slice(0, 10) || null;
  o.f_fill = a.fill_date || null;
  o.entry = a.entry; o.tp1 = a.tp1; o.tp2 = a.tp2; o.sl = a.sl;
  var closed = ["TP2", "SL", "EXPIRADA", "SIN FILL"].indexOf(a.status) >= 0;
  o.f_cierre = closed ? (a.outcome_date || null) : null;
  var pct = a.result_pct != null ? a.result_pct : (a.status === "ACTIVA" || a.status === "TP1" ? a.live_pct : null);
  o.gan = pct == null ? null : r4(pct / 100);
  o.p_cierre = o.gan == null || a.entry == null ? null : r2(a.entry * (1 + o.gan));
  o.estado = ESTADOS[a.status] || a.status;
  // Distancias EMA EN EL FILL (primer encuentro con el nivel de entrada el día
  // del fill, como tu script "Nivel → EMAs + POC v3"). Sin fill → vacías.
  var ema = emaFill(a, cap);
  var m5 = emaTrip(ema.m5), h1 = emaTrip(ema.h1), d1 = emaTrip(ema.d1);
  o.m5_20 = m5[0]; o.m5_200 = m5[1]; o.m5_dif = m5[2];
  o.h1_20 = h1[0]; o.h1_200 = h1[1]; o.h1_dif = h1[2];
  o.d1_20 = d1[0]; o.d1_200 = d1[1]; o.d1_dif = d1[2];
  // Parámetros de las pestañas: por defecto, la fila del snapshot del DÍA DEL
  // FILL (lo que mostraban Hessian, Markov, Game Theory, Entry Zones, Analysis y
  // Laplace la noche en que se activó la entrada). Sin fill → vacíos, igual que
  // las distancias EMA. opts.paramDia = "senal" usa la fila del día de la señal.
  var r = paramRow(a, cap, opts.paramDia);
  if (r && r.close != null) {
    var h = hessian(r);
    if (h) { o.h_clase = tc(h.clase); o.h_fxx = h.fxx; o.h_fyy = h.fyy; o.h_det = h.det; o.h_curv = h.curvature; o.h_senal = tc(h.signal); }
    var mk = markov(r, opts.mkSteps);
    o.mk_score = mk.mkScore; o.mk_estado = tc(mk.stateName) + "/" + tc(mk.signal);
    o.mk_abs = r3(mk.absorb); o.mk_estac = mk.estacionaria;
    var gt = gameTheory(r, opts.gtModel, opts.gtHorizon);
    o.gt_nash = gt.probPct / 100; o.gt_comp = gt.cs; o.gt_rr = gt.rr; o.gt_fase = gt.fase; o.gt_eq = r2(gt.nashEq);
    var ez = entryZones(r, opts.ezHorizon);
    o.ez_prob = r4(parseFloat(ez.probTxt) / 100);   // la pestaña muestra 2 decimales (94.78%)
    // mismo redondeo que la pantalla (toFixed(1)) → fracción para el formato % de tu hoja
    o.ez_up = ez.upside == null ? null : r3(parseFloat(ez.upsideTxt) / 100);
    o.ez_20d = ez.d20 == null ? null : r3(parseFloat(ez.d20Txt) / 100);
    o.ez_cal = ez.calidad;
    var an = analysis(r, r._sec_roe_avg);
    if (an.etf) { o.an_roe = "ETF"; }
    else { o.an_roe = an.roeVsSector; o.an_roa = an.roa; o.an_eps = an.eps; o.an_cal = an.calidad; o.an_riesgo = an.riesgo === "N/A" ? "N/A" : tc(an.riesgo); }
    var lp = laplace(r, opts.lpS);
    o.lp_tend = tc(lp.trend); o.lp_estab = tc(lp.stability); o.lp_early = tc(lp.earlinessTxt);
    o.lp_score = lp.lpScore; o.lp_senal = String(lp.signal).toLowerCase();
  }
  return COLUMNS.map(function (c) { var v = o[c[0]]; return v === undefined ? null : v; });
}

// Promedio de ROE por sector de un snapshot completo (sección 2 de Analysis)
function sectorRoeAvgs(stocks) {
  var sm = {};
  stocks.forEach(function (r) { (sm[r.sector] = sm[r.sector] || []).push(r); });
  var out = {};
  for (var sec in sm) { var peers = sm[sec], aROE = 0, rc = 0;
    peers.forEach(function (r) { if (r.roe) { aROE += r.roe; rc++; } });
    out[sec] = rc ? aROE / rc : 0; }
  return out;
}

// Filtros de fecha para la descarga
function inRange(a, mode, day) {
  if (mode === "todo") return true;
  var sd = a.asof || (a.alerted_at || "").slice(0, 10);
  if (mode === "senales") return sd === day;
  if (mode === "fills") return a.fill_date === day;
  // "movimientos": señal, fill, TP1 o cierre en ese día
  return sd === day || a.fill_date === day || a.tp1_date === day || a.outcome_date === day;
}

function buildTable(history, seg, mode, day, opts) {
  var alerts = (history && history.alerts) || [];
  var rows = (seg && seg.rows) || {};
  return alerts.filter(function (a) { return inRange(a, mode, day); })
    .map(function (a) { return buildRow(a, rows[a.id], opts); });
}

// CSV: estándar (coma, punto decimal) o Excel en español (punto y coma, coma decimal)
function toCSV(table, variant) {
  var es = variant === "es";
  var sep = es ? ";" : ",";
  function cell(v, i) {
    if (v == null) return "";
    var fmt = COLUMNS[i][3];
    if (typeof v === "number") {
      var s = String(v);
      return es ? s.replace(".", ",") : s;
    }
    if (fmt === "dd/mm/yyyy" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      var p = v.split("-"); v = p[2] + "/" + p[1] + "/" + p[0];
    }
    v = String(v);
    return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  var lines = [COLUMNS.map(function (c) { return c[2]; }).join(sep)];
  table.forEach(function (row) { lines.push(row.map(cell).join(sep)); });
  return "﻿" + lines.join("\r\n") + "\r\n";
}

return { DEFAULTS: DEFAULTS, GROUPS: GROUPS, COLUMNS: COLUMNS, ESTADOS: ESTADOS,
         markov: markov, gameTheory: gameTheory, entryZones: entryZones, analysis: analysis,
         hessian: hessian, laplace: laplace, buildRow: buildRow, buildTable: buildTable,
         inRange: inRange, toCSV: toCSV, tc: tc, sectorRoeAvgs: sectorRoeAvgs,
         VERIF_COLUMNS: VERIF_COLUMNS, buildVerif: buildVerif, emaFill: emaFill,
         paramRow: paramRow, paramEstado: paramEstado,
         _lit: { compositeScore: compositeScore, compositeGrade: compositeGrade, earlinessScore: earlinessScore,
                 earlinessLabel: earlinessLabel, laplaceAnalysis: laplaceAnalysis, mkEstimateTransitionMatrix: mkEstimateTransitionMatrix } };
});
