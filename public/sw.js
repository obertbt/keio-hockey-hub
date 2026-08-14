/*
 * Service Worker（0028）。
 *
 * スマートフォンに通知を出すために要る。
 * ここはブラウザ側で動く。アプリを閉じていても動く唯一の場所。
 *
 * **ここに秘密は置かない。** 誰でも読めるファイルとして配られる。
 * 中身の暗号は、ブラウザと送信側の鍵で行われる（ここは触らない）。
 *
 * ページの中身をためこむ（オフライン対応）ことは、いまはしない。
 * 古い画面が残って「直したのに直っていない」が起きるほうが困る。
 * この Service Worker は通知のためだけに置いている。
 */

// 新しい版を入れたら、待たずに入れ替える。
// 待たせると、古い版がいつまでも通知を受け取り続ける。
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: '慶應ホッケーハブ', body: event.data.text() };
  }

  const title = payload.title || '慶應ホッケーハブ';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // 同じ話の通知が並んだら、後のものに置き換える。
      // 開くまでに5件たまって、5件とも同じ、が起きないように。
      tag: payload.tag || undefined,
      renotify: Boolean(payload.tag),
      data: { url: payload.url || '/today' },
      // 押さずに消せるようにする。
      // 消せない通知は、それだけで嫌われる。
      requireInteraction: false,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = (event.notification.data && event.notification.data.url) || '/today';

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      // すでに開いているタブがあれば、そこを使う。
      // 押すたびにタブが増えると、そのうち開かれなくなる。
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(url);
          return;
        }
      }

      if (self.clients.openWindow) await self.clients.openWindow(url);
    })(),
  );
});
