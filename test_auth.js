/* Prova el camí d'autenticació amb un Supabase simulat. */
var fs=require('fs'), path=require('path');
var { JSDOM } = require('jsdom');
var DIR='/sessions/funny-amazing-bardeen/mnt/outputs';

var dom=new JSDOM(`<!doctype html><body>
 <div id="auth-login"></div><div id="auth-magic"></div>
 <div id="auth-register"></div><div id="auth-forgot"></div>
 <input id="login-email"><input id="login-password"><div id="login-msg"></div>
 <button id="btn-login"></button>
 <input id="magic-email"><div id="magic-msg"></div><button id="btn-magic"></button>
 <input id="reg-nom"><input id="reg-email"><input id="reg-password"><input id="reg-password2">
 <div id="reg-msg"></div><button id="btn-register"></button>
 <input id="forgot-email"><div id="forgot-msg"></div><button id="btn-forgot"></button>
 <div id="tab-login"></div><div id="tab-register"></div>
</body>`,{runScripts:'outside-only',pretendToBeVisual:true});
global.window=dom.window; global.document=dom.window.document;

var plat=fs.readFileSync(path.join(DIR,'platform.html'),'utf8');
function extreu(nom, fins){
  var a=plat.indexOf('async function '+nom); if(a<0)a=plat.indexOf('function '+nom);
  var b=plat.indexOf(fins,a+20); return plat.slice(a,b); }

// Supabase simulat
var CRIDES=[];
var SB_MODE='ja_existeix';
global.sb={auth:{
  signUp:function(o){ CRIDES.push(['signUp',o.email]);
    return Promise.resolve(SB_MODE==='ja_existeix'
      ? {data:{user:{id:'x',identities:[]}},error:null}          // compte ja existent
      : {data:{user:{id:'x',identities:[{provider:'email'}]}},error:null}); },
  signInWithPassword:function(o){ CRIDES.push(['login',o.email]);
    return Promise.resolve({data:null,error:{message:'Invalid login credentials'}}); },
  signInWithOtp:function(o){ CRIDES.push(['otp',o.email,o.options&&o.options.shouldCreateUser]);
    return Promise.resolve({data:{},error:null}); },
  resetPasswordForEmail:function(e){ CRIDES.push(['reset',e]); return Promise.resolve({data:{},error:null}); }
}};
global.sb.from=function(){
  return {
    upsert:function(){ return { select:function(){ return Promise.resolve({data:[{id:1,status:'pending'}],error:null}); } }; },
    insert:function(){ return Promise.resolve({error:null}); }
  };
};
global.ADMIN_EMAILS=['guillem@theboringinvestor.com'];
global.APP={role:'admin',user:{email:'guillem@theboringinvestor.com'}};
var TOASTS=[]; global.toast=function(m){TOASTS.push(m);};
global.enterApp=function(){ CRIDES.push(['enterApp']); };
global.confirm=function(){ return CONFIRM_RESP; }; var CONFIRM_RESP=true;
global.prompt=function(){ return null; };

eval(extreu('showAuthTab','\nfunction ') + '\n;global.showAuthTab=showAuthTab;');
eval(extreu('doRegister','// ── FORGOT PASSWORD') + '\n;global.doRegister=doRegister;');
eval(extreu('doLogin','// ── MAGIC LINK') + '\n;global.doLogin=doLogin;');
eval(extreu('reenviarAccesClient','// NETEJA DE FILES') + '\n;global.reenviarAccesClient=reenviarAccesClient;');

var passes=0,fails=0;
function ok(n,c,i){ if(c){passes++;console.log('  ✓ '+n+(i?'  '+i:''));} else {fails++;console.log('  ✗ '+n+(i?'  '+i:''));} }
function $(id){ return document.getElementById(id); }

(async function(){
console.log('\n── Registre amb un email que ja té compte ──');
$('reg-nom').value='Mireia'; $('reg-email').value='MVilafranca13@Gmail.com';
$('reg-password').value='provaprova'; $('reg-password2').value='provaprova';
await doRegister();
var h=$('reg-msg').innerHTML;
ok('NO diu que s\'ha creat el compte', h.indexOf('Compte creat')<0);
ok('avisa que l\'email ja té compte', h.indexOf('ja té un compte')>=0);
ok('ofereix accedir i recuperar', h.indexOf('Accedeix')>=0 && h.indexOf('recupera la contrasenya')>=0);
ok('no crida enterApp (abans entrava sol)', !CRIDES.some(function(c){return c[0]==='enterApp';}));
ok('l\'email s\'ha normalitzat a minúscules', CRIDES[0][1]==='mvilafranca13@gmail.com', '('+CRIDES[0][1]+')');
// Els enllaços han de funcionar de debò
var a=$('reg-msg').querySelectorAll('a');
ok('genera 2 enllaços clicables', a.length===2, '('+a.length+')');
// jsdom no executa onclick inline: validem l'atribut, que és on es trenquen
// les cometes si l'escapat està malament. Si el parser l'ha llegit sencer,
// el navegador també l'executarà.
var oc0=a[0].getAttribute('onclick'), oc1=a[1].getAttribute('onclick');
ok('el 1r enllaç va a la pestanya de login', oc0.indexOf("showAuthTab('login')")===0, '('+oc0.slice(0,26)+'…)');
ok('el 2n va a recuperar contrasenya', oc1.indexOf("showAuthTab('forgot')")===0);
ok('l\'email queda ben incrustat i escapat',
   oc0.indexOf(".value='mvilafranca13@gmail.com'")>0 && oc1.indexOf(".value='mvilafranca13@gmail.com'")>0);
ok('els atributs acaben sencers (cometes correctes)',
   oc0.indexOf('return false')>0 && oc1.indexOf('return false')>0);

console.log('\n── Registre normal (compte nou) ──');
SB_MODE='nou'; CRIDES=[];
$('reg-msg').innerHTML=''; $('reg-msg').textContent='';
await doRegister();
ok('deixa passar el registre legítim', $('reg-msg').textContent.indexOf('Compte creat')>=0);

console.log('\n── Login amb credencials incorrectes ──');
CRIDES=[];
$('login-email').value='  MVilafranca13@Gmail.com  '; $('login-password').value='malament';
await doLogin();
ok('envia l\'email en minúscules i sense espais', CRIDES[0][1]==='mvilafranca13@gmail.com', '("'+CRIDES[0][1]+'")');
var lh=$('login-msg').innerHTML;
ok('diu que són incorrectes', lh.indexOf('incorrectes')>=0);
ok('ofereix restablir la contrasenya', lh.indexOf('Restablir')>=0);
ok('i entrar sense contrasenya', lh.indexOf('sense contrasenya')>=0);
var la=$('login-msg').querySelectorAll('a');
ok('dos enllaços clicables', la.length===2);
var lo0=la[0].getAttribute('onclick'), lo1=la[1].getAttribute('onclick');
ok('el 1r porta a recuperar contrasenya', lo0.indexOf("showAuthTab('forgot')")===0);
ok('el 2n porta a l\'enllaç màgic', lo1.indexOf("showAuthTab('magic')")===0);
ok('amb l\'email ja omplert i ben escapat',
   lo0.indexOf(".value='mvilafranca13@gmail.com'")>0 && lo1.indexOf(".value='mvilafranca13@gmail.com'")>0);

console.log('\n── Admin: enviar accés a un client ──');
CRIDES=[]; CONFIRM_RESP=true;
await reenviarAccesClient('MVilafranca13@Gmail.com');
ok('envia enllaç màgic quan s\'accepta', CRIDES[0][0]==='otp', '('+CRIDES[0][0]+')');
ok('en minúscules', CRIDES[0][1]==='mvilafranca13@gmail.com');
ok('sense crear comptes fantasma', CRIDES[0][2]===false);
ok('avisa amb un toast', TOASTS.some(function(t){return t.indexOf('enviat')>=0;}));
CRIDES=[]; CONFIRM_RESP=false;
await reenviarAccesClient('mvilafranca13@gmail.com');
ok('envia reset quan es cancel·la', CRIDES[0][0]==='reset', '('+CRIDES[0][0]+')');
CRIDES=[];
await reenviarAccesClient('sense-arrova');
ok('email invàlid: no envia res', CRIDES.length===0);

console.log('\n════════════════════════════════════════');
console.log(passes+' passats · '+fails+' fallits');
if(fails) process.exit(1);
})();
