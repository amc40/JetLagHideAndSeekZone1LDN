import {
    GAME_CODE_ALPHABET,
    GAME_CODE_LENGTH,
} from "../../src/lib/game/protocol";

const randomBytes = (length: number): Uint8Array =>
    crypto.getRandomValues(new Uint8Array(length));

/**
 * A typeable game code (50 bits). It is also the seeker credential, so it
 * must be unguessable. 32 symbols map onto a byte with `& 31` without bias.
 */
export const generateGameCode = (
    random: (length: number) => Uint8Array = randomBytes,
): string =>
    Array.from(
        random(GAME_CODE_LENGTH),
        (byte) => GAME_CODE_ALPHABET[byte & 31],
    ).join("");

/** The hider's secret: 128 random bits, base64url. */
export const generateHiderKey = (
    random: (length: number) => Uint8Array = randomBytes,
): string =>
    btoa(String.fromCharCode(...random(16)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
