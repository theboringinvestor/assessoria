// sw.js — Service Worker MÍNIM per a The Boring Investor PWA
// ───────────────────────────────────────────────────────────
// Objectiu: fer la PWA instal·lable (Android mostra "Instal·lar app")
// SENSE caure en el problema clàssic de versions antigues enganxades.
//
// Estratègia: NETWORK-FIRST. Sempre s'intenta la xarxa primer; només
// si no hi ha connexió es recorre a la closca cachejada. Així, amb
// connexió, els clients SEMPRE veuen l'última versió desplegada.
//
// IMPORTANT: puja el número de versió (CACHE_VERSION) cada cop que
// despleguis un canvi gros, perquè la closca antiga s'esborri.
// ───────────────────────────────────────────────────────────

var CACHE_VERSION = 'tbi-v1';
var SHELL = ['tbi-app.html', 'manifest.webmanifest'];

// Instal·lació: cachejar la closca mínima
self.addEventListener('install', function(e){
  self.skipWaiting(); // activa el nou SW de seguida
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache){
      return cache.addAll(SHELL).catch(function(){ /* si falla, no bloqueja */ });
    })
  );
});

// Activació: esborrar caches de versions antigues
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        if (k !== CACHE_VERSION) return caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// Fetch: network-first per a la navegació; la resta passa directe.
self.addEventListener('fetch', function(e){
  var req = e.request;

  // No interferir mai amb crides a Supabase ni a APIs (només GET de la pròpia web)
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // deixa passar Supabase, fonts, etc.

  // Network-first: intenta xarxa, si falla -> cache
  e.respondWith(
    fetch(req).then(function(res){
      // Actualitza la còpia a cache (només respostes bones)
      if (res && res.status === 200){
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function(c){ c.put(req, copy); });
      }
      return res;
    }).catch(function(){
      return caches.match(req).then(function(hit){
        return hit || caches.match('tbi-app.html');
      });
    })
  );
});

// ═══════════════════════════════════════════════════════════════════
// NOTIFICACIONS PUSH
// ═══════════════════════════════════════════════════════════════════
// Rep una notificació push del servidor i la mostra.
self.addEventListener('push', function(e){
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch(err){ data = { body: (e.data && e.data.text()) || '' }; }
  var titol = data.title || 'The Boring Investor';
  var opcions = {
    body: data.body || '',
    icon: 'manifest-icon-192.png',
    badge: 'manifest-icon-192.png',
    tag: data.tag || 'tbi',
    data: { url: data.url || 'tbi-app.html' },
    vibrate: [80, 40, 80]
  };
  e.waitUntil(self.registration.showNotification(titol, opcions));
});

// En tocar la notificació, obre/enfoca l'app a la URL indicada.
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || 'tbi-app.html';
  e.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true }).then(function(wins){
      for (var i=0;i<wins.length;i++){
        if (wins[i].url.indexOf('tbi-app') !== -1 && 'focus' in wins[i]) return wins[i].focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
