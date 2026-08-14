#!/usr/bin/env node
/*
 * スマートフォンへの通知に使う鍵を作る（0028）。
 *
 *   node scripts/generate-vapid-keys.mjs
 *
 * 一度だけ作って、置き場所（Vercel）の環境変数に入れる。
 * **作り直すと、それまでに登録した端末には届かなくなる。**
 * 全員に登録し直してもらうことになるので、無くさないこと。
 */
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log('');
console.log('Vercel の Settings → Environment Variables に、この3つを入れてください。');
console.log('');
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY = ${publicKey}`);
console.log(`VAPID_PRIVATE_KEY            = ${privateKey}`);
console.log('VAPID_SUBJECT                = mailto:あなたのメールアドレス');
console.log('');
console.log('※ VAPID_PRIVATE_KEY に NEXT_PUBLIC_ を付けてはいけません。');
console.log('   付けるとブラウザに配られ、誰でも部員に通知を送れるようになります。');
console.log('');
