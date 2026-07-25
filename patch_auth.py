#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Arranjaments del cami d'autenticacio de platform.html.

Context: un client va rebre dues vegades "Compte creat! Revisa el teu email"
quan el compte ja existia i no s'enviava cap correu. Supabase retorna 200
sense error en aquest cas (per no revelar qui te compte); nomes es detecta
mirant data.user.identities.length === 0.
"""

import io, os, sys

BLK = '/sessions/funny-amazing-bardeen/mnt/outputs'
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BLK, 'platform.html')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(BLK, 'platform.html')

with io.open(SRC, encoding='utf-8') as f:
    s = f.read()
orig = len(s)
n = 0

def rep(old, new, label):
    global s, n
    c = s.count(old)
    assert c == 1, 'ANCORA "%s": %d coincidencies (esperava 1)' % (label, c)
    s = s.replace(old, new, 1)
    n += 1
    print('  [ok] %s' % label)

assert 'identities' not in s, 'ja sembla aplicat'

# ══ 1) REGISTRE: detectar que l'email ja te compte ════════════════════════
rep("""    var res = await sb.auth.signUp({
      email: email,
      password: pass,
      options: {
        emailRedirectTo: 'https://theboringinvestor.es/platform.html'
      }
    });
    if (res.error) throw res.error;
""",
    """    var res = await sb.auth.signUp({
      email: email,
      password: pass,
      options: {
        emailRedirectTo: 'https://theboringinvestor.es/platform.html'
      }
    });
    if (res.error) throw res.error;

    // ── Email que JA té compte ────────────────────────────────────────────
    // Supabase respon 200 sense error encara que l'usuari ja existeixi: ho fa
    // expressament per no revelar qui està registrat. L'única manera de
    // detectar-ho és que la llista d'identitats torni buida. Sense aquesta
    // comprovació dèiem "Compte creat, revisa el teu email" i no s'enviava
    // cap correu — el client es quedava esperant-lo indefinidament.
    var jaExisteix = res.data && res.data.user
      && Array.isArray(res.data.user.identities)
      && res.data.user.identities.length === 0;
    if (jaExisteix) {
      msg.className = 'login-msg err';
      msg.innerHTML = 'Aquest email ja té un compte. '
        + '<a href="#" onclick="showAuthTab(\\'login\\');document.getElementById(\\'login-email\\').value=\\''
        + email.replace(/'/g, "\\\\'") + '\\';return false" style="color:var(--accent);font-weight:600">Accedeix</a>'
        + ' o <a href="#" onclick="showAuthTab(\\'forgot\\');document.getElementById(\\'forgot-email\\').value=\\''
        + email.replace(/'/g, "\\\\'") + '\\';return false" style="color:var(--accent);font-weight:600">recupera la contrasenya</a>.';
      btn.disabled = false; btn.textContent = 'Crear compte →';
      return;
    }
""",
    'registre: detectar compte existent')

# ══ 2) LOGIN: minuscules + enllac de recuperacio despres del primer error ══
rep("""async function doLogin() {
  var email = document.getElementById('login-email').value.trim();""",
    """async function doLogin() {
  // Minuscules sempre: Supabase desa els emails normalitzats i una majuscula
  // despistada no ha de costar un "credencials invalides".
  var email = document.getElementById('login-email').value.trim().toLowerCase();""",
    'login: email a minuscules')

rep("""      if (errMsg.toLowerCase().indexOf('invalid login') >= 0 || errMsg.toLowerCase().indexOf('invalid_credentials') >= 0) {
        errMsg = 'Email o contrasenya incorrectes.';
      } else if (errMsg.toLowerCase().indexOf('email not confirmed') >= 0) {
        errMsg = 'Has de confirmar el teu email primer. Mira el correu que t\\'hem enviat.';
      }
      msg.textContent = errMsg;""",
    """      var esCredencials = errMsg.toLowerCase().indexOf('invalid login') >= 0
                       || errMsg.toLowerCase().indexOf('invalid_credentials') >= 0;
      if (esCredencials) {
        errMsg = 'Email o contrasenya incorrectes.';
      } else if (errMsg.toLowerCase().indexOf('email not confirmed') >= 0) {
        errMsg = 'Has de confirmar el teu email primer. Mira el correu que t\\'hem enviat.';
      }
      // Oferir la sortida al mateix moment de l'error. El navegador sol
      // autocompletar contrasenyes antigues i la gent reintenta a cegues.
      if (esCredencials) {
        msg.innerHTML = errMsg
          + '<br><a href="#" onclick="showAuthTab(\\'forgot\\');document.getElementById(\\'forgot-email\\').value=\\''
          + email.replace(/'/g, "\\\\'") + '\\';return false" style="color:var(--accent);font-weight:600">Restablir la contrasenya</a>'
          + ' · <a href="#" onclick="showAuthTab(\\'magic\\');document.getElementById(\\'magic-email\\').value=\\''
          + email.replace(/'/g, "\\\\'") + '\\';return false" style="color:var(--accent);font-weight:600">entrar sense contrasenya</a>';
      } else {
        msg.textContent = errMsg;
      }""",
    'login: sortida despres del primer error')

# ══ 3) ADMIN: reenviar acces amb opcio d'enllac magic ═════════════════════
rep("""async function reenviarAccesClient(emailPreomplert) {
  if (!sb || APP.role !== 'admin') return;

  var email = prompt(
    'Email del client al qual vols reenviar l\\u2019acc\\u00e9s:\\n\\n' +
    'S\\u2019enviar\\u00e0 un email de Supabase amb un enlla\\u00e7 per establir nova contrasenya.',
    emailPreomplert || ''
  );
  if (!email) return;
  email = email.toLowerCase().trim();
  if (!email.includes('@')) { toast('\\u26a0 Email no v\\u00e0lid'); return; }

  if (!confirm(
    'Enviar email de restabliment de contrasenya a:\\n\\n' + email + '\\n\\n' +
    'El client rebrà un enlla\\u00e7 v\\u00e0lid durant 1 hora per establir una nova contrasenya.'
  )) return;

  try {
    var res = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://theboringinvestor.es/platform.html?reset=true'
    });
    if (res.error) throw res.error;

    toast('\\u2713 Email de reset enviat a ' + email);""",
    """async function reenviarAccesClient(emailPreomplert) {
  if (!sb || APP.role !== 'admin') return;

  var email = emailPreomplert;
  if (!email) {
    email = prompt('Email del client al qual vols reenviar l\\u2019acc\\u00e9s:', '');
    if (!email) return;
  }
  email = email.toLowerCase().trim();
  if (!email.includes('@')) { toast('\\u26a0 Email no v\\u00e0lid'); return; }

  // Dues vies. L'enllaç màgic el fa entrar directament sense inventar-se cap
  // contrasenya, que és on es queda encallada la majoria de gent.
  var magic = confirm(
    'Com vols desbloquejar ' + email + '?\\n\\n' +
    'ACCEPTAR \\u2192 Enlla\\u00e7 d\\u2019acc\\u00e9s directe (entra sense contrasenya)\\n' +
    'CANCEL\\u00b7LAR \\u2192 Enlla\\u00e7 per establir una contrasenya nova'
  );

  try {
    var res;
    if (magic) {
      // shouldCreateUser:false evita crear comptes fantasma per una errada
      // d'escriptura a l'email.
      res = await sb.auth.signInWithOtp({
        email: email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: 'https://theboringinvestor.es/platform.html'
        }
      });
    } else {
      res = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://theboringinvestor.es/platform.html?reset=true'
      });
    }
    if (res.error) throw res.error;

    toast('\\u2713 ' + (magic ? 'Enlla\\u00e7 d\\u2019acc\\u00e9s' : 'Email de reset') + ' enviat a ' + email);""",
    'admin: reenviar acces amb enllac magic')

# ══ 4) Boto a cada fila de la llista de clients ═══════════════════════════
ANCORA_4 = "event.stopPropagation();desbloquarRetest(\\'"
BOTO = ("event.stopPropagation();reenviarAccesClient(\\'' + c.email + '\\')\" "
        "style=\"padding:4px 8px;background:transparent;border:1px solid var(--g200);"
        "border-radius:6px;font-size:11px;cursor:pointer;color:#1B3A6B\" "
        "title=\"Enviar enlla\\u00e7 d\\u2019acc\\u00e9s\">&#128273;</button>'\n"
        "          + '<button onclick=\"" + ANCORA_4)
rep(ANCORA_4, BOTO, 'boto de clau a la llista de clients')

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write(s)

print('\\n%d canvis. %d -> %d bytes (%+d)' % (n, orig, len(s), len(s) - orig))
