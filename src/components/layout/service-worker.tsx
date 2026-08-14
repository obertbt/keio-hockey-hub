'use client';

import { useEffect } from 'react';

/**
 * Service Worker を登録する（0028）。
 *
 * **アプリを開いた時点で登録する。** 通知のボタンを押したときではない。
 *
 * ここを後回しにしていて、ホーム画面に追加できなかった。
 * Chrome は「fetch を扱う Service Worker がいること」を
 * 追加できる条件のひとつにしている。
 * ボタンを押すまで登録していなければ、条件を満たさないので
 * 「アプリをインストール」がいつまでも出てこない。
 *
 * 通知を使わない人にも登録される。
 * 中身はためこまないので、それで困ることはない。
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // 表示を邪魔しないよう、描き終わってから登録する。
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('[sw] 登録できませんでした', error);
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
