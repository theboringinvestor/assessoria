function comunicatHTML(raw){
  var s = String(raw || '').split('{{unsubscribe_url}}').join('#');
  var extra = '<base target="_blank">'
    + '<style>html,body{margin:0;padding:0;background:#F7F5F0}'
    + 'body{-webkit-text-size-adjust:100%}'
    + 'img,table,td{max-width:100%!important;height:auto}'
    + 'table{width:100%!important}</style>';
  // injectar just després de <head>, o al principi si el document no en té
  if (/<head[^>]*>/i.test(s)) return s.replace(/<head[^>]*>/i, function(m){ return m + extra; });
  return extra + s;
}

// email real tal com el genera la plantilla de la plataforma
const email = '<!DOCTYPE html>\n<html lang="ca"><head><meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head><body><table width="600"><tr><td>Hola<a href="{{unsubscribe_url}}">Baixa</a></td></tr></table></body></html>';
const out = comunicatHTML(email);
const chk=(c,m)=>console.log((c?'  OK    ':'  FALLA ')+m);
chk(!out.includes('{{unsubscribe_url}}'), 'marcador de baixa resolt');
chk(out.includes('<base target="_blank">'), 'base target injectat');
chk(out.indexOf('<base') > out.indexOf('<head'), 'injectat DINS del head');
chk(out.indexOf('<base') < out.indexOf('</head>'), 'abans de tancar el head');
chk(out.startsWith('<!DOCTYPE html>'), 'doctype intacte');
chk(out.includes('table{width:100%!important}'), 'taules de 600px reajustades');
// document sense <head>
const solCos = '<div>Comunicat curt</div>';
const out2 = comunicatHTML(solCos);
chk(out2.includes('<base target="_blank">') && out2.includes('Comunicat curt'), 'document sense head: estils al davant');
chk(comunicatHTML(null) !== '' && comunicatHTML(null).includes('<base'), 'entrada nul·la no peta');

