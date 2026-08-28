/* Service Worker —— 部署到 HTTPS 后启用 Web Push（后台推送） */
/* 页面打开时由页面内引擎提醒；此文件负责：页面关闭时的推送展示与通知操作转发 */
const VERSION = 'dailytodo-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

/* 静态资源：先走网络，失败回退缓存（简单离线策略，可后续增强） */
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.open(VERSION).then(async cache => {
      try {
        const fresh = await fetch(e.request);
        if (e.request.method === 'GET') cache.put(e.request, fresh.clone());
        return fresh;
      } catch (err) {
        const hit = await cache.match(e.request);
        return hit || Response.error();
      }
    })
  );
});

self.addEventListener('push', e => {
  let data = { title: '⏰ 待办提醒', body: '' };
  try {
    const p = e.data ? e.data.json() : null;
    if (p) data = Object.assign(data, p);
  } catch (err) {}
  e.waitUntil(self.registration.showNotification(data.title || '⏰ 待办提醒', {
    body: data.body || '',
    icon: data.icon,
    badge: data.badge,
    data: data,
    actions: [
      { action: 'done', title: '完成' },
      { action: 'snooze', title: '稍后提醒' },
    ],
  }));
});

self.addEventListener('notificationclick', e => {
  const d = e.notification.data || {};
  e.notification.close();
  const msg = { type: 'todo-action', action: e.action, items: d.items || [], tk: d.tk };
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      w.postMessage(msg);
      if (e.action) w.focus();
    }
    if (!wins.length) {
      await self.registration.showNotification('请打开「每日待办」', {
        body: e.action ? '通知操作需要打开应用页面后生效' : '打开应用查看当天安排',
      });
    }
  })());
});
