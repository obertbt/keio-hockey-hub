'use client';

import { useActionState, useState } from 'react';

import { Button } from '@/components/ui/button';
import { removePushDevice, type PushActionState } from '@/features/notifications/actions';

/** 登録した端末を消す。一度押しただけでは消さない。 */
export function RemoveDeviceButton({ subscriptionId }: { subscriptionId: string }) {
  const [state, action] = useActionState<PushActionState, FormData>(removePushDevice, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="subscription_id" value={subscriptionId} />
      {confirming ? (
        <Button type="submit" variant="danger" size="sm">
          消す
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          解除
        </Button>
      )}
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
