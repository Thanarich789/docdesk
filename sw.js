/* ═══════════════════════════════════════════════════════════
   DocDesk Service Worker
   กลยุทธ์: Network First — ดึงจากเน็ตก่อนเสมอ (ได้เวอร์ชันล่าสุด)
   ถ้าไม่มีเน็ตค่อยใช้ไฟล์ที่แคชไว้ในเครื่อง
   ═══════════════════════════════════════════════════════════ */

var CACHE_VERSION = 'docdesk-v1';

/* ไฟล์หลักที่ต้องมีไว้ใช้งานตอนไม่มีเน็ต
   (แก้ path ตรงนี้ถ้าย้ายไฟล์ไอคอนไปที่อื่น) */
var APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png'
];

/* ---------- ติดตั้งครั้งแรก: เก็บไฟล์หลักไว้ในแคช ----------
   เก็บทีละไฟล์แยกกัน (ไม่ใช้ cache.addAll) เพื่อไม่ให้ทั้งชุดล้ม
   ถ้าวันหลังมีไฟล์ใดไฟล์หนึ่งหายไปหรือเปลี่ยนชื่อโดยลืมแก้ที่นี่ */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return Promise.all(
        APP_SHELL.map(function (url) {
          return cache.add(url).catch(function () {
            /* ไฟล์นี้พลาด (หาไม่เจอ/ไม่มีเน็ต) — ข้ามไป ไม่ทำให้ไฟล์อื่นพังตาม */
          });
        })
      );
    })
  );
});

/* ---------- เปิดใช้งาน: ล้างแคชเวอร์ชันเก่าทิ้ง ---------- */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys.filter(function (k) { return k !== CACHE_VERSION; })
              .map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* ---------- รับคำสั่งข้ามการรอ เมื่อผู้ใช้กด "อัปเดตเลย" ---------- */
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------- ดักทุกคำขอไฟล์: Network First ---------- */
self.addEventListener('fetch', function (event) {
  var req = event.request;

  /* แก้เฉพาะคำขอแบบ GET เท่านั้น ปล่อยอย่างอื่น (เช่น POST) ผ่านไปตามปกติ */
  if (req.method !== 'GET') return;

  event.respondWith(
    fetch(req)
      .then(function (res) {
        /* ได้ของใหม่จากเน็ต → อัปเดตแคชไว้เผื่อครั้งหน้าไม่มีเน็ต */
        if (res && (res.status === 200 || res.type === 'opaque')) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(req, copy); }).catch(function () {});
        }
        return res;
      })
      .catch(function () {
        /* ไม่มีเน็ต → ใช้ของที่แคชไว้ */
        return caches.match(req).then(function (cached) {
          if (cached) return cached;
          /* เปิดหน้าเว็บตอนไม่มีเน็ตและไม่เคยแคชไว้ → กลับไปหน้าแรกที่แคชไว้แทน */
          if (req.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'ไม่มีเน็ตและไม่มีไฟล์นี้ในแคช' });
        });
      })
  );
});
