function renderMatchingTable(match) {
  var th = function(t, align){
    return '<th style="text-align:'+(align||'right')+';padding:8px 6px;font-size:10px;color:var(--g400);font-weight:500;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--g100)">'+t+'</th>';
  };
  var html = '';

  // ── Barra de salut: coherència + estat de les bandes ──
  var res = match.resum;
  if (res && res.coherencia !== null && res.coherencia !== undefined) {
    var cohCol = res.coherencia >= 90 ? '#1A5C3A' : (res.coherencia >= 75 ? '#7A4A00' : '#C0392B');
    var cohBg  = res.coherencia >= 90 ? '#EAF3DE' : (res.coherencia >= 75 ? '#FEF5E7' : '#FDF0F0');
    html += '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;padding:14px 16px;background:'+cohBg+';border-radius:10px;margin-bottom:16px">'
      + '<div><div style="font-size:9px;color:var(--g500);text-transform:uppercase;letter-spacing:.07em;margin-bottom:2px">Coherència amb el target</div>'
        + '<div style="font-family:var(--fm);font-size:22px;font-weight:600;color:'+cohCol+'">'+res.coherencia+'<span style="font-size:13px;opacity:.6">/100</span></div></div>'
      + '<div><div style="font-size:9px;color:var(--g500);text-transform:uppercase;letter-spacing:.07em;margin-bottom:2px">Deriva màxima</div>'
        + '<div style="font-family:var(--fm);font-size:15px;font-weight:600;color:var(--black)">'+res.deriva_max_pp.toFixed(1)+' pp</div></div>'
      + '<div><div style="font-size:9px;color:var(--g500);text-transform:uppercase;letter-spacing:.07em;margin-bottom:2px">Fora de banda</div>'
        + '<div style="font-family:var(--fm);font-size:15px;font-weight:600;color:'+(res.n_fora_banda>0?'#C0392B':'#1A5C3A')+'">'+res.n_fora_banda+' categori'+(res.n_fora_banda===1?'a':'es')+'</div></div>'
      + '<div style="flex:1;min-width:180px;font-size:11px;color:var(--g600);line-height:1.5">'
        + (res.cal_rebalanceig
            ? 'Hi ha categories fora de la banda 5/25. Prioritza-les a la propera aportació abans de vendre res.'
            : 'Totes les categories estan dins de banda. No cal rebalancejar: aporta i prou.')
      + '</div>'
    + '</div>';
    if (res.fora_pla_pct > 0.5) {
      html += '<div style="padding:11px 15px;background:#FDF0F0;border:1px solid #E8B4B4;border-radius:9px;font-size:11px;color:#8C2F2F;margin-bottom:14px">'
        + '⚠ <strong>'+res.fora_pla_pct.toFixed(1)+'%</strong> de la cartera està en categories que no formen part del pla. Apareixen a sota amb target 0%.'
      + '</div>';
    }
  }

  html += '<table style="width:100%;border-collapse:collapse;font-size:12px">'
    + '<thead><tr>'
      + th('Categoria','left') + th('Target') + th('Real') + th('Desv.') + th('Banda') + th('Gap €')
    + '</tr></thead><tbody>';

  match.rows.forEach(function(r){
    var dins = !r.fora_banda;
    var gapCol = dins ? '#1A5C3A' : (r.gap_pct > 0 ? '#7A4A00' : '#C0392B');
    var bg = r.fora_pla ? '#FDF0F0' : (r.fora_banda && r.gap_pct > 0 ? '#FEF5E7' : 'transparent');
    var pastilla = dins
      ? '<span style="display:inline-block;padding:1px 7px;border-radius:99px;font-size:9px;font-weight:600;background:#EAF3DE;color:#1A5C3A">dins</span>'
      : '<span style="display:inline-block;padding:1px 7px;border-radius:99px;font-size:9px;font-weight:600;background:'+(r.gap_pct>0?'#FCEEDC':'#F8DADA')+';color:'+(r.gap_pct>0?'#7A4A00':'#8C2F2F')+'">'+(r.gap_pct>0?'infra':'sobre')+'</span>';
    html += '<tr style="border-bottom:1px solid var(--g50);background:'+bg+'">'
      + '<td style="padding:10px 6px"><span style="font-size:13px;margin-right:6px">'+r.emoji+'</span><span style="font-weight:500">'+r.nom+'</span>'
        + (r.fora_pla ? '<span style="margin-left:6px;font-size:9px;color:#8C2F2F">fora de pla</span>' : '') + '</td>'
      + '<td style="padding:10px 6px;text-align:right;font-family:var(--fm)">'+r.target_pct.toFixed(0)+'%</td>'
      + '<td style="padding:10px 6px;text-align:right;font-family:var(--fm)">'+r.real_pct.toFixed(1)+'%</td>'
      + '<td style="padding:10px 6px;text-align:right;font-family:var(--fm);color:'+gapCol+';font-weight:500">'+(r.gap_pct>=0?'+':'')+r.gap_pct.toFixed(1)+'pp</td>'
      + '<td style="padding:10px 6px;text-align:right;font-family:var(--fm);font-size:11px;color:var(--g400)">±'+r.banda_pp.toFixed(1)+' '+pastilla+'</td>'
      + '<td style="padding:10px 6px;text-align:right;font-family:var(--fm);color:'+gapCol+';font-weight:500">'+(r.gap_eur>=0?'+':'')+Math.round(r.gap_eur).toLocaleString('ca-ES')+'€</td>'
    + '</tr>';
  });
  html += '</tbody></table>'
    + '<div style="margin-top:12px;font-size:10px;color:var(--g400);line-height:1.6">'
      + 'La <strong>banda</strong> segueix la regla 5/25: es rebalanceja quan la desviació supera 5 punts percentuals o el 25% del pes objectiu, el que sigui més estricte. '
      + 'Dins de banda no es toca res — rebalancejar per rebalancejar només genera costos i peatge fiscal.'
    + '</div>';
  return html;
}
