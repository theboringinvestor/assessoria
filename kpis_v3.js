// KPIs globals de cartera
function calcKPIsCartera() {
  var posAgg = calcPosicionsAmbAgregats();
  var moviments = getMovimentsV2();
  var valor_total = 0, cost_total = 0, dividends_total = 0, comissions_total = 0;
  posAgg.forEach(function(p){
    valor_total += (parseFloat(p.valor_actual) || 0);
    cost_total += p.cost_base;
    dividends_total += p.dividends_total;
    comissions_total += p.comissions_total;
  });
  var pnl_eur = valor_total - cost_total;
  var pnl_pct = cost_total > 0 ? (pnl_eur / cost_total * 100) : 0;

  // Antiguitat de la cartera (des del primer moviment de compra)
  var dataInici = null;
  moviments.forEach(function(m){
    if (m.tipus === 'compra' && m.data && (!dataInici || m.data < dataInici)) {
      dataInici = m.data;
    }
  });
  var anys = 0;
  if (dataInici) {
    var d0 = new Date(dataInici);
    if (!isNaN(d0.getTime())) anys = Math.max(0, (new Date() - d0) / (1000*60*60*24*365.25));
  }

  // ── Rendiment anualitzat: TIR diner-ponderada (XIRR) ──
  // Abans s'usava Math.pow(valor/cost, 1/anys), que assumeix que tot el capital
  // va entrar el primer dia. Amb aportacions periòdiques això és incorrecte.
  var xirr = null;
  try {
    var flows = calcFluxosCaixa();
    if (flows.length >= 2) {
      var r = calcXIRR(flows);
      if (r !== null && isFinite(r) && r > -0.9999 && r < 100) xirr = r * 100;
    }
  } catch(e) { xirr = null; }
  var xirr_fiable = (xirr !== null) && (anys * 12 >= MOTOR_V3.xirr_mesos_min);

  return {
    valor_total: valor_total,
    cost_total: cost_total,
    pnl_eur: pnl_eur,
    pnl_pct: pnl_pct,
    dividends_total: dividends_total,
    comissions_total: comissions_total,
    xirr: xirr,                                  // TIR anual % (null si no calculable)
    xirr_fiable: xirr_fiable,                    // false si l'històric és massa curt
    cagr: (xirr !== null ? xirr : 0),            // àlies retrocompatible
    anys_actiu: anys,
    num_posicions: posAgg.length,
    num_moviments: moviments.length,
    data_inici: dataInici
  };
}
