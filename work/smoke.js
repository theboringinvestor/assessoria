const T=require('./tbi-icones.js');
const noms=['alert', 'anchor', 'bank', 'banknote', 'barrel', 'bell', 'bolt', 'books', 'box', 'brain', 'briefcase', 'building', 'bulb', 'calculator', 'calendar', 'camera', 'car', 'card', 'cart', 'chart-bar', 'check', 'clapper', 'clipboard', 'clock', 'coins', 'compass', 'crypto', 'cup', 'diamond', 'dice', 'dot', 'download', 'droplet', 'exchange', 'eye', 'factory', 'file', 'flag', 'flame', 'folders', 'globe', 'graduation', 'handshake', 'help', 'home', 'info', 'key', 'link', 'lock', 'magnet', 'mail', 'map', 'medal', 'megaphone', 'message', 'microscope', 'mobile', 'news', 'paperclip', 'pencil', 'phone', 'pin', 'plane', 'plus-circle', 'printer', 'receipt', 'refresh', 'robot', 'rocket', 'save', 'scale', 'scissors', 'search', 'seedling', 'settings', 'shield', 'shuffle', 'sliders', 'sparkle', 'square', 'star', 'sunrise', 'tag', 'target', 'theater', 'tools', 'trash', 'trend-down', 'trend-up', 'trophy', 'upload', 'user', 'users', 'video'];

let ko=noms.filter(n=>!T.has(n));
console.log('icones referenciades pel codi: '+noms.length);
console.log('definides al modul           : '+T.noms().length);
console.log(ko.length? '  FALTEN: '+ko.join(', ') : '  OK   totes resolen');
const m=T.svg('briefcase');
console.log('  OK   format correcte: '+(m.startsWith('<svg class="ei" viewBox="0 0 24 24">')&&m.endsWith('</svg>')));
console.log('  OK   classe extra   : '+(T.svg('bell','gran').indexOf('class=\"ei gran\"')>0));
console.log('  OK   nom inexistent no peta: '+JSON.stringify(T.svg('no-existeix')));
process.exit(ko.length?1:0);

