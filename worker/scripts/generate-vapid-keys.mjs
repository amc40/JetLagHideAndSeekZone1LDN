// Generates a VAPID key pair for Web Push (RFC 8292).
//
//   pnpm generate:vapid           # human-readable, with the commands to run
//   pnpm generate:vapid --json    # machine-readable
//
// The public key is not secret (the app fetches it from the Worker). Keep the
// private key out of git: store it with `wrangler secret put`, or in
// worker/.dev.vars for local development (both are git-ignored).
import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = privateKey.export({ format: "jwk" });

const b64u = (buffer) => Buffer.from(buffer).toString("base64url");
// Uncompressed point: 0x04 | x | y, the form browsers expect as applicationServerKey.
const publicKey = b64u(
    Buffer.concat([
        Buffer.from([4]),
        Buffer.from(jwk.x, "base64url"),
        Buffer.from(jwk.y, "base64url"),
    ]),
);
const privateKeyB64u = jwk.d;

if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ publicKey, privateKey: privateKeyB64u }));
} else {
    console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
    console.log(`VAPID_PRIVATE_KEY=${privateKeyB64u}`);
    console.log(`
Local development: put both lines in worker/.dev.vars.

Deployed Worker:
  echo '${publicKey}' | pnpm exec wrangler secret put VAPID_PUBLIC_KEY
  echo '<private key above>' | pnpm exec wrangler secret put VAPID_PRIVATE_KEY

If you change the key later, everyone must re-enable notifications (existing
subscriptions are bound to the old public key).`);
}
