// ════════════════════════════════════════════════════════════════════════════
// FISCALITAT AMPLIADA (portal-fiscalitat)
// Motor de càlcul a tbi-fiscal.js (TBI_FISCAL). La calculadora d'IRPF original
// es conserva intacta com a primera pestanya (renderFiscalitatIRPF).
//
// Educació i anàlisi financera. No és assessorament fiscal.
// ════════════════════════════════════════════════════════════════════════════

var _FISC_TRASPAS  = { capital: 50000, anys: 20, rebalanceig_anys: 1, rebalanceig_pct: 20, ter_fons: 0.30, ter_etf: 0.18, aportacio_anual: 0 };
var _FISC_PENSIONS = { aportacio: 1500, anys: 25, base_general: 40000, ccaa: 'catalunya', ter: 1.00, anys_rescat: 10, pensio_publica: 18000 };
var _FISC_DIV      = { brut: 2000, pais: 'US', altres: 0 };
var _FISC_PERDUES  = { guanys: 8000, rcm: 1500, latents: 15000, dies: 30, cotitzat: true };

function canviarFisTab(t) { window._fisTab = t; renderView('portal-fiscalitat'); }

function _fEur(x) { return Math.round(x).toLocaleString('ca-ES') + '€'; }
function _fPct(x) { return (Math.round(x * 100) / 100).toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'; }
function _fKpi(l, v, s, destacat) {
  return '<div style="flex:1;min-width:145px;padding:15px 17px;border-radius:11px;background:' + (destacat ? 'var(--black)' : 'var(--g50)') + '">'
    + '<div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:' + (destacat ? 'rgba(255,255,255,.55)' : 'var(--g400)') + ';margin-bottom:4px">' + l + '</div>'
    + '<div style="font-family:var(--fm);font-size:21px;font-weight:600;letter-spacing:-.5px;color:' + (destacat ? '#C8A54A' : 'var(--black)') + '">' + v + '</div>'
    + (s ? '<div style="font-size:10px;color:' + (destacat ? 'rgba(255,255,255,.5)' : 'var(--g400)') + ';margin-top:2px">' + s + '</div>' : '')
    + '</div>';
}
function _fCamp(etiqueta, id, valor, oninput, sufix) {
  return '<div class="fis-fld"><label>' + etiqueta + (sufix ? '<span class="fis-sub"> · ' + sufix + '</span>' : '') + '</label>'
    + '<input class="fis-input" type="number" id="' + id + '" value="' + valor + '" oninput="' + oninput + '"></div>';
}
function _fSelect(etiqueta, id, opts, valor, onchange) {
  return '<div class="fis-fld"><label>' + etiqueta + '</label>'
    + '<select id="' + id + '" onchange="' + onchange + '" style="padding:10px 12px;border:1px solid var(--g200);border-radius:8px;font-size:14px;font-family:var(--fb)">'
    + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(valor) === String(o[0]) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('')
    + '</select></div>';
}
function _fEstils() {
  return '<style>'
    + '.fis-card{background:#fff;border:1px solid var(--g200);border-radius:14px;padding:22px 24px;margin-bottom:14px}'
    + '.fis-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}'
    + '.fis-fld{display:flex;flex-direction:column;gap:6px}'
    + '.fis-fld label{font-size:11px;color:var(--g500);font-weight:500;line-height:1.5}'
    + '.fis-fld .fis-sub{font-size:10px;color:var(--g400);font-weight:400}'
    + '.fis-input{padding:10px 12px;border:1px solid var(--g200);border-radius:8px;font-size:14px;font-family:var(--fm);text-align:right}'
    + '.fis-input:focus{outline:none;border-color:var(--accent)}'
    + '.fis-sec-title{font-size:13px;font-weight:600;color:var(--black);margin-bottom:10px;display:flex;align-items:center;gap:8px}'
    + '.fis-sec-title:before{content:"";width:4px;height:14px;background:#1B3A6B;border-radius:2px}'
    + '.fis-t{width:100%;border-collapse:collapse;font-size:12.5px}'
    + '.fis-t th{font-weight:600;text-align:right;padding:9px 8px;font-size:10px;color:var(--g500);text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--g200)}'
    + '.fis-t th:first-child,.fis-t td:first-child{text-align:left}'
    + '.fis-t td{padding:9px 8px;border-bottom:1px solid var(--g100);font-family:var(--fm);text-align:right}'
    + '.fis-t td:first-child{font-family:var(--fb);font-weight:500}'
    + '.fis-info{background:#FEF5E7;border-left:3px solid #D4943A;padding:11px 14px;border-radius:6px;font-size:12px;color:#7A4A00;line-height:1.7;margin-top:12px}'
    + '.fis-info.blau{background:#EBF0FA;border-left-color:#1B3A6B;color:#1B3A6B}'
    + '.fis-info.verd{background:#EAF3DE;border-left-color:#1A5C3A;color:#1A5C3A}'
    + '.fis-info.roig{background:#FDF0F0;border-left-color:#C0392B;color:#8C2F2F}'
    + '.fis-hero{background:var(--black);border-radius:14px;padding:26px 30px;margin-bottom:16px;color:#fff}'
    + '.fis-hero .eb{font-family:var(--fm);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#C8A54A;margin-bottom:9px}'
    + '.fis-hero .tt{font-size:clamp(20px,2.6vw,27px);font-weight:600;letter-spacing:-.02em;line-height:1.32;margin-bottom:9px}'
    + '.fis-hero .sb{color:rgba(255,255,255,.7);font-size:13px;line-height:1.7;max-width:680px}'
    + '</style>';
}

// ── Wrapper amb pestanyes ────────────────────────────────────────────────
function renderPortalFiscalitat(el) {
  var tab = window._fisTab || 'irpf';
  var tabs = [['irpf', '🧾 IRPF de l’estalvi'], ['perdues', '📉 Compensar pèrdues'],
              ['traspas', '🔄 Fons vs ETF'], ['pensions', '🏦 Pla de pensions'],
              ['dividends', '🌍 Dividends estrangers']];
  var bar = '<div class="content-inner fade-in" style="padding-bottom:0">'
    + '<div style="display:flex;gap:6px;margin-bottom:20px;background:var(--g50);padding:4px;border-radius:9px;width:fit-content;flex-wrap:wrap">';
  tabs.forEach(function (t) {
    var on = tab === t[0];
    bar += '<button onclick="canviarFisTab(\'' + t[0] + '\')" style="padding:8px 15px;border-radius:7px;border:none;font-size:12px;font-weight:500;cursor:pointer;font-family:var(--fb);'
      + 'background:' + (on ? 'var(--white)' : 'transparent') + ';color:' + (on ? 'var(--black)' : 'var(--g400)') + ';'
      + 'box-shadow:' + (on ? '0 1px 4px rgba(0,0,0,.1)' : 'none') + '">' + t[1] + '</button>';
  });
  bar += '</div></div>';

  el.innerHTML = _fEstils() + bar + '<div id="fis-panel"></div>';
  var panel = document.getElementById('fis-panel');
  if (tab === 'irpf') renderFiscalitatIRPF(panel);
  else if (tab === 'perdues') renderFiscalitatPerdues(panel);
  else if (tab === 'traspas') renderFiscalitatTraspas(panel);
  else if (tab === 'pensions') renderFiscalitatPensions(panel);
  else if (tab === 'dividends') renderFiscalitatDividends(panel);
}

// ── Peu d'avís comú ───────────────────────────────────────────────────────
function _fPeu(extra) {
  return '<div class="fis-info blau" style="margin-top:16px">ⓘ Contingut d’educació i anàlisi financera amb la normativa vigent per a l’exercici '
    + TBI_FISCAL.REF.exercici + '. No és assessorament fiscal ni substitueix un assessor col·legiat.'
    + (extra ? ' ' + extra : '') + '</div>';
}

// ════════════════════════════════════════════════════════════════════════
// PESTANYA: COMPENSAR PÈRDUES
// ════════════════════════════════════════════════════════════════════════
function renderFiscalitatPerdues(el) {
  var s = _FISC_PERDUES;
  var res = TBI_FISCAL.aflorarPerdues({ guanys_realitzats: s.guanys, rcm_positiu: s.rcm, perdues_latents: s.latents });
  var regla = TBI_FISCAL.reglaAntiaplicacio(s.dies, s.cotitzat);
  var comp = TBI_FISCAL.compensar({ gpp_positiu: s.guanys, gpp_negatiu: res.aflorar_recomanat, rcm_positiu: s.rcm });

  var html = '<div class="content-inner fade-in">'
    + '<div class="fis-card">'
      + '<div class="fis-sec-title">La teva situació aquest any</div>'
      + '<div class="fis-grid">'
        + _fCamp('Guanys ja realitzats (€)', 'fp-g', s.guanys, '_FISC_PERDUES.guanys=parseFloat(this.value)||0;renderView(\'portal-fiscalitat\')', 'vendes amb benefici')
        + _fCamp('Dividends i interessos (€)', 'fp-r', s.rcm, '_FISC_PERDUES.rcm=parseFloat(this.value)||0;renderView(\'portal-fiscalitat\')', 'rendiments del capital')
        + _fCamp('Pèrdues latents a la cartera (€)', 'fp-l', s.latents, '_FISC_PERDUES.latents=parseFloat(this.value)||0;renderView(\'portal-fiscalitat\')', 'posicions en negatiu sense vendre')
      + '</div>'
    + '</div>';

  html += '<div class="fis-hero">'
    + '<div class="eb">Quant convé aflorar</div>'
    + '<div class="tt">' + (res.aflorar_recomanat > 0
        ? 'Aflora <span style="color:#C8A54A">' + _fEur(res.aflorar_recomanat) + '</span> de pèrdues i estalvia ' + _fEur(res.estalvi) + ' d’impost'
        : 'Enguany no tens res a compensar')
    + '</div>'
    + '<div class="sb">' + (res.aflorar_recomanat > 0
        ? 'Pots absorbir els ' + _fEur(s.guanys) + ' de guanys íntegres, més el ' + TBI_FISCAL.REF.compensacio_creuada_pct
          + '% dels rendiments del capital (' + _fEur(s.rcm * 0.25) + '). Aflorar més enllà d’això no t’estalvia res aquest any: '
          + 'les pèrdues sobrants s’arrosseguen i, si no les fas servir abans del ' + comp.caduca_exercici + ', caduquen.'
        : 'Sense guanys realitzats ni rendiments, aflorar pèrdues només serveix per generar saldo per a anys futurs.')
    + '</div></div>';

  html += '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px">'
    + _fKpi('Impost sense aflorar', _fEur(res.quota_sense))
    + _fKpi('Impost aflorant', _fEur(res.quota_amb), 'sobre base de ' + _fEur(comp.base_imposable), true)
    + _fKpi('Estalvi', _fEur(res.estalvi), _fPct(res.quota_sense > 0 ? res.estalvi / res.quota_sense * 100 : 0) + ' menys')
    + _fKpi('Sobrant per a anys futurs', _fEur(res.sobrant), 'caduca el ' + comp.caduca_exercici)
    + '</div>';

  html += '<div class="fis-card">'
    + '<div class="fis-sec-title">Com queda la liquidació</div>'
    + '<table class="fis-t"><tbody>'
    + [['Guanys patrimonials nets', _fEur(comp.gpp_net)],
       ['Rendiments del capital nets', _fEur(comp.rcm_net)],
       ['Compensació creuada aplicada', _fEur(comp.creuada_aplicada) + ' (límit ' + _fEur(comp.creuada_limit) + ')'],
       ['Base imposable de l’estalvi', _fEur(comp.base_imposable)],
       ['Quota', _fEur(comp.quota)],
       ['Tipus mitjà', _fPct(comp.tipus_mitja)],
       ['Saldos pendents per a exercicis futurs', _fEur(comp.pendent_total)]]
      .map(function (f) { return '<tr><td>' + f[0] + '</td><td>' + f[1] + '</td></tr>'; }).join('')
    + '</tbody></table></div>';

  // Comprovador de la regla dels 2 mesos
  html += '<div class="fis-card">'
    + '<div class="fis-sec-title">Comprovador de la regla dels 2 mesos</div>'
    + '<div style="font-size:12px;color:var(--g500);margin-bottom:14px;line-height:1.7">'
      + 'Vendre amb pèrdues per compensar és perfectament legal. El que no pots és recomprar el <em>mateix</em> valor massa aviat: '
      + 'la norma antiaplicació (art. 33.5 LIRPF) bloqueja la pèrdua fins que transmetis definitivament els valors recomprats.</div>'
    + '<div class="fis-grid">'
      + _fCamp('Dies entre la venda i la recompra', 'fp-d', s.dies, '_FISC_PERDUES.dies=parseFloat(this.value)||0;renderView(\'portal-fiscalitat\')')
      + _fSelect('Tipus de valor', 'fp-c', [['si', 'Cotitzat (ETF, accions, fons)'], ['no', 'No cotitzat']], s.cotitzat ? 'si' : 'no',
          '_FISC_PERDUES.cotitzat=(this.value===\'si\');renderView(\'portal-fiscalitat\')')
    + '</div>'
    + '<div class="fis-info ' + (regla.computable ? 'verd' : 'roig') + '">'
      + (regla.computable ? '✓ ' : '✕ ') + regla.nota
      + (regla.computable ? '' : ' Et falten <strong>' + regla.dies_restants + ' dies</strong> (el límit és de ' + regla.limit_dies + ').')
    + '</div>'
    + '<div class="fis-info">' + res.avis + '</div>'
    + '</div>';

  html += _fPeu() + '</div>';
  el.innerHTML = html;
}

// ════════════════════════════════════════════════════════════════════════
// PESTANYA: TRASPÀS DE FONS vs ETF
// ════════════════════════════════════════════════════════════════════════
function renderFiscalitatTraspas(el) {
  var s = _FISC_TRASPAS;
  var pi = (typeof paramsInversioClient === 'function') ? paramsInversioClient() : { retorn: 6, retorn_font: 'valor per defecte' };
  var r = TBI_FISCAL.traspasVsETF({
    capital: s.capital, anys: s.anys, retorn_brut: pi.retorn,
    ter_fons: s.ter_fons, ter_etf: s.ter_etf,
    rebalanceig_anys: s.rebalanceig_anys, rebalanceig_pct: s.rebalanceig_pct,
    aportacio_anual: s.aportacio_anual
  });
  var guanyaFons = (r.guanya === 'fons');

  var html = '<div class="content-inner fade-in">'
    + '<div class="fis-card">'
      + '<div class="fis-sec-title">Els teus supòsits</div>'
      + '<div class="fis-grid">'
        + _fCamp('Capital inicial (€)', 'ft-c', s.capital, '_FISC_TRASPAS.capital=parseFloat(this.value)||0;renderView(\'portal-fiscalitat\')')
        + _fCamp('Aportació anual (€)', 'ft-a', s.aportacio_anual, '_FISC_TRASPAS.aportacio_anual=parseFloat(this.value)||0;renderView(\'portal-fiscalitat\')')
        + _fCamp('Horitzó (anys)', 'ft-n', s.anys, '_FISC_TRASPAS.anys=parseFloat(this.value)||1;renderView(\'portal-fiscalitat\')')
        + _fCamp('TER del fons indexat (%)', 'ft-tf', s.ter_fons, '_FISC_TRASPAS.ter_fons=parseFloat(this.value)||0;renderView(\'portal-fiscalitat\')')
        + _fCamp('TER de l’ETF (%)', 'ft-te', s.ter_etf, '_FISC_TRASPAS.ter_etf=parseFloat(this.value)||0;renderView(\'portal-fiscalitat\')')
        + _fCamp('Rebalanceig cada (anys)', 'ft-rf', s.rebalanceig_anys, '_FISC_TRASPAS.rebalanceig_anys=parseFloat(this.value)||0;renderView(\'portal-fiscalitat\')', '0 = mai')
        + _fCamp('% de cartera que mous (%)', 'ft-rp', s.rebalanceig_pct, '_FISC_TRASPAS.rebalanceig_pct=parseFloat(this.value)||0;renderView(\'portal-fiscalitat\')')
      + '</div>'
      + '<div style="margin-top:12px;font-size:11px;color:var(--g400)">Retorn brut assumit: <strong style="font-family:var(--fm)">' + _fPct(pi.retorn) + '</strong> · ' + pi.retorn_font + '</div>'
    + '</div>';

  html += '<div class="fis-hero">'
    + '<div class="eb">Diferiment contra cost</div>'
    + '<div class="tt">' + (guanyaFons
        ? 'El fons guanya per <span style="color:#C8A54A">' + _fEur(r.diferencia) + '</span> tot i pagar ' + _fPct(r.sobrecost_ter_fons) + ' més de TER'
        : 'L’ETF guanya per <span style="color:#C8A54A">' + _fEur(-r.diferencia) + '</span>: el TER menor supera el cost fiscal')
    + '</div>'
    + '<div class="sb">'
      + (r.breakeven_ter_fons !== null
          ? 'El diferiment per traspàs val la pena mentre el fons no passi d’un TER del <strong style="color:#fff">'
            + _fPct(r.breakeven_ter_fons) + '</strong>. Per damunt d’aquí, més val l’ETF barat i pagar impostos pel camí. '
          : '')
      + r.nota
    + '</div></div>';

  html += '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px">'
    + _fKpi('Fons indexat · net', _fEur(r.fons.net), 'traspàs sense tributar', guanyaFons)
    + _fKpi('ETF · net', _fEur(r.etf.net), 'tributa a cada venda', !guanyaFons)
    + _fKpi('Impostos pel camí (ETF)', _fEur(r.etf.impostos_pel_cami), 'diner que deixa de compondre')
    + _fKpi('TER màxim del fons', r.breakeven_ter_fons !== null ? _fPct(r.breakeven_ter_fons) : '—', 'per seguir guanyant')
    + '</div>';

  html += '<div class="fis-card">'
    + '<div class="fis-sec-title">Comparativa detallada a ' + r.anys + ' anys</div>'
    + '<table class="fis-t"><thead><tr><th>&nbsp;</th><th>Fons indexat</th><th>ETF</th></tr></thead><tbody>'
    + [['Valor brut al final', _fEur(r.fons.valor_brut), _fEur(r.etf.valor_brut)],
       ['Impostos pagats pel camí', _fEur(r.fons.impostos_pel_cami), _fEur(r.etf.impostos_pel_cami)],
       ['Impost a la liquidació final', _fEur(r.fons.impost_final), _fEur(r.etf.impost_final)],
       ['Impostos totals', _fEur(r.fons.impostos_totals), _fEur(r.etf.impostos_totals)],
       ['<strong>Net a la butxaca</strong>', '<strong>' + _fEur(r.fons.net) + '</strong>', '<strong>' + _fEur(r.etf.net) + '</strong>']]
      .map(function (f) { return '<tr><td>' + f[0] + '</td><td>' + f[1] + '</td><td>' + f[2] + '</td></tr>'; }).join('')
    + '</tbody></table>'
    + '<div class="fis-info">El règim de diferiment per traspàs (art. 94 LIRPF) només s’aplica a fons d’inversió i SICAV. '
      + 'Els ETF n’estan exclosos: cada venda és un fet imposable, encara que reinverteixis el mateix dia.</div>'
    + (s.rebalanceig_anys === 0
        ? '<div class="fis-info blau">Amb rebalanceig desactivat només compta el TER, perquè cap dels dos ven res fins al final. '
          + 'El diferiment només val diners si <em>mous</em> la cartera: com més rebalancegis, més val.</div>'
        : '')
    + '</div>';

  html += _fPeu() + '</div>';
  el.innerHTML = html;
}

// ════════════════════════════════════════════════════════════════════════
// PESTANYA: PLA DE PENSIONS
// ════════════════════════════════════════════════════════════════════════
function renderFiscalitatPensions(el) {
  var s = _FISC_PENSIONS;
  var pi = (typeof paramsInversioClient === 'function') ? paramsInversioClient() : { retorn: 6 };
  var r = TBI_FISCAL.planPensions({
    aportacio_anual: s.aportacio, anys_aportant: s.anys, base_general_actual: s.base_general,
    ccaa: s.ccaa, retorn_brut: pi.retorn, ter: s.ter, anys_rescat: s.anys_rescat,
    pensio_publica_anual: s.pensio_publica
  });
  var guanyaPla = (r.guanya === 'pla');

  var html = '<div class="content-inner fade-in">'
    + '<div class="fis-card">'
      + '<div class="fis-sec-title">Les teves dades</div>'
      + '<div class="fis-grid">'
        + _fCamp('Aportació anual (€)', 'fq-a', s.aportacio, '_FISC_PENSIONS.aportacio=parseFloat(this.value)||0;renderView(\'portal-fiscalitat\')', 'límit deduïble: ' + _fEur(r.limit_individual))
        + _fCamp('Anys aportant', 'fq-n', s.anys, '_FISC_PENSIONS.anys=parseFloat(this.value)||1;renderView(\'portal-fiscalitat\')')
        + _fCamp('Base general actual (€)', 'fq-b', s.base_general, '_FISC_PENSIONS.base_general=parseFloat(this.value)||0;renderView(\'portal-fiscalitat\')', 'el teu sou imposable')
        + _fCamp('TER del pla (%)', 'fq-t', s.ter, '_FISC_PENSIONS.ter=parseFloat(this.value)||0;renderView(\'portal-fiscalitat\')', 'sol ser alt')
        + _fCamp('Pensió pública estimada (€/any)', 'fq-p', s.pensio_publica, '_FISC_PENSIONS.pensio_publica=parseFloat(this.value)||0;renderView(\'portal-fiscalitat\')')
        + _fCamp('Anys per rescatar', 'fq-r', s.anys_rescat, '_FISC_PENSIONS.anys_rescat=parseFloat(this.value)||1;renderView(\'portal-fiscalitat\')', 'repartir-ho baixa l’impost')
        + _fSelect('Comunitat', 'fq-c', [['catalunya', 'Catalunya'], ['generica', 'Escala de referència']], s.ccaa,
            '_FISC_PENSIONS.ccaa=this.value;renderView(\'portal-fiscalitat\')')
      + '</div>'
      + (r.excedeix_limit
          ? '<div class="fis-info roig">Aportes ' + _fEur(r.aportacio_anual) + ' però només ' + _fEur(r.aportacio_deduible)
            + ' donen dret a reducció. Els ' + _fEur(r.excés) + ' restants no desgraven i, en canvi, tributaran íntegrament al rescat: '
            + 'és el pitjor dels dos mons. Aquest excedent va molt millor en un fons indexat.</div>'
          : '')
    + '</div>';

  html += '<div class="fis-hero">'
    + '<div class="eb">Dedueixes ara, tributes després</div>'
    + '<div class="tt">' + (guanyaPla
        ? 'El pla guanya per <span style="color:#C8A54A">' + _fEur(r.diferencia) + '</span>'
        : 'El fons indexat guanya per <span style="color:#C8A54A">' + _fEur(-r.diferencia) + '</span>')
    + '</div>'
    + '<div class="sb">Dedueixes al <strong style="color:#fff">' + _fPct(r.marginal_ara) + '</strong> i rescataries al <strong style="color:#fff">'
      + _fPct(r.marginal_rescat) + '</strong>. '
      + (r.diferencial_marginal >= 0
          ? 'Com que al rescat tributaries a un tipus inferior, el pla juga a favor teu per partida doble: t’estalvies impost ara i en pagues menys després.'
          : 'Tot i que al rescat tributaries a un tipus <em>superior</em>, dins del pla el creixement no tributa cada any — i aquest avantatge compensa uns quants punts de diferencial. '
            + 'Per això la regla popular de «mira només el marginal» és massa simple.')
    + '</div></div>';

  html += '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px">'
    + _fKpi('Estalvi fiscal anual', _fEur(r.estalvi_fiscal_anual), _fEur(r.estalvi_fiscal_total) + ' en ' + r.anys_aportant + ' anys', true)
    + _fKpi('Net amb pla', _fEur(r.net_pla), 'pla + estalvi reinvertit', guanyaPla)
    + _fKpi('Net amb fons', _fEur(r.net_fons), 'sense deducció', !guanyaPla)
    + _fKpi('Impost al rescat', _fEur(r.pla_impost_rescat), 'en ' + r.anys_rescat + ' anys')
    + '</div>';

  html += '<div class="fis-card">'
    + '<div class="fis-sec-title">Els dos camins, en detall</div>'
    + '<table class="fis-t"><thead><tr><th>&nbsp;</th><th>Pla de pensions</th><th>Fons indexat</th></tr></thead><tbody>'
    + [['Capital acumulat', _fEur(r.pla_brut), _fEur(r.fons_brut)],
       ['Estalvi fiscal reinvertit', _fEur(r.sidecar_brut), '—'],
       ['Impost sobre el rescat', _fEur(r.pla_impost_rescat), '—'],
       ['Impost sobre plusvàlues', _fEur(r.sidecar_impost), _fEur(r.fons_impost)],
       ['<strong>Net a la butxaca</strong>', '<strong>' + _fEur(r.net_pla) + '</strong>', '<strong>' + _fEur(r.net_fons) + '</strong>']]
      .map(function (f) { return '<tr><td>' + f[0] + '</td><td>' + f[1] + '</td><td>' + f[2] + '</td></tr>'; }).join('')
    + '</tbody></table>'
    + '<div class="fis-info">Al pla tributa <strong>tot</strong> el que rescates com a rendiment del treball, no només el guany. '
      + 'Per això rescatar-ho de cop és car: concentres anys d’estalvi en un sol exercici i te’n vas al tram més alt. '
      + 'Repartir el rescat en ' + r.anys_rescat + ' anys és el que fa que els números quadrin.</div>'
    + '<div class="fis-info blau">Aquest càlcul assumeix que l’estalvi fiscal es reinverteix cada any. Si te’l gastes, el pla perd bona part del seu avantatge: '
      + 'la deducció no és un regal, és capital que has de posar a treballar.</div>'
    + '<div class="fis-info roig">Els plans de pensions solen cobrar comissions molt superiors a un fons indexat. '
      + 'Ara mateix has posat un TER del ' + _fPct(s.ter) + ': si el teu pla en cobra més, torna a fer el càlcul — és el factor que més fàcilment gira el resultat.</div>'
    + '</div>';

  html += _fPeu() + '</div>';
  el.innerHTML = html;
}

// ════════════════════════════════════════════════════════════════════════
// PESTANYA: DIVIDENDS ESTRANGERS
// ════════════════════════════════════════════════════════════════════════
function renderFiscalitatDividends(el) {
  var s = _FISC_DIV;
  var r = TBI_FISCAL.dividendsEstrangers({ dividend_brut: s.brut, pais: s.pais, altres_rendiments_estalvi: s.altres });
  var w8 = TBI_FISCAL.costSenseW8BEN(s.brut, s.altres);
  var paisos = [];
  for (var k in TBI_FISCAL.REF.retencions_origen) {
    if (TBI_FISCAL.REF.retencions_origen.hasOwnProperty(k)) paisos.push([k, TBI_FISCAL.REF.retencions_origen[k].nom]);
  }

  var html = '<div class="content-inner fade-in">'
    + '<div class="fis-card">'
      + '<div class="fis-sec-title">El teu dividend</div>'
      + '<div class="fis-grid">'
        + _fCamp('Dividend brut anual (€)', 'fd-b', s.brut, '_FISC_DIV.brut=parseFloat(this.value)||0;renderView(\'portal-fiscalitat\')')
        + _fSelect('País d’origen', 'fd-p', paisos, s.pais, '_FISC_DIV.pais=this.value;renderView(\'portal-fiscalitat\')')
        + _fCamp('Altres rendiments de l’estalvi (€)', 'fd-a', s.altres, '_FISC_DIV.altres=parseFloat(this.value)||0;renderView(\'portal-fiscalitat\')', 'determinen el tram')
      + '</div>'
    + '</div>';

  html += '<div class="fis-hero">'
    + '<div class="eb">Tipus efectiu real</div>'
    + '<div class="tt">Del dividend brut te’n queda un <span style="color:#C8A54A">' + _fPct(100 - r.tipus_efectiu) + '</span></div>'
    + '<div class="sb">' + r.avis + '</div></div>';

  html += '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px">'
    + _fKpi('Retingut a origen', _fEur(r.retingut_origen), _fPct(r.retencio_origen_pct) + ' a ' + r.pais)
    + _fKpi('A pagar a Espanya', _fEur(r.a_pagar_espanya), 'després de la deducció')
    + _fKpi('Net a la butxaca', _fEur(r.net), _fPct(r.tipus_efectiu) + ' d’impost total', true)
    + _fKpi('Perdut per doble imposició', _fEur(r.exces_no_deduible), r.exces_no_deduible > 0 ? 'reclamable a origen' : 'res a reclamar')
    + '</div>';

  html += '<div class="fis-card">'
    + '<div class="fis-sec-title">El recorregut del teu dividend</div>'
    + '<table class="fis-t"><tbody>'
    + [['Dividend brut', _fEur(r.dividend_brut)],
       ['Retenció a origen (' + _fPct(r.retencio_origen_pct) + ')', '−' + _fEur(r.retingut_origen)],
       ['Impost espanyol de l’estalvi', '−' + _fEur(r.impost_espanya)],
       ['Deducció per doble imposició internacional', '+' + _fEur(r.deduccio_doble_imposicio)],
       ['A ingressar a Hisenda', '−' + _fEur(r.a_pagar_espanya)],
       ['<strong>Net</strong>', '<strong>' + _fEur(r.net) + '</strong>']]
      .map(function (f) { return '<tr><td>' + f[0] + '</td><td>' + f[1] + '</td></tr>'; }).join('')
    + '</tbody></table>'
    + '<div class="fis-info">La deducció per doble imposició internacional està limitada al <strong>menor</strong> de dos imports: '
      + 'l’impost pagat a fora (topat al tipus del conveni, ' + _fPct(r.conveni_pct) + ') i l’impost espanyol sobre aquesta renda. '
      + 'Tot el que et retinguin per damunt del conveni no es recupera via IRPF: s’ha de reclamar al país d’origen.</div>'
    + '</div>';

  if (s.pais === 'US' || s.pais === 'US_SENSE') {
    html += '<div class="fis-card">'
      + '<div class="fis-sec-title">El formulari W-8BEN</div>'
      + '<div style="font-size:12px;color:var(--g500);margin-bottom:14px;line-height:1.7">'
        + 'És un formulari que signes al teu bròquer per acreditar que ets resident fiscal a Espanya. '
        + 'Sense ell, els EUA retenen el 30% en comptes del 15% del conveni — i aquest 15% extra no es recupera per IRPF.</div>'
      + '<table class="fis-t"><thead><tr><th>&nbsp;</th><th>Amb W-8BEN</th><th>Sense</th></tr></thead><tbody>'
      + [['Retenció a origen', _fEur(w8.amb_w8ben.retingut_origen), _fEur(w8.sense_w8ben.retingut_origen)],
         ['Impostos totals', _fEur(w8.amb_w8ben.total_impostos), _fEur(w8.sense_w8ben.total_impostos)],
         ['<strong>Net</strong>', '<strong>' + _fEur(w8.net_amb) + '</strong>', '<strong>' + _fEur(w8.net_sense) + '</strong>']]
        .map(function (f) { return '<tr><td>' + f[0] + '</td><td>' + f[1] + '</td><td>' + f[2] + '</td></tr>'; }).join('')
      + '</tbody></table>'
      + '<div class="fis-info ' + (w8.cost_anual > 0 ? '' : 'verd') + '">No tenir-lo signat et costaria <strong>' + _fEur(w8.cost_anual)
        + ' cada any</strong> amb aquest dividend. Es signa un cop, es renova cada tres anys i triga dos minuts. '
        + 'Comprova-ho al teu bròquer: és dels pocs diners gratis que hi ha en inversió.</div>'
      + '</div>';
  }

  html += '<div class="fis-card">'
    + '<div class="fis-sec-title">Per què els ETF irlandesos són tan populars</div>'
    + '<div style="font-size:12px;color:var(--g600);line-height:1.8">'
      + 'Un ETF domiciliat a Irlanda que inverteix en accions dels EUA aprofita el conveni EUA–Irlanda i suporta una retenció del 15% '
      + 'en comptes del 30% que patiria un fons d’un altre domicili. A més, si és d’acumulació, els dividends es reinverteixen dins del fons '
      + 'sense passar per la teva declaració: no tributes fins que venguis. '
      + 'És la mateixa idea del diferiment que veus a la pestanya de fons contra ETF, aplicada als dividends.'
    + '</div>'
    + '<div class="fis-info blau">Això és una explicació del funcionament del règim fiscal, no una recomanació de cap producte ni domicili concret.</div>'
    + '</div>';

  html += _fPeu() + '</div>';
  el.innerHTML = html;
}
