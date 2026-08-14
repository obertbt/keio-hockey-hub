/**
 * ホーム画面のアイコンを作る。
 *
 *   pnpm icons
 *
 * 元の絵は下の SVG だけ。PNG はここから作る。
 * 手で描いた PNG を置き換えていくと、次に直す人が
 * 「どれが本物か」を探すことになる。元はひとつにしておく。
 *
 * ## 決めたこと
 *
 * 慶應の色も、ホッケーの道具も出さない。
 * これは部の看板ではなく、**毎日ひらくもの**で、
 * 並ぶ場所はその人のホーム画面。周りから浮かないほうがよい。
 *
 * 絵は「積み上がり」。三本の棒が少しずつ高くなる。
 * 日報が積み上がって、できることが増えていく、という
 * このアプリがやろうとしていることそのもの。
 * ホッケーには見えないし、意味は後から効いてくる。
 *
 * ## 切り抜きに耐えること
 *
 * Android は maskable といって、端末ごとに違う形（丸・角丸・雫）へ
 * 勝手に切り抜く。外側 20% は切られる前提で描く。
 * 512 の中心は (256,256)、安全なのは中心から半径 205 まで。
 * いまの絵はいちばん遠い角でも 119 なので、どう切られても欠けない。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');

/** 三本の棒。y と高さで「積み上がり」を出す。 */
const bars = (fill) => `
  <rect x="168" y="270" width="36" height="66"  rx="18" fill="${fill}" opacity="0.35"/>
  <rect x="238" y="228" width="36" height="108" rx="18" fill="${fill}" opacity="0.65"/>
  <rect x="308" y="176" width="36" height="160" rx="18" fill="${fill}"/>
`;

/**
 * 候補。選び直すときは DESIGN を書き換えて `pnpm icons` を流すだけ。
 * 使っていない案も消さずに置いておく。比べ直せるようにするため。
 */
const designs = {
  /** A 生成り × 墨。いちばん明るい。白い壁紙だと輪郭が消える。 */
  ivory: {
    background: '#F2EDE4',
    body: `<rect width="512" height="512" fill="#F2EDE4"/>${bars('#22201C')}`,
  },

  /** B 墨 × 生成り。暗い壁紙に沈む。 */
  ink: {
    background: '#201E1B',
    body: `<rect width="512" height="512" fill="#201E1B"/>${bars('#F2EDE4')}`,
  },

  /** C 砂 × 墨。明暗どちらの壁紙でも輪郭が残る。既定。 */
  sandbars: {
    background: '#F4EDE3',
    body: `
      <defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stop-color="#F4EDE3"/><stop offset="1" stop-color="#DCC5AE"/>
      </linearGradient></defs>
      <rect width="512" height="512" fill="url(#g)"/>${bars('#2E2A26')}
    `,
  },

  /** D 砂 × 少し欠けた円。「まだ途中」の意味。読み手に伝わるかは賭け。 */
  sand: {
    background: '#F4EDE3',
    body: `
      <defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stop-color="#F4EDE3"/><stop offset="1" stop-color="#DCC5AE"/>
      </linearGradient></defs>
      <rect width="512" height="512" fill="url(#g)"/>
      <path d="M256 158 a98 98 0 1 1 -69 28.7"
            fill="none" stroke="#2E2A26" stroke-width="26" stroke-linecap="round"/>
    `,
  },

  /** E 灰桜 × ひと筆。いちばん柔らかい。好みが分かれる。 */
  rose: {
    background: '#F0E6E3',
    body: `
      <defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stop-color="#F0E6E3"/><stop offset="1" stop-color="#C9A9A6"/>
      </linearGradient></defs>
      <rect width="512" height="512" fill="url(#g)"/>
      <path d="M182 332 C 204 248, 262 196, 332 180"
            fill="none" stroke="#2A2523" stroke-width="28" stroke-linecap="round"/>
    `,
  },
};

/** いま使っている案。 */
const DESIGN = 'sandbars';

const design = designs[DESIGN];
if (!design) {
  throw new Error(`知らないデザインです: ${DESIGN}（${Object.keys(designs).join(' / ')}）`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${design.body}</svg>`;

mkdirSync(publicDir, { recursive: true });
writeFileSync(join(publicDir, 'icon.svg'), `${svg}\n`);

for (const size of [192, 512]) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(join(publicDir, `icon-${size}.png`));
}

/*
  起動直後の色も、ここから書き出す。

  background_color は、押してから画面が出るまでの一瞬に出る色。
  ここにアイコンが乗るので、**アイコンの地の色と同じ**にする。
  違う色だと、押したものと出てきたものが別に見える。

  theme_color（端末の枠の色）はここでは触らない。
  あれは画面の色に合わせるもので、アイコンとは別の話。
*/
const manifestPath = join(publicDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.background_color = design.background;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`アイコンを作りました（${DESIGN}）: icon.svg / icon-192.png / icon-512.png`);
console.log(`manifest.json の background_color を合わせました: ${design.background}`);
