'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/field';
import { disconnectChannel, syncChannelNow, type YoutubeActionState } from '@/features/youtube/actions';

/** いま取り込む。本数が多いと少し待つので、その旨を出す。 */
export function SyncButton() {
  const [state, formAction] = useActionState<YoutubeActionState, FormData>(syncChannelNow, {});

  return (
    <form action={formAction} className="space-y-2">
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
      <SyncSubmit />
    </form>
  );
}

function SyncSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="action" block disabled={pending}>
      {pending ? '取り込んでいます…（少し待ちます）' : 'いま取り込む'}
    </Button>
  );
}

/** つなぎを解く。一度押しただけでは解かない。 */
export function DisconnectButton() {
  const [state, formAction] = useActionState<YoutubeActionState, FormData>(disconnectChannel, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={formAction} className="space-y-2">
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      {confirming ? (
        <Button type="submit" variant="danger" size="sm">
          本当に解除する
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          つなぎを解く
        </Button>
      )}
    </form>
  );
}
