// ── Sparkline del valor de la cartera ───────────────────────────────────
// Fa servir els snapshots mensuals reals. Sense prou història no dibuixa
// res: una línia inventada de dos punts no informa de res.
function sparklineSVG(){
  var snaps = getSnapshots().slice().sort(function(a,b){ return String(a.mes).localeCompare(String(b.mes)); });
  var k = kpisCartera();
  var mesAra = mesActual();
  var serie = snaps.map(function(s){ return { mes:String(s.mes), valor:parseFloat(s.valor)||0 }; });
  var idx = -1;
  for (var i=0;i<serie.length;i++) if (serie[i].mes === mesAra) idx = i;
  if (k.valor_total > 0){
    if (idx >= 0) serie[idx] = { mes:mesAra, valor:k.valor_total };
    else serie.push({ mes:mesAra, valor:k.valor_total });
  }
  if (serie.length < 3) return '';

  var vals = serie.map(function(s){ return s.valor; });
  var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  if (max <= min) return '';
  var W = 300, H = 48;
  var pts = vals.map(function(v,i){
    var x = (i/(vals.length-1))*W;
    var y = H - ((v-min)/(max-min))*(H-6) - 3;
    return x.toFixed(1)+','+y.toFixed(1);
  });
  var puja = vals[vals.length-1] >= vals[0];
  var col = puja ? 'var(--green)' : 'var(--red)';
  return '<svg class="spark" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true">'
    + '<polyline points="'+pts.join(' ')+'" fill="none" stroke="'+col+'" stroke-width="2" '
      + 'stroke-linejoin="round" stroke-linecap="round" opacity=".55"/>'
    + '<circle cx="'+W+'" cy="'+pts[pts.length-1].split(',')[1]+'" r="3" fill="'+col+'"/>'
    + '</svg>';
}

// ── Semàfor de bandes ───────────────────────────────────────────────────
function bandesHTML(){
  var calc = calcAportacio(0);
  if (!calc || !calc.resum || calc.resum.coherencia === null) return '';
  var r = calc.resum;
  var col = r.coherencia >= 90 ? 'var(--green)' : (r.coherencia >= 75 ? 'var(--gold-dark)' : 'var(--red)');
  var bg  = r.coherencia >= 90 ? 'var(--green-bg)' : (r.coherencia >= 75 ? 'var(--gold-bg)' : 'var(--red-bg)');
  var fora = calc.rows.filter(function(x){ return x.foraBanda; });
  var txt = r.cal_rebalanceig
    ? (fora.length === 1
        ? esc(fora[0].nom) + ' està fora de banda. La propera aportació hi anirà.'
        : fora.length + ' categories fora de banda. Les properes aportacions les corregiran.')
    : 'Tot dins de banda. No cal tocar res: aporta i prou.';
  return '<div class="salut" style="background:'+bg+'">'
    + '<div class="salut-num" style="color:'+col+'">'+r.coherencia+'<span>/100</span></div>'
    + '<div class="salut-txt"><strong>Coherència amb el teu pla</strong><br>'+txt+'</div>'
  + '</div>';
}

function renderCartera(){
  var pos = getPosicions();
  var el = $('view');

  if (!pos.length){
    el.innerHTML = '<div class="empty-rich">'
      + '<div class="empty-ico">📊</div>'
      + '<div class="empty-tit">Encara no tens posicions</div>'
      + '<div class="empty-sub">Quan el teu assessor configuri la teva cartera, aquí veuràs el valor, el rendiment real i si estàs alineat amb el teu pla.</div>'
      + '<button class="btn-primary" onclick="go(\'missatges\')">Escriure a l\'assessor</button>'
      + '</div>';
    return;
  }

  var k = kpisCartera();
  var html = '';

  // ── HERO ──
  var colG = k.pnl_eur >= 0 ? 'var(--green)' : 'var(--red)';
  var fletxa = k.pnl_eur >= 0 ? '▲' : '▼';
  html += '<div class="card hero">'
    + sparklineSVG()
    + '<div class="card-lbl">Valor total de la cartera</div>'
    + '<div class="kpi-big">'+eurRound(k.valor_total)+'</div>'
    + '<div class="hero-pnl" style="color:'+colG+'">'+fletxa+' '+(k.pnl_eur>=0?'+':'')+eurRound(k.pnl_eur)
      + ' <span class="hero-pill" style="background:'+(k.pnl_eur>=0?'var(--green-bg)':'var(--red-bg)')+'">'+pct(k.pnl_pct)+'</span></div>'
    + '<div class="hero-grid">';

  // Rendiment anualitzat: TIR si l'històric dona, acumulat si no
  var rendLbl, rendVal, rendCol;
  if (k.xirr !== null && k.xirr_fiable){
    rendLbl = 'Rendiment anual'; rendVal = pct(k.xirr);
    rendCol = k.xirr >= 0 ? 'var(--green)' : 'var(--red)';
  } else {
    rendLbl = 'Rendiment acumulat'; rendVal = pct(k.pnl_pct);
    rendCol = k.pnl_pct >= 0 ? 'var(--green)' : 'var(--red)';
  }
  html += '<div><div class="mini-lbl">Has aportat</div><div class="mini-val">'+eurRound(k.cost_total)+'</div></div>'
    + '<div><div class="mini-lbl">'+rendLbl+'</div><div class="mini-val" style="color:'+rendCol+'">'+rendVal+'</div></div>';
  var tw = twrCartera();
  if (tw && tw.fiable){
    html += '<div><div class="mini-lbl">TWR anual</div><div class="mini-val">'+pct(tw.anual)+'</div></div>';
  }
  html += '</div>';
  if (k.xirr !== null && k.xirr_fiable){
    html += '<div class="hero-nota">El rendiment anual és la TIR: té en compte quan vas posar cada euro, no només quant.</div>';
  } else {
    html += '<div class="hero-nota">Amb menys de 6 mesos d\'històric, anualitzar el rendiment enganya. T\'ensenyem l\'acumulat.</div>';
  }
  html += '</div>';

  // ── Acció principal ──
  var dies = diesDesActualitzacio();
  var necessitaUpd = !carteraActualitzadaAquestMes() && dies !== null;
  var btnTxt = necessitaUpd
    ? (dies === Infinity ? '💱 Posa els valors al dia' : '💱 Actualitzar (fa '+dies+' dies)')
    : '💱 Actualitzar valors';
  html += '<button class="btn-primary" style="margin-bottom:14px" onclick="obrirActualitzar()">'+btnTxt+'</button>';

  // ── Semàfor de bandes ──
  html += bandesHTML();

  // ── Cost real ──
  var t = terCartera();
  if (t){
    html += '<div class="card">'
      + '<div class="card-lbl">Cost real de la teva cartera</div>'
      + '<div class="ter-row">'
        + '<div><div class="mini-lbl">TER ponderat</div><div class="ter-big">'+t.ter_real.toFixed(2).replace('.',',')+'%</div>'
          + '<div class="mini-sub">'+eurRound(t.cost_anual_eur)+'/any</div></div>'
        + '<div><div class="mini-lbl">Banca tradicional</div><div class="ter-big" style="color:var(--g400)">'+t.ter_banc.toFixed(2).replace('.',',')+'%</div>'
          + '<div class="mini-sub">'+eurRound(t.cost_banc_eur)+'/any</div></div>'
        + '<div><div class="mini-lbl">T\'estalvies</div><div class="ter-big" style="color:var(--green)">'+eurRound(t.estalvi_anual_eur)+'</div>'
          + '<div class="mini-sub">cada any</div></div>'
      + '</div></div>';
  }

  // ── Donut ──
  var segs = segmentsPerCategoria();
  var donut = donutSVG(segs);
  if (donut.svg){
    html += '<div class="card">'
      + '<div class="card-lbl" style="margin-bottom:10px">Distribució per família d\'actius</div>'
      + donut.svg + '<div style="margin-top:14px">';
    segs.forEach(function(seg){
      var p = donut.total > 0 ? (seg.valor/donut.total*100) : 0;
      html += '<div class="leg-row">'
        + '<span class="leg-dot" style="background:'+seg.color+'"></span>'
        + '<div class="leg-nom">'+esc(seg.nom)+'</div>'
        + '<div class="leg-pct">'+p.toFixed(0)+'%</div>'
      + '</div>';
    });
    html += '</div></div>';
  }

  // ── Posicions ──
  html += '<div class="card"><div class="card-lbl" style="margin-bottom:8px">Posicions</div>';
  TBI_CARTERA.agregats(pos, getMoviments()).forEach(function(p){
    var valor = parseFloat(p.valor_actual)||0;
    var colP = p.pnl_eur >= 0 ? 'var(--green)' : 'var(--red)';
    var catNom = catInfo(p.cat).nom;
    var sub = [];
    if (p.nom && p.nom !== catNom) sub.push(esc(p.nom));
    if (p.broker) sub.push(esc(p.broker));
    sub.push(p.valor_data ? ('Actualitzat ' + dataHumana(p.valor_data)) : 'Sense valor');
    html += '<div class="pos-row">'
      + '<span class="pos-emoji">'+emojiFor(p)+'</span>'
      + '<div style="flex:1;min-width:0">'
        + '<div class="pos-nom">'+esc(catNom)+'</div>'
        + '<div class="pos-meta">'+sub.join(' · ')+'</div>'
      + '</div>'
      + '<div><div class="pos-val">'+eurRound(valor)+'</div>'
        + '<div class="pos-pnl" style="color:'+colP+'">'+pct(p.pnl_pct)+'</div></div>'
    + '</div>';
  });
  html += '</div>';

  el.innerHTML = html;
}
