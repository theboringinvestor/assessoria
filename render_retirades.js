// ── Estat de la fase de retirada ────────────────────────────────────────
var _RETIR_STATE = { mode: 'acumular', import_net: 1500, frequencia: 'Mensual', considerar_impostos: true };

function canviarModeAportacions(m) { _RETIR_STATE.mode = m; renderView('portal-aportacions'); }

function _rEur(x) { return Math.round(x).toLocaleString('ca-ES') + '€'; }
function _rEur2(x) { return (Math.round(x * 100) / 100).toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€'; }
function _rPct(x) { return (Math.round(x * 100) / 100).toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'; }
function _rKpi(l, v, s, destacat) {
  return '<div style="flex:1;min-width:145px;padding:15px 17px;border-radius:11px;background:' + (destacat ? 'var(--black)' : 'var(--g50)') + '">'
    + '<div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:' + (destacat ? 'rgba(255,255,255,.55)' : 'var(--g400)') + ';margin-bottom:4px">' + l + '</div>'
    + '<div style="font-family:var(--fm);font-size:21px;font-weight:600;letter-spacing:-.5px;color:' + (destacat ? '#C8A54A' : 'var(--black)') + '">' + v + '</div>'
    + (s ? '<div style="font-size:10px;color:' + (destacat ? 'rgba(255,255,255,.5)' : 'var(--g400)') + ';margin-top:2px">' + s + '</div>' : '')
    + '</div>';
}

// ── Wrapper amb selector de mode ────────────────────────────────────────
function renderPortalAportacions(el) {
  var mode = _RETIR_STATE.mode || 'acumular';
  var bar = '<div class="content-inner fade-in" style="padding-bottom:0">'
    + '<div style="display:flex;gap:6px;margin-bottom:20px;background:var(--g50);padding:4px;border-radius:9px;width:fit-content">';
  [['acumular', '📈 Acumular', 'Aportar i comprar'], ['retirar', '📉 Retirar', 'Liquidar i vendre']].forEach(function (t) {
    var on = mode === t[0];
    bar += '<button onclick="canviarModeAportacions(\'' + t[0] + '\')" title="' + t[2] + '" '
      + 'style="padding:9px 20px;border-radius:7px;border:none;font-size:13px;font-weight:500;cursor:pointer;font-family:var(--fb);'
      + 'background:' + (on ? 'var(--white)' : 'transparent') + ';color:' + (on ? 'var(--black)' : 'var(--g400)') + ';'
      + 'box-shadow:' + (on ? '0 1px 4px rgba(0,0,0,.1)' : 'none') + '">' + t[1] + '</button>';
  });
  bar += '</div></div>';

  el.innerHTML = bar + '<div id="aport-panel"></div>';
  var panel = document.getElementById('aport-panel');
  if (mode === 'retirar') renderAportacionsRetirar(panel);
  else renderAportacionsAcumular(panel);
}

// ════════════════════════════════════════════════════════════════════════
// MODE RETIRAR — el matching a la inversa
// ════════════════════════════════════════════════════════════════════════
function renderAportacionsRetirar(el) {
  var c = getClient();
  if (!c) { el.innerHTML = '<div class="content-inner"><p style="padding:40px;color:var(--g400)">Carregant…</p></div>'; return; }

  var kpis = calcKPIsCartera();
  if (!kpis.valor_total) {
    el.innerHTML = '<div class="content-inner fade-in">'
      + '<div style="max-width:600px;margin:30px auto;text-align:center">'
        + '<div style="font-size:40px;margin-bottom:14px">📉</div>'
        + '<div style="font-family:var(--fd);font-size:24px;margin-bottom:10px">Encara no hi ha res per retirar</div>'
        + '<div style="font-size:14px;color:var(--g500);line-height:1.7;margin-bottom:22px">'
          + 'Quan tinguis posicions amb valor de mercat, aquí veuràs de quines vendre per obtenir els diners que necessites '
          + 'sense desequilibrar la cartera.</div>'
        + '<button onclick="navigateTo(\'portal-cartera\')" style="padding:12px 26px;background:var(--black);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:500;cursor:pointer;font-family:var(--fb)">Anar a la cartera</button>'
      + '</div></div>';
    return;
  }

  var s = _RETIR_STATE;
  var esMensual = (s.frequencia === 'Mensual');
  var netAnual = esMensual ? s.import_net * 12 : s.import_net;
  var r = calcRetiradaTactica(s.import_net, { considerar_impostos: s.considerar_impostos });
  var salut = null;
  try { salut = calcSalutRetirada(netAnual); } catch (e) {}

  var html = '<div class="content-inner fade-in">';

  // ── Controls ──
  html += '<div style="background:#fff;border:1px solid var(--g100);border-radius:13px;padding:20px 24px;margin-bottom:18px">'
    + '<div style="font-size:10px;font-weight:600;color:var(--g400);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Quant necessites</div>'
    + '<div style="font-size:12px;color:var(--g500);margin-bottom:16px;line-height:1.6">Indica els diners que vols tenir <strong>a la butxaca</strong>. La plataforma calcula quant cal vendre perquè, després d’impostos, et quedi exactament això.</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;align-items:end">'
      + '<div><label style="font-size:11px;font-weight:500;color:var(--g500);display:block;margin-bottom:4px">Import net (€)</label>'
        + '<input type="number" value="' + s.import_net + '" oninput="_RETIR_STATE.import_net=parseFloat(this.value)||0;renderView(\'portal-aportacions\')" '
        + 'style="width:100%;padding:10px 12px;border:1.5px solid var(--g200);border-radius:8px;font-size:14px;font-family:var(--fm);text-align:right"></div>'
      + '<div><label style="font-size:11px;font-weight:500;color:var(--g500);display:block;margin-bottom:4px">Freqüència</label>'
        + '<select onchange="_RETIR_STATE.frequencia=this.value;renderView(\'portal-aportacions\')" style="width:100%;padding:10px 12px;border:1.5px solid var(--g200);border-radius:8px;font-size:14px;font-family:var(--fb)">'
        + ['Mensual', 'Anual'].map(function (f) { return '<option' + (s.frequencia === f ? ' selected' : '') + '>' + f + '</option>'; }).join('')
        + '</select></div>'
      + '<div><label style="font-size:11px;font-weight:500;color:var(--g500);display:block;margin-bottom:4px">Impostos</label>'
        + '<select onchange="_RETIR_STATE.considerar_impostos=(this.value===\'si\');renderView(\'portal-aportacions\')" style="width:100%;padding:10px 12px;border:1.5px solid var(--g200);border-radius:8px;font-size:14px;font-family:var(--fb)">'
        + '<option value="si"' + (s.considerar_impostos ? ' selected' : '') + '>Incloure IRPF</option>'
        + '<option value="no"' + (!s.considerar_impostos ? ' selected' : '') + '>Només brut</option>'
        + '</select></div>'
    + '</div></div>';

  if (!r) { html += '<div style="padding:20px;color:var(--g400)">No es pot calcular la retirada.</div></div>'; el.innerHTML = html; return; }

  // ── Semàfor de sostenibilitat ──
  if (salut) {
    var colEstat = salut.estat === 'folgat' ? '#1A5C3A' : (salut.estat === 'ajustat' ? '#7A4A00' : '#C0392B');
    var bgEstat = salut.estat === 'folgat' ? '#EAF3DE' : (salut.estat === 'ajustat' ? '#FEF5E7' : '#FDF0F0');
    var txtEstat = salut.estat === 'folgat' ? 'Sostenible amb marge'
      : (salut.estat === 'ajustat' ? 'Al límit del sostenible' : 'Per sobre del sostenible');
    html += '<div style="background:' + bgEstat + ';border-radius:13px;padding:20px 24px;margin-bottom:18px">'
      + '<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:center">'
        + '<div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--g500);margin-bottom:3px">Taxa de retirada</div>'
          + '<div style="font-family:var(--fm);font-size:26px;font-weight:600;color:' + colEstat + '">' + _rPct(salut.taxa_actual) + '</div></div>'
        + '<div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--g500);margin-bottom:3px">Taxa segura per a tu</div>'
          + '<div style="font-family:var(--fm);font-size:26px;font-weight:600;color:var(--black)">' + _rPct(salut.swr_recomanada) + '</div></div>'
        + '<div style="flex:1;min-width:230px">'
          + '<div style="font-size:13px;font-weight:600;color:' + colEstat + ';margin-bottom:4px">' + txtEstat + '</div>'
          + '<div style="font-size:11.5px;color:var(--g600);line-height:1.6">'
            + 'Amb ' + salut.anys_retirada + ' anys de retirada per davant, un ' + _rPct(salut.pct_rv) + ' de renda variable i un TER del '
            + _rPct(salut.ter) + ', la taxa sostenible surt al ' + _rPct(salut.swr_recomanada) + '. '
            + (salut.estat === 'excessiu'
                ? 'Per fer sostenible aquesta retirada et caldrien <strong>' + _rEur(salut.capital_per_sostenible) + '</strong> de cartera.'
                : 'Tens <strong>' + _rPct(salut.marge) + '</strong> de marge.')
          + '</div>'
        + '</div>'
      + '</div>'
      + '<div style="margin-top:12px;font-size:10.5px;color:var(--g500);line-height:1.6">' + salut.swr_detall.nota_fiabilitat + '</div>'
    + '</div>';
  }

  // ── KPIs de l'operació ──
  html += '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px">'
    + _rKpi('Cal vendre', _rEur(r.brut_necessari), _rPct(r.pct_cartera_venut) + ' de la cartera', true)
    + _rKpi('Impost estimat', _rEur(r.impost), _rPct(r.tipus_efectiu) + ' sobre la venda')
    + _rKpi('Et queda net', _rEur(r.net_real), 'objectiu: ' + _rEur(r.net_demanat))
    + _rKpi('Coherència', r.coherencia_abans + ' → ' + r.coherencia_despres,
        r.coherencia_despres >= r.coherencia_abans ? 'la venda rebalanceja' : 'atenció a la deriva')
    + '</div>';

  if (r.insuficient) {
    html += '<div style="padding:14px 17px;background:#FDF0F0;border:1px solid #E8B4B4;border-radius:10px;font-size:12.5px;color:#8C2F2F;margin-bottom:18px;line-height:1.6">'
      + '⚠ La cartera no dona per a aquesta retirada un cop descomptat l’impost. S’ha calculat amb el màxim disponible.</div>';
  }

  // ── Ordres de venda ──
  html += '<div style="background:#fff;border:1px solid var(--g100);border-radius:13px;padding:20px 24px;margin-bottom:18px">'
    + '<div style="font-size:10px;font-weight:600;color:var(--g400);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Què vendre</div>'
    + '<div style="font-size:12px;color:var(--g500);margin-bottom:16px;line-height:1.6">'
      + 'Ordenat per dos criteris: primer les categories que van <strong>sobreponderades</strong> respecte del teu target, '
      + 'i dins de cada categoria la posició amb <strong>menys plusvàlua acumulada</strong> — mateixa caixa, menys impost.</div>';

  if (!r.ordres.length) {
    html += '<div style="padding:20px;text-align:center;color:var(--g400);font-size:12px">Cap ordre de venda necessària.</div>';
  } else {
    html += '<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>'
      + ['Posició', 'Categoria', 'Vendre', '% posició', 'Plusvàlua', 'Guany'].map(function (t, i) {
          return '<th style="text-align:' + (i < 2 ? 'left' : 'right') + ';padding:9px 6px;font-size:10px;color:var(--g400);font-weight:500;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--g100)">' + t + '</th>';
        }).join('')
      + '</tr></thead><tbody>';
    r.ordres.forEach(function (o) {
      html += '<tr style="border-bottom:1px solid var(--g50)">'
        + '<td style="padding:10px 6px;font-weight:500">' + o.nom + (o.liquida_tot ? ' <span style="font-size:9px;color:#C0392B">liquida tot</span>' : '') + '</td>'
        + '<td style="padding:10px 6px;color:var(--g500);font-size:11.5px">' + o.emoji + ' ' + o.nom_cat + '</td>'
        + '<td style="padding:10px 6px;text-align:right;font-family:var(--fm);font-weight:600">' + _rEur(o.import) + '</td>'
        + '<td style="padding:10px 6px;text-align:right;font-family:var(--fm);color:var(--g500)">' + _rPct(o.pct_posicio) + '</td>'
        + '<td style="padding:10px 6px;text-align:right;font-family:var(--fm);color:var(--g500)">' + _rPct(o.ratio_guany * 100) + '</td>'
        + '<td style="padding:10px 6px;text-align:right;font-family:var(--fm);color:#7A4A00">' + _rEur(o.guany) + '</td></tr>';
    });
    html += '</tbody></table>'
      + '<div style="margin-top:14px;padding:12px 15px;background:var(--g50);border-radius:9px;font-size:11.5px;color:var(--g600);line-height:1.7">'
        + 'Vendre primer el que menys plusvàlua porta és ordre de venda, no enginyeria fiscal: l’impost s’acaba pagant igual quan liquidis la resta. '
        + 'El que guanyes és diferir-lo, i el diner diferit segueix component.'
      + '</div>';
    if (r.considerar_impostos) {
      html += '<div style="margin-top:10px;padding:12px 15px;background:#FEF5E7;border:1px solid #E8C285;border-radius:9px;font-size:11.5px;color:#7A4A00;line-height:1.7">'
        + 'Si tens <strong>pèrdues latents</strong> a la cartera, aflorar-ne una part el mateix any compensaria aquests '
        + _rEur(r.guany_realitzat) + ' de guany i reduiria la factura. Ho tens a Fiscalitat → Compensar pèrdues.'
      + '</div>';
    }
  }
  html += '</div>';

  // ── Com queda la cartera ──
  html += '<div style="background:#fff;border:1px solid var(--g100);border-radius:13px;padding:20px 24px;margin-bottom:18px">'
    + '<div style="font-size:10px;font-weight:600;color:var(--g400);text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px">Com queda la cartera</div>'
    + '<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>'
    + ['Categoria', 'Target', 'Abans', 'Venut', 'Després', 'Desviació'].map(function (t, i) {
        return '<th style="text-align:' + (i === 0 ? 'left' : 'right') + ';padding:9px 6px;font-size:10px;color:var(--g400);font-weight:500;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--g100)">' + t + '</th>';
      }).join('')
    + '</tr></thead><tbody>';
  r.despres.forEach(function (d) {
    var millora = Math.abs(d.desviacio_despres) < Math.abs(d.desviacio_abans);
    html += '<tr style="border-bottom:1px solid var(--g50);background:' + (d.fora_pla ? '#FDF0F0' : 'transparent') + '">'
      + '<td style="padding:9px 6px;font-weight:500">' + d.emoji + ' ' + d.nom + (d.fora_pla ? ' <span style="font-size:9px;color:#8C2F2F">fora de pla</span>' : '') + '</td>'
      + '<td style="padding:9px 6px;text-align:right;font-family:var(--fm)">' + d.target_pct.toFixed(0) + '%</td>'
      + '<td style="padding:9px 6px;text-align:right;font-family:var(--fm);color:var(--g500)">' + _rPct(d.abans_pct) + '</td>'
      + '<td style="padding:9px 6px;text-align:right;font-family:var(--fm)">' + (d.venut > 0 ? _rEur(d.venut) : '—') + '</td>'
      + '<td style="padding:9px 6px;text-align:right;font-family:var(--fm);font-weight:600">' + _rPct(d.despres_pct) + '</td>'
      + '<td style="padding:9px 6px;text-align:right;font-family:var(--fm);color:' + (millora ? '#1A5C3A' : 'var(--g500)') + '">'
        + (d.desviacio_despres >= 0 ? '+' : '') + d.desviacio_despres.toFixed(1) + 'pp ' + (millora ? '↓' : '') + '</td></tr>';
  });
  html += '</tbody></table>'
    + '<div style="margin-top:14px;padding:12px 15px;background:' + (r.coherencia_despres >= r.coherencia_abans ? '#EAF3DE' : 'var(--g50)') + ';border-radius:9px;font-size:11.5px;color:' + (r.coherencia_despres >= r.coherencia_abans ? '#1A5C3A' : 'var(--g600)') + ';line-height:1.7">'
      + (r.coherencia_despres >= r.coherencia_abans
          ? 'La retirada <strong>rebalanceja sola</strong>: la coherència amb el target puja de ' + r.coherencia_abans + ' a ' + r.coherencia_despres + '. '
            + 'Aquest és tot el sentit de vendre del que va sobrat en comptes de vendre-ho tot a parts iguals.'
          : 'Aquesta retirada no millora l’alineació perquè la cartera ja estava dins de bandes. Es ven de manera proporcional per no desequilibrar-la.')
    + '</div></div>';

  html += '<div style="padding:13px 16px;background:var(--g50);border-radius:9px;font-size:11px;color:var(--g500);line-height:1.6">'
    + 'ⓘ Simulació d’ordres de venda amb la normativa fiscal vigent per a l’exercici ' + TBI_FISCAL.REF.exercici + '. '
    + 'L’impost real dependrà de la resta de rendes de l’exercici i de les compensacions disponibles. No és assessorament fiscal ni d’inversió.'
    + '</div></div>';

  el.innerHTML = html;
}
