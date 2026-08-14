'use client';

import NextLink, { useLinkStatus } from 'next/link';
import { createPortal } from 'react-dom';
import type { ComponentProps } from 'react';

/**
 * 押したことが分かるリンク。
 *
 * なぜ要るのか:
 *   この画面はほとんどがサーバー側で作られる。
 *   つまりリンクを押してから中身が出るまで、必ず往復が1回入る。
 *   その間、画面は**押す前とまったく同じ**だった。
 *   反応が無いので、届いていないと思ってもう一度押す。
 *   二度押しはさらに遅くなるので、余計に重く感じる。
 *
 * 出しているもの:
 *   * 画面のいちばん上に細い帯。いま動いている、ということだけを伝える
 *   * 押したリンク自体を少し薄くする（`:has` を使う。下の CSS）
 *
 * 進み具合は出さない。
 * 何割まで来たかは分からないので、出せば嘘になる。
 */
function Pending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <>
      {/*
        これが入っている間だけ、親のリンクを薄くする（globals.css）。
        子から親の見た目を変えられないので、`:has` に拾わせている。
      */}
      <span data-link-pending hidden />
      {createPortal(<span className="route-progress" aria-hidden />, document.body)}
    </>
  );
}

/**
 * `next/link` の置き換え。使い方は同じ。
 *
 * 新しくリンクを書くときも、`next/link` ではなくこちらから import する。
 */
export function Link({ children, ...props }: ComponentProps<typeof NextLink>) {
  return (
    <NextLink {...props}>
      {children}
      <Pending />
    </NextLink>
  );
}
