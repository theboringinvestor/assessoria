# -*- coding: utf-8 -*-
"""
Joc d'icones monocromàtiques TBI — traç de 24x24, currentColor.
Cada icona hereta la mida del contenidor (1.15em) i el color del text,
així els call-sites existents (font-size:20px, 44px...) segueixen funcionant.
"""

# nom -> contingut intern de l'SVG (sense l'element <svg>)
PATHS = {
 # ── Navegació i estructura ─────────────────────────────────────────
 'home':      '<path d="M4 10.5 12 4l8 6.5"/><path d="M6 9.6V20h12V9.6"/><path d="M10 20v-5h4v5"/>',
 'briefcase': '<rect x="3" y="7.5" width="18" height="12.5" rx="2.2"/><path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5"/><path d="M3 12.5h18"/>',
 'folders':   '<path d="M3 8.2a2 2 0 0 1 2-2h3.3l1.7 2H15a2 2 0 0 1 2 2v6.6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M7 6.2V5a2 2 0 0 1 2-2h3.3l1.7 2H19a2 2 0 0 1 2 2v6.6"/>',
 'file':      '<path d="M6 3.5h7.5L19 9v11.5H6Z"/><path d="M13.5 3.5V9H19"/>',
 'clipboard': '<rect x="5.5" y="4.5" width="13" height="15.5" rx="2"/><rect x="9" y="2.5" width="6" height="3.6" rx="1.2"/><path d="M9 11h6M9 15h4"/>',
 'grid':      '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
 'menu':      '<path d="M4 7h16M4 12h16M4 17h16"/>',
 'map':       '<path d="M9 4.5 3.5 6.8v13L9 17.4l6 2.4 5.5-2.3v-13L15 6.8Z"/><path d="M9 4.5v12.9M15 6.8v13"/>',
 'compass':   '<circle cx="12" cy="12" r="8.5"/><path d="m15 9-1.9 4.6L8.5 15.5l1.9-4.6Z"/>',
 'flag':      '<path d="M5.5 21V3.8"/><path d="M5.5 4.6h11l-2 3.6 2 3.6h-11"/>',
 'box':       '<path d="m12 3.2 8 4.2v9.2l-8 4.2-8-4.2V7.4Z"/><path d="m4 7.4 8 4.2 8-4.2M12 11.6V20.8"/>',

 # ── Dades i finances ───────────────────────────────────────────────
 'chart-bar': '<path d="M3.5 20.5h17"/><rect x="5.5" y="12" width="3.4" height="6"  rx=".9"/><rect x="10.3" y="7.5" width="3.4" height="10.5" rx=".9"/><rect x="15.1" y="10" width="3.4" height="8" rx=".9"/>',
 'chart-pie': '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v8.5h8.5"/>',
 'trend-up':  '<path d="M3.5 19.5h17"/><path d="m6 15.5 4.2-4.6 3.2 2.6 4.8-6"/><path d="M14.6 7.5h3.6v3.4"/>',
 'trend-down':'<path d="M3.5 19.5h17"/><path d="m6 7.5 4.2 4.6 3.2-2.6 4.8 6"/><path d="M14.6 15.5h3.6v-3.4"/>',
 'calculator':'<rect x="5" y="3" width="14" height="18" rx="2.2"/><rect x="8" y="6.2" width="8" height="3.2" rx="1"/><path d="M8.6 13h.01M12 13h.01M15.4 13h.01M8.6 16.8h.01M12 16.8h.01M15.4 16.8h.01"/>',
 'banknote':  '<rect x="2.5" y="6" width="19" height="12" rx="2.2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 10v4M18 10v4"/>',
 'coins':     '<ellipse cx="9" cy="7" rx="5.5" ry="2.6"/><path d="M3.5 7v4.4c0 1.44 2.46 2.6 5.5 2.6s5.5-1.16 5.5-2.6V7"/><path d="M14.5 11.6c2.75.2 4.8 1.28 4.8 2.58v3.2c0 1.44-2.46 2.6-5.5 2.6-2.5 0-4.6-.79-5.28-1.87"/>',
 'card':      '<rect x="2.5" y="5.5" width="19" height="13" rx="2.4"/><path d="M2.5 10h19"/><path d="M6 14.6h3.5"/>',
 'bank':      '<path d="M3.5 9.5 12 4l8.5 5.5"/><path d="M5.5 9.5v8M10 9.5v8M14 9.5v8M18.5 9.5v8"/><path d="M3.2 20.5h17.6"/>',
 'receipt':   '<path d="M6 3.2h12v17.6l-2.4-1.5-2.4 1.5-2.4-1.5-2.4 1.5L6 20.8Z"/><path d="M9.2 8h5.6M9.2 12h5.6"/>',
 'exchange':  '<path d="M4 8.4h13"/><path d="m13.6 5 3.4 3.4-3.4 3.4"/><path d="M20 15.6H7"/><path d="m10.4 12.2-3.4 3.4 3.4 3.4"/>',
 'target':    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1"/>',
 'scale':     '<path d="M12 4v16"/><path d="M7 20h10"/><path d="M4 8h16"/><path d="M4 8 1.8 13.2h4.4Z"/><path d="M20 8l-2.2 5.2h4.4Z"/>',
 'sliders':   '<path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2.2"/><circle cx="9" cy="16" r="2.2"/>',
 'dice':      '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.6 8.6h.01M15.4 8.6h.01M12 12h.01M8.6 15.4h.01M15.4 15.4h.01"/>',

 # ── Temps ──────────────────────────────────────────────────────────
 'calendar':  '<rect x="3.5" y="5.2" width="17" height="15.3" rx="2.2"/><path d="M3.5 10h17"/><path d="M8 3.2v4M16 3.2v4"/>',
 'clock':     '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 1.9"/>',
 'hourglass': '<path d="M7 3.5h10M7 20.5h10"/><path d="M7.5 3.5v3.2c0 2.3 4.5 3.6 4.5 5.3s-4.5 3-4.5 5.3v3.2"/><path d="M16.5 3.5v3.2c0 2.3-4.5 3.6-4.5 5.3s4.5 3 4.5 5.3v3.2"/>',

 # ── Persones i comunicació ─────────────────────────────────────────
 'user':      '<circle cx="12" cy="8" r="3.8"/><path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0"/>',
 'users':     '<circle cx="9.2" cy="8.2" r="3.4"/><path d="M2.8 19.8a6.4 6.4 0 0 1 12.8 0"/><path d="M16 5.2a3.4 3.4 0 0 1 0 6.6"/><path d="M17.4 14.4a6.4 6.4 0 0 1 3.8 5.4"/>',
 'message':   '<path d="M20.5 11.6c0 4-3.8 7.2-8.5 7.2-1 0-2-.15-2.9-.42L4 20l1.3-3.4C4.1 15.3 3.5 13.5 3.5 11.6c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2Z"/>',
 'mail':      '<rect x="2.8" y="5" width="18.4" height="14" rx="2.4"/><path d="m3.4 7 8.6 6 8.6-6"/>',
 'megaphone': '<path d="M4 10.4v3.2a1.8 1.8 0 0 0 1.8 1.8H8l7 4.2V4.4L8 8.6H5.8A1.8 1.8 0 0 0 4 10.4Z"/><path d="M18.2 9.4a4 4 0 0 1 0 5.2"/><path d="M8 15.4V20"/>',
 'bell':      '<path d="M18 15.6V11a6 6 0 1 0-12 0v4.6L4.4 18h15.2Z"/><path d="M9.8 18a2.4 2.4 0 0 0 4.4 0"/>',
 'phone':     '<path d="M6.4 3.6h3l1.6 4-2 1.4a11 11 0 0 0 6 6l1.4-2 4 1.6v3a1.8 1.8 0 0 1-2 1.8C11.4 19 5 12.6 4.6 5.6a1.8 1.8 0 0 1 1.8-2Z"/>',
 'handshake':  '<path d="M11 7.4 8.6 9.8a1.9 1.9 0 0 0 2.7 2.7l1.5-1.5 4 4a1.7 1.7 0 0 1-2.4 2.4"/><path d="m14.4 17.4-1.2 1.2a1.7 1.7 0 0 1-2.4 0l-3.4-3.4"/><path d="M2.6 8.4 6 5h4l2 1.6L14 5h4l3.4 3.4"/><path d="M18 8.4v6.2M6 8.4v6.2"/>',
 'news':      '<path d="M4 5.5h13v14H5.6A1.6 1.6 0 0 1 4 17.9Z"/><path d="M17 8.5h2.4A1.6 1.6 0 0 1 21 10.1v7.8a1.6 1.6 0 0 1-1.6 1.6H17"/><path d="M7 9h7M7 12.6h7M7 16.2h4"/>',

 # ── Accions ────────────────────────────────────────────────────────
 'pencil':    '<path d="M4 20h4l11-11a2.6 2.6 0 0 0-3.7-3.7L4.4 16.3Z"/><path d="m14.6 6.4 3.5 3.5"/>',
 'trash':     '<path d="M4.5 6.6h15"/><path d="M9.4 6.6V4.8a1.4 1.4 0 0 1 1.4-1.4h2.4a1.4 1.4 0 0 1 1.4 1.4v1.8"/><path d="M6.6 6.6 7.5 20a1.6 1.6 0 0 0 1.6 1.5h5.8a1.6 1.6 0 0 0 1.6-1.5l.9-13.4"/>',
 'search':    '<circle cx="10.8" cy="10.8" r="6.6"/><path d="m15.6 15.6 4.6 4.6"/>',
 'refresh':   '<path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 12.5a8 8 0 0 0 13.7 5.2L20 15.5"/><path d="M20 20v-4.5h-4.5"/>',
 'shuffle':   '<path d="M3.5 6.5h3.2c3.4 0 5.2 11 8.6 11h5.2"/><path d="M3.5 17.5h3.2c1.7 0 2.9-2.7 4-5.5"/><path d="m17.6 3.8 3 2.7-3 2.7"/><path d="m17.6 14.8 3 2.7-3 2.7"/>',
 'download':  '<path d="M12 3.8v11"/><path d="m7.6 10.6 4.4 4.4 4.4-4.4"/><path d="M4.5 19.5h15"/>',
 'upload':    '<path d="M12 15.2V4.2"/><path d="m7.6 8.4 4.4-4.4 4.4 4.4"/><path d="M4.5 19.5h15"/>',
 'save':      '<path d="M5.5 4.5h10.6L19.5 8v11.5h-14Z"/><path d="M8.5 4.5v5h6v-5"/><path d="M8 19.5v-5.6h8v5.6"/>',
 'paperclip': '<path d="M19 11.2 12 18.2a4.6 4.6 0 0 1-6.5-6.5l7.6-7.6a3.1 3.1 0 0 1 4.4 4.4l-7.6 7.6a1.6 1.6 0 0 1-2.2-2.2l6.9-6.9"/>',
 'scissors':  '<circle cx="6.4" cy="6.4" r="2.6"/><circle cx="6.4" cy="17.6" r="2.6"/><path d="M8.6 8.2 19.5 18.4M8.6 15.8 19.5 5.6"/>',
 'cart':      '<circle cx="9.6" cy="19.4" r="1.5"/><circle cx="17.4" cy="19.4" r="1.5"/><path d="M2.8 4.5h2.6l2.6 11h10.4l2-7.4H6.4"/>',
 'magnet':    '<path d="M5.5 4v8a6.5 6.5 0 0 0 13 0V4"/><path d="M5.5 9.6h5M13.5 9.6h5"/>',

 # ── Estat i senyals ────────────────────────────────────────────────
 'check':     '<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.2 2.6 2.6 5-5.4"/>',
 'alert':     '<path d="M12 3.6 21.2 19.6H2.8Z"/><path d="M12 9.6v4.4M12 17.2v.01"/>',
 'help':      '<circle cx="12" cy="12" r="8.5"/><path d="M9.2 9.3a2.9 2.9 0 1 1 3.6 2.8c-.5.2-.8.7-.8 1.2v.6"/><path d="M12 17.2v.01"/>',
 'x':         '<circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6M15 9l-6 6"/>',
 'dot':       '<circle cx="12" cy="12" r="5.4"/>',
 'square':    '<rect x="5" y="5" width="14" height="14" rx="2.4"/>',
 'eye':       '<path d="M2.4 12S5.8 5.8 12 5.8 21.6 12 21.6 12 18.2 18.2 12 18.2 2.4 12 2.4 12Z"/><circle cx="12" cy="12" r="3.1"/>',
 'lock':      '<rect x="4.8" y="10.2" width="14.4" height="10.3" rx="2.2"/><path d="M8.2 10.2V7.6a3.8 3.8 0 0 1 7.6 0v2.6"/>',
 'key':       '<circle cx="7.6" cy="14.4" r="3.8"/><path d="m10.3 11.7 8-8"/><path d="m15.6 6.4 2.2 2.2M17.8 4.2 20 6.4"/>',
 'shield':    '<path d="M12 3.4 4.8 6.2v5.5c0 4.4 3 7.6 7.2 9.1 4.2-1.5 7.2-4.7 7.2-9.1V6.2Z"/>',
 'star':      '<path d="m12 4 2.5 5.3 5.7.8-4.1 4.1 1 5.8-5.1-2.8-5.1 2.8 1-5.8L3.8 10l5.7-.8Z"/>',
 'trophy':    '<path d="M7.5 4h9v5.4a4.5 4.5 0 0 1-9 0Z"/><path d="M7.5 5.6H4.8v1.6a3 3 0 0 0 2.7 3M16.5 5.6h2.7v1.6a3 3 0 0 1-2.7 3"/><path d="M12 13.9v3.6M8.4 20.5h7.2"/>',
 'medal':     '<circle cx="12" cy="14.6" r="5.4"/><path d="m8.4 9.6-2.6-6h4l2 4.4M15.6 9.6l2.6-6h-4l-1.4 3.1"/>',
 'pin':       '<path d="M12 21.2V14"/><path d="M9 4.4h6l-.7 4.2 2.5 2.6v2.2H7.2v-2.2l2.5-2.6Z"/>',
 'bookmark':  '<path d="M6.4 3.8h11.2v17l-5.6-4-5.6 4Z"/>',
 'tag':       '<path d="M3.8 10.9V4.5h6.4l9.4 9.4-6.4 6.4Z"/><circle cx="7.6" cy="8.3" r="1.4"/>',
 'sparkle':   '<path d="m12 3.4 1.9 5.3 5.3 1.9-5.3 1.9L12 17.8l-1.9-5.3L4.8 10.6l5.3-1.9Z"/><path d="M18.6 16.4l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z"/>',
 'flame':     '<path d="M12 3.2s5.4 4.2 5.4 9.2a5.4 5.4 0 0 1-10.8 0c0-2 .9-3.5.9-3.5s.7 1.6 2 1.9c.7-3.4 2.5-5.6 2.5-7.6Z"/>',
 'bolt':      '<path d="M13.4 2.8 5.6 13.4h5.8l-.8 7.8 7.8-10.6h-5.8Z"/>',
 'bulb':      '<path d="M9.2 17.4a5.6 5.6 0 1 1 5.6 0v1.4h-5.6Z"/><path d="M10 21.2h4"/>',
 'anchor':    '<circle cx="12" cy="5.4" r="2.2"/><path d="M12 7.6v13"/><path d="M4.4 13.2a7.6 7.6 0 0 0 15.2 0"/><path d="M4.4 13.2h2.8M19.6 13.2h-2.8"/>',

 # ── Objectes i llocs ───────────────────────────────────────────────
 'globe':     '<circle cx="12" cy="12" r="8.5"/><path d="M3.6 12h16.8"/><path d="M12 3.5c2.3 2.4 3.5 5.4 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.4-3.5-8.5S9.7 5.9 12 3.5Z"/>',
 'building':  '<path d="M4.5 20.5V5.2A1.7 1.7 0 0 1 6.2 3.5h7.6a1.7 1.7 0 0 1 1.7 1.7v15.3"/><path d="M15.5 10h2.8a1.7 1.7 0 0 1 1.7 1.7v8.8"/><path d="M8 7.4h3.8M8 11.2h3.8M8 15h3.8"/><path d="M3 20.5h18"/>',
 'factory':   '<path d="M3.5 20.5V10l5.2 3.4V10l5.2 3.4V6.6l6.6 3.6v10.3Z"/><path d="M7.4 17h1.6M12.4 17h1.6M17 17h1.6"/>',
 'desktop':   '<rect x="2.8" y="4.2" width="18.4" height="12.4" rx="2.2"/><path d="M9 20.4h6M12 16.6v3.8"/>',
 'mobile':    '<rect x="6.6" y="2.6" width="10.8" height="18.8" rx="2.6"/><path d="M10.8 18.4h2.4"/>',
 'camera':    '<path d="M3.2 8.6h3.4l1.6-2.4h7.6l1.6 2.4h3.4v10.2H3.2Z"/><circle cx="12" cy="13.4" r="3.4"/>',
 'video':     '<rect x="2.8" y="6.4" width="12.6" height="11.2" rx="2.2"/><path d="m15.4 11 5.8-3.2v8.4L15.4 13Z"/>',
 'clapper':    '<rect x="3" y="9.4" width="18" height="11.2" rx="1.8"/><path d="m3.4 9.4 1-4.4 15.8 1.6-.6 2.8"/><path d="m8.8 5.4-.9 4M14 5.9l-.9 3.9"/>',
 'info':      '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.4M12 7.8v.01"/>',
 'sunrise':   '<path d="M12 3.4v3.2M5.2 6.4l2.2 2.2M18.8 6.4l-2.2 2.2"/><path d="M7.4 15.4a4.6 4.6 0 0 1 9.2 0"/><path d="M2.8 15.4h3M18.2 15.4h3M3.6 19.4h16.8"/>',
 'plane':      '<path d="M2.8 13.4 21 5.2 12.8 21.2l-2-6.6Z"/><path d="m10.8 14.6 4.4-6"/>',
 'cup':       '<path d="M4.4 6.4h12v8a4.6 4.6 0 0 1-9.2 0Z"/><path d="M16.4 8.2h1.8a2.4 2.4 0 0 1 0 4.8h-1.8"/><path d="M3.6 20.4h13.6"/>',
 'car':       '<path d="M3.4 15.6v-2.4l2-4.6a2 2 0 0 1 1.8-1.2h9.6a2 2 0 0 1 1.8 1.2l2 4.6v2.4Z"/><path d="M3.4 13.2h17.2"/><circle cx="7.4" cy="17.4" r="1.6"/><circle cx="16.6" cy="17.4" r="1.6"/>',
 'printer':   '<path d="M6.6 8.4V3.6h10.8v4.8"/><rect x="3.4" y="8.4" width="17.2" height="7.6" rx="2"/><path d="M6.6 13.4h10.8v7H6.6Z"/>',
 'link':      '<path d="M10 13.6a3.6 3.6 0 0 0 5.2 0l2.8-2.8a3.6 3.6 0 0 0-5.1-5.1l-1.4 1.4"/><path d="M14 10.4a3.6 3.6 0 0 0-5.2 0L6 13.2a3.6 3.6 0 0 0 5.1 5.1l1.4-1.4"/>',
 'graduation':'<path d="m12 4.2 9 4-9 4-9-4Z"/><path d="M6.6 10.4v5c0 1.6 2.4 2.9 5.4 2.9s5.4-1.3 5.4-2.9v-5"/><path d="M21 8.2v6"/>',
 'books':     '<path d="M4 4.6h4.6v15.2H4Z"/><path d="M9.4 4.6H14v15.2H9.4Z"/><path d="m15 5.6 3.9-.8 2.4 14.6-3.9.8Z"/>',
 'brain':     '<path d="M12 5.2a3 3 0 0 0-5.6.6 2.9 2.9 0 0 0-1.2 5 3.1 3.1 0 0 0 1.3 5.3 3 3 0 0 0 5.5 1.3Z"/><path d="M12 5.2a3 3 0 0 1 5.6.6 2.9 2.9 0 0 1 1.2 5 3.1 3.1 0 0 1-1.3 5.3 3 3 0 0 1-5.5 1.3Z"/><path d="M12 17.4v3.2"/>',
 'robot':     '<rect x="4" y="7.6" width="16" height="12" rx="2.8"/><path d="M12 3.4v4.2"/><circle cx="12" cy="3" r="1.2"/><path d="M9.2 12.4h.01M14.8 12.4h.01"/><path d="M9.6 16h4.8"/>',
 'microscope': '<path d="M7.4 19.6h12.2"/><path d="M10.6 19.6a5.8 5.8 0 0 0 6.4-8.6"/><rect x="8.4" y="3.4" width="4.6" height="8.6" rx="1.6" transform="rotate(-24 10.7 7.7)"/><path d="m6.6 11.6 4.4 2"/>',
 'tools':     '<path d="m14.6 6.6 2.8-2.8a4 4 0 0 1-5.2 5.2L4.6 16.6a2 2 0 0 0 2.8 2.8l7.6-7.6a4 4 0 0 1 5.2-5.2l-2.8 2.8Z"/>',
 'droplet':   '<path d="M12 3.4c3.2 3.7 5.4 6.5 5.4 9.2a5.4 5.4 0 0 1-10.8 0c0-2.7 2.2-5.5 5.4-9.2Z"/>',
 'seedling':  '<path d="M12 20.5v-7"/><path d="M12 13.5C12 10 9.4 7.6 5.6 7.6c0 3.5 2.6 5.9 6.4 5.9Z"/><path d="M12 13.5c0-3 2.2-5.2 5.6-5.2 0 3-2.2 5.2-5.6 5.2Z"/>',
 'barrel':    '<ellipse cx="12" cy="5.6" rx="6.4" ry="2.2"/><path d="M5.6 5.6v12.8c0 1.2 2.9 2.2 6.4 2.2s6.4-1 6.4-2.2V5.6"/><path d="M5.8 12h12.4"/>',
 'theater':    '<path d="M4.6 5.4h14.8v6.2a7.4 7.4 0 0 1-14.8 0Z"/><path d="M9.4 9.2h.01M14.6 9.2h.01"/><path d="M9.8 14.2a3.2 3.2 0 0 0 4.4 0"/>',
 'settings':  '<circle cx="12" cy="12" r="3.2"/><path d="M19.2 14.6a1.6 1.6 0 0 0 .32 1.76l.06.06a1.9 1.9 0 1 1-2.7 2.7l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.97 1.47v.17a1.9 1.9 0 0 1-3.8 0v-.09a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.76.32l-.06.06a1.9 1.9 0 1 1-2.7-2.7l.06-.06a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.47-.97H3.4a1.9 1.9 0 0 1 0-3.8h.09a1.6 1.6 0 0 0 1.47-1.05 1.6 1.6 0 0 0-.32-1.76l-.06-.06a1.9 1.9 0 1 1 2.7-2.7l.06.06a1.6 1.6 0 0 0 1.76.32h.08a1.6 1.6 0 0 0 .97-1.47V3.4a1.9 1.9 0 0 1 3.8 0v.09a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.76-.32l.06-.06a1.9 1.9 0 1 1 2.7 2.7l-.06.06a1.6 1.6 0 0 0-.32 1.76v.08a1.6 1.6 0 0 0 1.47.97h.17a1.9 1.9 0 0 1 0 3.8h-.09a1.6 1.6 0 0 0-1.47.97Z"/>',
 'diamond':   '<path d="m3.2 9.4 3-5.2h11.6l3 5.2L12 20.4Z"/><path d="M3.2 9.4h17.6M8.4 4.2 12 9.4l3.6-5.2M12 9.4v11"/>',
  'crypto':     '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 7.8v8.4"/><path d="M9.6 12h3.6a2.1 2.1 0 0 1 0 4.2H9.6"/><path d="M9.6 7.8h3.2a2.1 2.1 0 0 1 0 4.2"/><path d="M11.6 6.2v1.6M11.6 16.2v1.6"/>',
  'plus-circle': '<circle cx="12" cy="12" r="8.5"/><path d="M12 8.2v7.6M8.2 12h7.6"/>',
  'logout':     '<path d="M14.5 4.5H18a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3.5"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h9"/>',
  'arrow-right': '<path d="M5 12h13M13 6l6 6-6 6"/>',
 'rocket':    '<path d="M12 3.2c3.2 2.4 4.8 5.6 4.8 9.2l-2.4 3.6H9.6l-2.4-3.6c0-3.6 1.6-6.8 4.8-9.2Z"/><circle cx="12" cy="10" r="1.8"/><path d="M9.6 16 7.2 20l3.2-1.2M14.4 16l2.4 4-3.2-1.2"/>',
}
# Alies: molts emojis comparteixen la mateixa icona
ALIAS = {}

# ── Mapa emoji -> nom d'icona ─────────────────────────────────────────
EMOJI = {
 '👁':'eye', '⚠':'alert', '📋':'clipboard', '✅':'check', '💼':'briefcase',
 '🎯':'target', '📊':'chart-bar', '📅':'calendar', '🏠':'home', '💬':'message',
 '🗂':'folders', '📈':'trend-up', '💡':'bulb', '🛡':'shield', '📝':'pencil',
 '✏':'pencil', '📣':'megaphone', '🚀':'rocket', '🔵':'dot', '⬜':'square',
 '📄':'file', '📆':'calendar', '🗺':'map', '👋':'sparkle', '🧠':'brain',
 '💵':'banknote', '🏦':'bank', '⚡':'bolt', '🎚':'sliders', '🧾':'receipt',
 '🔔':'bell', '⚙':'settings', '📚':'books', '📌':'pin', '🔴':'dot',
 '🌍':'globe', '⚖':'scale', '🏛':'bank', '📦':'box', '📉':'trend-down',
 '🔄':'refresh', '🎓':'graduation', '🤖':'robot', '🧮':'calculator', '⭐':'star',
 '🟢':'dot', '🏢':'building', '💧':'droplet', '🎉':'sparkle', '❓':'help',
 '🗑':'trash', '👤':'user', '✦':'sparkle', '📤':'upload', '💰':'coins',
 '📎':'paperclip', '💾':'save', '🟡':'dot', '🌏':'globe', '🌐':'globe',
 '🥇':'medal', '🤝':'handshake', '✉':'mail', '👥':'users', '📱':'mobile',
 '📧':'mail', '📰':'news', '💶':'banknote', '🧭':'compass', '🔥':'flame',
 '💱':'exchange', '✗':'x', '★':'star', '🏆':'trophy', '📥':'download',
 '✨':'sparkle', '🔒':'lock', '☰':'menu', '🛢':'barrel', '🏭':'factory',
 '🌉':'building', '✂':'scissors', '🔍':'search', '🧲':'magnet', '🎬':'clapper',
 '💎':'diamond', '✍':'pencil', '🎭':'theater', '⚓':'anchor', '📞':'phone',
 '📹':'video', '🔀':'shuffle', '☆':'star', '📸':'camera', '💸':'banknote',
 '🎲':'dice', '🏁':'flag', '🔬':'microscope', '🏷':'tag', '⬇':'download',
 '🛒':'cart', '💳':'card', '🛠':'tools', '🔑':'key', '🗓':'calendar',
 '🌱':'seedling', '📲':'mobile', '🖥':'desktop',
 # ── Cua llarga ────────────────────────────────────────────────────
 'ⓘ':'info', '🌅':'sunrise', '✈':'plane', '🌿':'seedling', '🔧':'tools',
 '🥩':'cart', '🌊':'droplet', '☕':'cup', '🚗':'car', '🔨':'tools',
 '👨':'user', '👩':'user', '👧':'user', '😌':'sparkle', '🖶':'printer',
 '📑':'file', '📂':'folders', '🔗':'link',
}


def svg(name):
    """SVG compacte d'una icona, dimensionat en em perquè hereti el context."""
    d = PATHS.get(ALIAS.get(name, name))
    assert d, 'icona desconeguda: %s' % name
    return '<svg class="ei" viewBox="0 0 24 24">%s</svg>' % d


CSS = (
 ".ei{width:1.15em;height:1.15em;display:inline-block;vertical-align:-.19em;"
 "fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;"
 "stroke-linejoin:round;flex-shrink:0}\n"
 ".sidebar-item-icon .ei,.sidebar-item-icon>.ei{width:1em;height:1em;vertical-align:-.12em}\n"
)
