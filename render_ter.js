// Targeta de cost real de la cartera. Converteix l'argument de marca
// ("~0,25% contra ~1,80% del banc") en un número personal del client.
function renderTargetaTER() {
  var t = null;
  try { t = calcTERCartera(); } catch(e) { return ''; }
  if (!t) return '';

  var eur = function(x){ return Math.round(x).toLocaleString('ca-ES') + ' €'; };
  var box = function(lbl, val, sub, col){
    return '<div style="flex:1;min-width:130px">'
      + '<div style="font-size:9px;color:var(--g400);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">'+lbl+'</div>'
      + '<div style="font-family:var(--fm);font-size:19px;font-weight:600;color:'+(col||'var(--black)')+'">'+val+'</div>'
      + (sub ? '<div style="font-size:10px;color:var(--g400);margin-top:2px">'+sub+'</div>' : '')
    + '</div>';
  };

  var vsTarget = '';
  if (t.ter_target !== null) {
    var d = t.ter_real - t.ter_target;
    vsTarget = box('Target de l’arquetip', t.ter_target.toFixed(2) + '%',
      (Math.abs(d) < 0.03 ? 'alineat' : (d > 0 ? '+' + d.toFixed(2) + 'pp per sobre' : d.toFixed(2) + 'pp per sota')),
      Math.abs(d) < 0.03 ? 'var(--g500)' : (d > 0 ? '#C0392B' : '#1A5C3A'));
  }

  var html = '<div style="background:#fff;border:1px solid var(--g100);border-radius:13px;padding:20px 24px;margin-bottom:18px">'
    + '<div style="font-size:10px;font-weight:600;color:var(--g400);text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px">💸 Cost real de la teva cartera</div>'
    + '<div style="display:flex;gap:22px;flex-wrap:wrap;margin-bottom:16px">'
      + box('TER ponderat', t.ter_real.toFixed(2) + '%', eur(t.cost_anual_eur) + '/any', 'var(--black)')
      + vsTarget
      + box('Banca tradicional', t.ter_banc.toFixed(2) + '%', eur(t.cost_banc_eur) + '/any', 'var(--g500)')
      + box('Estalvi anual', eur(t.estalvi_anual_eur), 'contra el cost del banc', '#1A5C3A')
    + '</div>'
    + '<div style="padding:12px 15px;background:var(--g50);border-radius:9px;font-size:11px;color:var(--g600);line-height:1.6">'
      + 'Amb un rendiment brut il·lustratiu del ' + MOTOR_V3.retorn_brut_ref.toFixed(1) + '% anual, la diferència de cost sobre el saldo actual suposaria '
      + '<strong style="font-family:var(--fm);color:#1A5C3A">' + eur(t.estalvi_10a_eur) + '</strong> més al cap de 10 anys. '
      + 'Càlcul il·lustratiu, no una previsió de rendibilitat.'
    + '</div>';

  if (t.cobertura_pct < 99) {
    html += '<div style="margin-top:10px;font-size:10px;color:var(--g400)">'
      + 'ⓘ El ' + (100 - t.cobertura_pct).toFixed(0) + '% de la cartera usa el TER mitjà de la seva categoria perquè no té el TER real informat. '
      + 'Informa’l a cada posició per afinar el càlcul.'
    + '</div>';
  }
  html += '</div>';
  return html;
}
