// sw-push.js — Service Worker EXCLUSIU per a notificacions push.
// ───────────────────────────────────────────────────────────────
// Per què un segon service worker?
//   sw.js (el de la PWA tbi-app.html) té un handler de `fetch` amb cache
//   network-first. No volem que aquest handler s'apliqui a platform.html,
//   i tampoc volem que un registre trepitgi l'altre: si registréssim el
//   mateix scope '/' amb un script diferent, substituiríem el SW de la PWA.
//   Per això aquest fitxer es registra amb un scope propi i estret
//   ('sw-push-scope/'), que no controla cap pàgina real — no li cal:
//   un push arriba al registre que va crear la subscripció, no a la pàgina.
//
// Aquest SW NO intercepta cap petició. Només rep push i gestiona el clic.
// ───────────────────────────────────────────────────────────────

self.addEventListener('install', function(){
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(self.clients.claim());
});

// Rep la notificació del servidor (Edge Function enviar-push) i la mostra.
self.addEventListener('push', function(e){
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch(err){ data = { body: (e.data && e.data.text()) || '' }; }
  var titol = data.title || 'The Boring Investor';
  var opcions = {
    body: data.body || '',
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
    tag: data.tag || 'tbi',
    data: { url: data.url || '/platform.html' },
    vibrate: [80, 40, 80]
  };
  e.waitUntil(self.registration.showNotification(titol, opcions));
});

// En tocar la notificació: enfoca una pestanya de TBI si n'hi ha, si no n'obre una.
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/platform.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(wins){
      for (var i = 0; i < wins.length; i++){
        if (wins[i].url.indexOf('theboringinvestor') !== -1 && 'focus' in wins[i]){
          try { wins[i].navigate(url); } catch(err){}
          return wins[i].focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
