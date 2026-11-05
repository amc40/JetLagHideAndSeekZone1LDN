import { execFileSync } from "node:child_process";
import { createECDH, createPublicKey, randomBytes, verify } from "node:crypto";
import { createRequire } from "node:module";

import { afterEach, describe, expect, test, vi } from "vitest";

import type { PushSubscriptionData } from "../src/lib/game/protocol";
import {
    base64UrlDecode,
    base64UrlEncode,
    encryptPayload,
    sendWebPush,
    vapidAuthorization,
} from "../worker/src/webpush";

// The reference implementation, and the http_ece it decrypts with. Neither is
// used by the Worker; they are here so our WebCrypto code is checked against
// something we did not write.
const require = createRequire(import.meta.url);
const webpush = require("web-push");
const ece = createRequire(require.resolve("web-push"))("http_ece");

/** A fake browser: holds the subscription's private key and can decrypt. */
const makeSubscriber = (
    endpoint = "https://fcm.googleapis.com/fcm/send/abc",
) => {
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const authSecret = randomBytes(16);
    const subscription: PushSubscriptionData = {
        endpoint,
        keys: {
            p256dh: base64UrlEncode(ecdh.getPublicKey()),
            auth: base64UrlEncode(authSecret),
        },
    };
    const decrypt = (body: Uint8Array): Buffer =>
        ece.decrypt(Buffer.from(body), {
            version: "aes128gcm",
            privateKey: ecdh,
            authSecret,
        });
    return { subscription, decrypt };
};

const vapidKeys = () => {
    const { publicKey, privateKey } = webpush.generateVAPIDKeys();
    return { publicKey, privateKey, subject: "https://example.test/" };
};

/** Verifies an ES256 JWT with a raw P-256 public key, using Node's crypto. */
const verifyJwt = (jwt: string, publicKey: string) => {
    const [header, claims, signature] = jwt.split(".");
    const raw = base64UrlDecode(publicKey);
    const key = createPublicKey({
        key: {
            kty: "EC",
            crv: "P-256",
            x: base64UrlEncode(raw.slice(1, 33)),
            y: base64UrlEncode(raw.slice(33, 65)),
        },
        format: "jwk",
    });
    const valid = verify(
        "sha256",
        Buffer.from(`${header}.${claims}`),
        { key, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature, "base64url"),
    );
    return {
        valid,
        header: JSON.parse(Buffer.from(header, "base64url").toString()),
        claims: JSON.parse(Buffer.from(claims, "base64url").toString()),
    };
};

const parseVapid = (value: string) => {
    const match = /^vapid t=([^,]+), k=(.+)$/.exec(value);
    if (!match) throw new Error(`not a vapid header: ${value}`);
    return { jwt: match[1], k: match[2] };
};

describe("payload encryption (RFC 8291 / 8188)", () => {
    test("the reference implementation decrypts what we encrypt", async () => {
        const { subscription, decrypt } = makeSubscriber();
        const plaintext = new TextEncoder().encode('{"k":"ask","s":3}');

        const body = await encryptPayload(subscription, plaintext);

        expect(decrypt(body).toString()).toBe('{"k":"ask","s":3}');
    });

    test.each([0, 1, 100, 2000, 4096 - 17])(
        "round-trips a %i byte payload",
        async (length) => {
            const { subscription, decrypt } = makeSubscriber();
            const plaintext = randomBytes(length);

            const body = await encryptPayload(subscription, plaintext);

            expect(decrypt(body).equals(plaintext)).toBe(true);
        },
    );

    test("a payload too big for one record is refused", async () => {
        const { subscription } = makeSubscriber();
        await expect(
            encryptPayload(subscription, new Uint8Array(4096 - 16)),
        ).rejects.toThrow(/too large/);
    });

    test("every message uses a fresh salt and sender key", async () => {
        const { subscription } = makeSubscriber();
        const plaintext = new TextEncoder().encode("same");

        const a = await encryptPayload(subscription, plaintext);
        const b = await encryptPayload(subscription, plaintext);

        expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
        expect(
            Buffer.from(a.slice(0, 16)).equals(Buffer.from(b.slice(0, 16))),
        ).toBe(false);
    });

    test("the header is salt | record size | key id length | sender key", async () => {
        const { subscription } = makeSubscriber();
        const body = await encryptPayload(subscription, new Uint8Array(3));

        expect(new DataView(body.buffer, body.byteOffset).getUint32(16)).toBe(
            4096,
        );
        expect(body[20]).toBe(65); // key id is the 65-byte uncompressed sender key
        expect(body[21]).toBe(4); // uncompressed point marker
    });

    test("the wrong subscriber cannot decrypt", async () => {
        const target = makeSubscriber();
        const other = makeSubscriber();
        const body = await encryptPayload(
            target.subscription,
            new TextEncoder().encode("secret"),
        );

        expect(() => other.decrypt(body)).toThrow();
    });

    test("a malformed subscription key is rejected", async () => {
        const { subscription } = makeSubscriber();
        await expect(
            encryptPayload(
                {
                    ...subscription,
                    keys: { ...subscription.keys, p256dh: "AAAA" },
                },
                new Uint8Array(1),
            ),
        ).rejects.toThrow(/public key/);
    });
});

describe("VAPID (RFC 8292)", () => {
    test("produces a valid ES256 JWT for the endpoint's origin", async () => {
        const keys = vapidKeys();
        const header = await vapidAuthorization(
            "https://fcm.googleapis.com/fcm/send/abc",
            keys,
            1_700_000_000,
        );
        const { jwt, k } = parseVapid(header);
        const decoded = verifyJwt(jwt, keys.publicKey);

        expect(k).toBe(keys.publicKey);
        expect(decoded.valid).toBe(true);
        expect(decoded.header).toEqual({ typ: "JWT", alg: "ES256" });
        expect(decoded.claims).toEqual({
            aud: "https://fcm.googleapis.com",
            exp: 1_700_000_000 + 12 * 3600,
            sub: "https://example.test/",
        });
    });

    test("expiry stays inside the 24h limit push services enforce", async () => {
        const keys = vapidKeys();
        const now = Math.floor(Date.now() / 1000);
        const { jwt } = parseVapid(
            await vapidAuthorization("https://web.push.apple.com/x", keys, now),
        );
        const { claims } = verifyJwt(jwt, keys.publicKey);

        expect(claims.exp - now).toBeLessThanOrEqual(24 * 3600);
        expect(claims.exp - now).toBeGreaterThan(0);
    });

    test("agrees with the reference implementation on shape and validity", async () => {
        const keys = vapidKeys();
        const endpoint = "https://updates.push.services.mozilla.com/wpush/v2/x";

        const ours = parseVapid(await vapidAuthorization(endpoint, keys));
        const theirs = webpush.getVapidHeaders(
            new URL(endpoint).origin,
            keys.subject,
            keys.publicKey,
            keys.privateKey,
            "aes128gcm",
        );
        const reference = parseVapid(theirs.Authorization);

        const a = verifyJwt(ours.jwt, keys.publicKey);
        const b = verifyJwt(reference.jwt, keys.publicKey);
        expect(a.valid).toBe(true);
        expect(b.valid).toBe(true);
        expect(a.header).toEqual(b.header);
        expect(Object.keys(a.claims).sort()).toEqual(
            Object.keys(b.claims).sort(),
        );
        expect(a.claims.aud).toBe(b.claims.aud);
        expect(a.claims.sub).toBe(b.claims.sub);
        expect(ours.k).toBe(reference.k);
    });

    test("a signature made with the wrong key does not verify", async () => {
        const keys = vapidKeys();
        const { jwt } = parseVapid(
            await vapidAuthorization("https://web.push.apple.com/x", keys),
        );

        expect(verifyJwt(jwt, vapidKeys().publicKey).valid).toBe(false);
    });
});

describe("generate-vapid-keys script", () => {
    const generate = () =>
        JSON.parse(
            execFileSync(
                process.execPath,
                ["worker/scripts/generate-vapid-keys.mjs", "--json"],
                { encoding: "utf8" },
            ),
        ) as { publicKey: string; privateKey: string };

    test("its keys sign JWTs that verify, and the reference accepts them", async () => {
        const keys = generate();

        // The reference implementation validates key shape and length.
        expect(() =>
            webpush.setVapidDetails(
                "https://example.test/",
                keys.publicKey,
                keys.privateKey,
            ),
        ).not.toThrow();

        const { jwt } = parseVapid(
            await vapidAuthorization("https://web.push.apple.com/x", {
                ...keys,
                subject: "https://example.test/",
            }),
        );
        expect(verifyJwt(jwt, keys.publicKey).valid).toBe(true);
    });

    test("every run produces a different pair", () => {
        expect(generate().privateKey).not.toBe(generate().privateKey);
    });
});

describe("sendWebPush", () => {
    afterEach(() => vi.unstubAllGlobals());

    const env = () => {
        const keys = vapidKeys();
        return {
            VAPID_PUBLIC_KEY: keys.publicKey,
            VAPID_PRIVATE_KEY: keys.privateKey,
            VAPID_SUBJECT: keys.subject,
        };
    };

    test("posts an encrypted, authorised message the subscriber can read", async () => {
        const { subscription, decrypt } = makeSubscriber();
        const fetchMock = vi.fn(
            async () => new Response(null, { status: 201 }),
        );
        vi.stubGlobal("fetch", fetchMock);
        const config = env();

        const result = await sendWebPush(
            subscription,
            { k: "answer", s: 9 },
            config,
        );

        expect(result).toEqual({ ok: true, status: 201, gone: false });
        const [url, init] = fetchMock.mock.calls[0] as unknown as [
            string,
            RequestInit,
        ];
        expect(url).toBe(subscription.endpoint);
        expect(init.method).toBe("POST");
        const headers = init.headers as Record<string, string>;
        expect(headers["Content-Encoding"]).toBe("aes128gcm");
        expect(headers.TTL).toBe("3600");
        expect(headers.Urgency).toBe("high");
        const { jwt, k } = parseVapid(headers.Authorization);
        expect(k).toBe(config.VAPID_PUBLIC_KEY);
        expect(verifyJwt(jwt, config.VAPID_PUBLIC_KEY).valid).toBe(true);
        expect(JSON.parse(decrypt(init.body as Uint8Array).toString())).toEqual(
            {
                k: "answer",
                s: 9,
            },
        );
    });

    test.each([404, 410])(
        "%i means the subscription is gone",
        async (status) => {
            vi.stubGlobal("fetch", async () => new Response(null, { status }));
            const { subscription } = makeSubscriber();

            const result = await sendWebPush(subscription, { k: "ask" }, env());

            expect(result).toMatchObject({ ok: false, status, gone: true });
        },
    );

    test.each([400, 413, 429, 500, 503])(
        "%i is a failure but the subscription is kept",
        async (status) => {
            vi.stubGlobal("fetch", async () => new Response(null, { status }));
            const { subscription } = makeSubscriber();

            const result = await sendWebPush(subscription, { k: "ask" }, env());

            expect(result).toMatchObject({ ok: false, status, gone: false });
        },
    );

    test("a network error is reported, not thrown", async () => {
        vi.stubGlobal("fetch", async () => {
            throw new Error("offline");
        });
        const { subscription } = makeSubscriber();

        const result = await sendWebPush(subscription, { k: "ask" }, env());

        expect(result).toMatchObject({
            ok: false,
            gone: false,
            error: "offline",
        });
    });

    test("without VAPID keys nothing is sent and the reason is clear", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const { subscription } = makeSubscriber();

        const result = await sendWebPush(subscription, { k: "test" }, {});

        expect(fetchMock).not.toHaveBeenCalled();
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/not configured/);
    });
});
