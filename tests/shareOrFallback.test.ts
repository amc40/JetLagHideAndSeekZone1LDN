import { afterEach, expect, test, vi } from "vitest";

import { shareHidingZone } from "@/lib/shareHidingZone";
import { shareOrFallback } from "@/lib/utils";

afterEach(() => {
    vi.unstubAllGlobals();
});

test("passes the human-readable text alongside the URL to the native share sheet", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });

    const result = await shareOrFallback(
        "https://example.com/zone",
        "> (Radius) Are you within 2 kilometers of me?\nYes\n\n",
    );

    expect(result).toBe(true);
    expect(share).toHaveBeenCalledWith({
        url: "https://example.com/zone",
        text: "> (Radius) Are you within 2 kilometers of me?\nYes\n\n",
    });
});

test("omits text from the share call when there's nothing to summarize", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });

    await shareOrFallback("https://example.com/zone");

    expect(share).toHaveBeenCalledWith({
        url: "https://example.com/zone",
        text: undefined,
    });
});

test("falls back to copying the summary text plus URL to the clipboard when native share is unavailable", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const result = await shareOrFallback(
        "https://example.com/zone",
        "> (Radius) Are you within 2 kilometers of me?\nYes\n\n",
    );

    expect(result).toBe("clipboard");
    expect(writeText).toHaveBeenCalledWith(
        "> (Radius) Are you within 2 kilometers of me?\nYes\n\nhttps://example.com/zone",
    );
});

test("shareHidingZone shares a human-readable question summary alongside the share URL", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
        share,
        clipboard: { writeText: vi.fn() },
    });
    vi.stubGlobal("window", {
        location: {
            protocol: "https:",
            host: "example.com",
            pathname: "/zone",
        },
    });

    await shareHidingZone(
        {
            questions: [
                {
                    id: "radius",
                    key: 1,
                    data: {
                        lat: 51.5,
                        lng: -0.1,
                        drag: true,
                        color: "blue",
                        collapsed: false,
                        hidden: false,
                        radius: 2,
                        unit: "kilometers",
                        within: true,
                    },
                },
            ],
        },
        false,
        "",
    );

    expect(share).toHaveBeenCalledTimes(1);
    const call = share.mock.calls[0][0];
    expect(call.text).toBe(
        "> (Radius) Are you within 2 kilometers of me?\nYes\n\n",
    );
    expect(call.url).toContain("example.com/zone?hzc=");
});
