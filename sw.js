/* ═══════════════════════════════════════════════════════════
   DocDesk Service Worker
   หน้าที่: เก็บไฟล์ไว้ในเครื่องผู้ใช้ เพื่อให้เปิดใช้งานได้แม้ไม่มีอินเทอร์เน็ต

   เวลาอัปเดตโปรแกรม ให้เปลี่ยนเลข VERSION ข้างล่างนี้ทุกครั้ง
   (เช่น v1 เป็น v2) ผู้ใช้จะได้รับแจ้งเตือนว่ามีเวอร์ชันใหม่
   ═══════════════════════════════════════════════════════════ */

const VERSION   = 'v18';
const APP_CACHE = 'docdesk-app-' + VERSION;   /* ไฟล์ของเราเอง */
const LIB_CACHE = 'docdesk-lib-v1';           /* ไลบรารีจาก CDN (เวอร์ชันตายตัว ไม่ต้องล้างบ่อย) */

/* ไฟล์หลักของโปรแกรม เก็บทันทีตอนติดตั้ง */
const APP_FILES = [
  './',
  './index.html',
  './eraser.html',
  './upscaler.html',
  './manifest.json',
  './docdesk-icon-192.png',
  './docdesk-icon-512.png',
  './favicon-32.png',
  './apple-touch-icon.png'
];

/* ไลบรารีที่โปรแกรมต้องใช้ เก็บล่วงหน้าเพื่อให้ทำงานออฟไลน์ได้ครบทุกเครื่องมือ */
const LIB_FILES = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js',
  'https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js'
];

/* ── ติดตั้ง: เก็บไฟล์ลงเครื่อง ── */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const app = await caches.open(APP_CACHE);
    await app.addAll(APP_FILES);                    /* ไฟล์เราเอง ต้องสำเร็จทุกไฟล์ */

    const lib = await caches.open(LIB_CACHE);
    /* ไลบรารีเก็บทีละตัว ถ้าตัวใดโหลดไม่ได้ก็ข้ามไป ไม่ให้ล้มทั้งกระบวนการ */
    await Promise.all(LIB_FILES.map(async url => {
      try {
        if (await lib.match(url)) return;
        const res = await fetch(url, { mode: 'cors', cache: 'no-cache' });
        if (res && res.ok) await lib.put(url, res.clone());
      } catch (e) { /* ข้ามไป ค่อยเก็บตอนใช้งานจริง */ }
    }));
  })());
});

/* ── เปิดใช้งาน: ล้างแคชเวอร์ชันเก่าทิ้ง ── */
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (k.startsWith('docdesk-app-') && k !== APP_CACHE) return caches.delete(k);
      if (k.startsWith('docdesk-lib-') && k !== LIB_CACHE) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

/* ── รับคำสั่งจากหน้าเว็บ ── */
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();      /* ผู้ใช้กดอัปเดตเดี๋ยวนี้ */
  if (data.type === 'GET_VERSION' && event.source) {
    event.source.postMessage({ type: 'VERSION', version: VERSION });
  }
});

/* ── ดักการโหลดไฟล์ทุกครั้ง ── */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isLib = /^(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com)$/.test(url.hostname);

  /* ไลบรารีจาก CDN: หยิบจากแคชก่อน (เร็วและใช้ออฟไลน์ได้) */
  if (isLib) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const lib = await caches.open(LIB_CACHE);
          lib.put(req, res.clone());
        }
        return res;
      } catch (e) {
        return new Response('', { status: 504, statusText: 'ออฟไลน์และยังไม่มีไฟล์นี้ในเครื่อง' });
      }
    })());
    return;
  }

  /* ไฟล์ของเราเอง: ลองโหลดจากเน็ตก่อนเพื่อให้ได้เวอร์ชันล่าสุด ถ้าไม่มีเน็ตค่อยใช้ของในเครื่อง */
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const app = await caches.open(APP_CACHE);
          app.put(req, res.clone());
        }
        return res;
      } catch (e) {
        /* หาแบบตรงตัวก่อน แล้วค่อยหาแบบไม่สนใจ ?query (เช่น eraser.html?embed=1) */
        const cached = await caches.match(req) || await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const home = await caches.match('./index.html');
          if (home) return home;
        }
        return new Response('ออฟไลน์', { status: 503 });
      }
    })());
  }
});
