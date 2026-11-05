import type { PushSubscriptionData } from "../../src/lib/game/protocol";

export interface PushResult {
    ok: boolean;
    status: number;
    /** The push service says this subscription no longer exists. */
    gone: boolean;
}

// Replaced by the real VAPID + RFC 8291 implementation in the Web Push step.
export const sendWebPush = async (
    _subscription: PushSubscriptionData,
    _payload: unknown,
    _env: unknown,
): Promise<PushResult> => ({ ok: false, status: 501, gone: false });
