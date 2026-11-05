/**
 * Web Push from a Worker, using only WebCrypto and fetch:
 *
 * - RFC 8291 (message encryption) with RFC 8188's `aes128gcm` content coding.
 * - RFC 8292 (VAPID) for the `Authorization` header.
 *
 * Node's `web-push` package can't run on Workers, hence this. It is verified
 * against that package in `tests/webPush.test.ts`: payloads encrypted here are
 * decrypted by the reference implementation, and the VAPID JWT is verified
 * independently.
 */
import type { PushSubscriptionData } from "../../src/lib/game/protocol";

export interface PushEnv {
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
}

export interface PushResult {
    ok: boolean;
    status: number;
    /** The push service says this subscription no longer exists (404/410). */
    gone: boolean;
    error?: string;
}

/** What the service worker receives; deliberately tiny and free of content. */
export interface PushPayload {
    k: "ask" | "answer" | "zone-notice" | "test";
    s?: number;
}

/** How long the push service should hold an undelivered message. */
const TTL_SECONDS = 60 * 60;
const RECORD_SIZE = 4096;
const VAPID_LIFETIME_SECONDS = 12 * 60 * 60;

const encoder = new TextEncoder();

export const base64UrlEncode = (bytes: Uint8Array): string =>
    btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

export const base64UrlDecode = (value: string): Uint8Array => {
    const padded = value
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(value.length / 4) * 4, "=");
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

const concat = (...parts: Uint8Array[]): Uint8Array => {
    const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
};

const hkdf = async (
    salt: Uint8Array,
    ikm: Uint8Array,
    info: Uint8Array,
    lengthBytes: number,
): Promise<Uint8Array> => {
    const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
        "deriveBits",
    ]);
    return new Uint8Array(
        await crypto.subtle.deriveBits(
            { name: "HKDF", hash: "SHA-256", salt, info },
            key,
            lengthBytes * 8,
        ),
    );
};

/**
 * Encrypts `plaintext` for a push subscription (RFC 8291, aes128gcm).
 * `options` exists so tests can pin the otherwise random salt and sender key.
 */
export const encryptPayload = async (
    subscription: PushSubscriptionData,
    plaintext: Uint8Array,
    options: { salt?: Uint8Array; senderKeys?: CryptoKeyPair } = {},
): Promise<Uint8Array> => {
    if (plaintext.length > RECORD_SIZE - 17) {
        throw new Error("push payload too large for a single record");
    }

    const userPublic = base64UrlDecode(subscription.keys.p256dh);
    const authSecret = base64UrlDecode(subscription.keys.auth);
    if (userPublic.length !== 65 || userPublic[0] !== 4) {
        throw new Error("bad subscription public key");
    }

    const senderKeys =
        options.senderKeys ??
        ((await crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveBits"],
        )) as CryptoKeyPair);
    // workers-types types exportKey as `ArrayBuffer | JsonWebKey`; "raw" is the former.
    const senderPublic = new Uint8Array(
        (await crypto.subtle.exportKey(
            "raw",
            senderKeys.publicKey,
        )) as ArrayBuffer,
    );

    const userKey = await crypto.subtle.importKey(
        "raw",
        userPublic,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        [],
    );
    const sharedSecret = new Uint8Array(
        await crypto.subtle.deriveBits(
            // `public` is the standard name; workers-types spells it `$public`.
            { name: "ECDH", public: userKey } as never,
            senderKeys.privateKey,
            256,
        ),
    );

    // RFC 8291 section 3.4: mix the auth secret and both public keys in.
    const keyInfo = concat(
        encoder.encode("WebPush: info\0"),
        userPublic,
        senderPublic,
    );
    const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

    // RFC 8188: derive the content-encryption key and nonce from a fresh salt.
    const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
    const contentKey = await hkdf(
        salt,
        ikm,
        encoder.encode("Content-Encoding: aes128gcm\0"),
        16,
    );
    const nonce = await hkdf(
        salt,
        ikm,
        encoder.encode("Content-Encoding: nonce\0"),
        12,
    );

    // One record: the data followed by the 0x02 "last record" delimiter.
    const record = concat(plaintext, new Uint8Array([2]));
    const aesKey = await crypto.subtle.importKey(
        "raw",
        contentKey,
        "AES-GCM",
        false,
        ["encrypt"],
    );
    const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: nonce },
            aesKey,
            record,
        ),
    );

    // Header: salt(16) | record size(4, BE) | key id length(1) | key id (sender public key).
    const header = new Uint8Array(16 + 4 + 1);
    header.set(salt, 0);
    new DataView(header.buffer).setUint32(16, RECORD_SIZE);
    header[20] = senderPublic.length;

    return concat(header, senderPublic, ciphertext);
};

/** The `Authorization` header value for a push to `endpoint` (RFC 8292). */
export const vapidAuthorization = async (
    endpoint: string,
    keys: { publicKey: string; privateKey: string; subject: string },
    nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> => {
    const publicBytes = base64UrlDecode(keys.publicKey);
    if (publicBytes.length !== 65) throw new Error("bad VAPID public key");

    const signingKey = await crypto.subtle.importKey(
        "jwk",
        {
            kty: "EC",
            crv: "P-256",
            x: base64UrlEncode(publicBytes.slice(1, 33)),
            y: base64UrlEncode(publicBytes.slice(33, 65)),
            d: keys.privateKey,
            ext: true,
        },
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
    );

    const signingInput = [
        { typ: "JWT", alg: "ES256" },
        {
            aud: new URL(endpoint).origin,
            exp: nowSeconds + VAPID_LIFETIME_SECONDS,
            sub: keys.subject,
        },
    ]
        .map((part) => base64UrlEncode(encoder.encode(JSON.stringify(part))))
        .join(".");

    // WebCrypto already returns the raw r||s form JWS wants for ES256.
    const signature = new Uint8Array(
        await crypto.subtle.sign(
            { name: "ECDSA", hash: "SHA-256" },
            signingKey,
            encoder.encode(signingInput),
        ),
    );

    return `vapid t=${signingInput}.${base64UrlEncode(signature)}, k=${keys.publicKey}`;
};

export const sendWebPush = async (
    subscription: PushSubscriptionData,
    payload: PushPayload,
    env: PushEnv,
): Promise<PushResult> => {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
        return {
            ok: false,
            status: 0,
            gone: false,
            error: "Push is not configured on the server",
        };
    }

    try {
        const [body, authorization] = await Promise.all([
            encryptPayload(
                subscription,
                encoder.encode(JSON.stringify(payload)),
            ),
            vapidAuthorization(subscription.endpoint, {
                publicKey: env.VAPID_PUBLIC_KEY,
                privateKey: env.VAPID_PRIVATE_KEY,
                subject:
                    env.VAPID_SUBJECT ??
                    "https://amc40.github.io/JetLagHideAndSeekZone1LDN/",
            }),
        ]);

        const response = await fetch(subscription.endpoint, {
            method: "POST",
            headers: {
                Authorization: authorization,
                "Content-Encoding": "aes128gcm",
                "Content-Type": "application/octet-stream",
                TTL: String(TTL_SECONDS),
                // A question is time-sensitive; ask the service to deliver now.
                Urgency: "high",
            },
            body,
        });

        return {
            ok: response.ok,
            status: response.status,
            gone: response.status === 404 || response.status === 410,
            ...(response.ok
                ? {}
                : { error: `Push service said ${response.status}` }),
        };
    } catch (error) {
        return {
            ok: false,
            status: 0,
            gone: false,
            error: error instanceof Error ? error.message : "Push failed",
        };
    }
};
