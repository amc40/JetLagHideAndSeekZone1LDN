import { expect, test } from "vitest";

import { describeQuestionsSummary } from "@/lib/describeQuestion";
import { extractJsonObject, parseJsonLenient } from "@/lib/utils";
import type { Question } from "@/maps/schema";
import { questionSchema } from "@/maps/schema";

test("parses plain JSON unchanged", () => {
    const data = '{"a":1,"b":[1,2,3]}';
    expect(parseJsonLenient(data)).toEqual({ a: 1, b: [1, 2, 3] });
});

test("strips a trailing footer some apps append when sharing text", () => {
    const data =
        '{"a":1,"b":"hello"}\n\nSent from Firefox 🦊 https://mzl.la/43doGMX';
    expect(parseJsonLenient(data)).toEqual({ a: 1, b: "hello" });
});

test("strips leading text before the JSON object", () => {
    const data = 'Here is my hiding zone:\n{"a":1}';
    expect(parseJsonLenient(data)).toEqual({ a: 1 });
});

test("ignores braces inside string values when finding the object boundary", () => {
    const data = '{"a":"has a } brace","b":2} trailing junk';
    expect(parseJsonLenient(data)).toEqual({ a: "has a } brace", b: 2 });
});

test("handles nested objects", () => {
    const data = '{"a":{"b":{"c":1}}} footer text';
    expect(parseJsonLenient(data)).toEqual({ a: { b: { c: 1 } } });
});

test("throws the original error when no valid JSON can be found", () => {
    expect(() => parseJsonLenient("not json at all")).toThrow();
});

test("extractJsonObject returns input unchanged when no object is present", () => {
    expect(extractJsonObject("no braces here")).toBe("no braces here");
});

test("parses a single pasted question with a Firefox share footer, as used by the Paste Question flow", () => {
    const data = `{
    "id": "radius",
    "key": 0.639488280478519,
    "data": {
        "lat": 51.49987749431748,
        "lng": -0.16994476318359375,
        "drag": true,
        "color": "orange",
        "collapsed": false,
        "hidden": false,
        "radius": 1,
        "unit": "kilometers",
        "within": true
    }
}

Sent from Firefox 🦊 https://mzl.la/43doGMX`;

    const parsed = parseJsonLenient(data);
    expect(() =>
        questionSchema.parse({ ...(parsed as object), key: Math.random() }),
    ).not.toThrow();
});

test("recovers the hiding zone JSON from behind the human-readable header produced by Copy Hiding Zone, even with a share footer appended", () => {
    const radiusQuestion: Question = {
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
    };

    const hidingZone = {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [] },
        questions: [radiusQuestion],
    };

    // What the "Copy Hiding Zone" button actually puts on the clipboard:
    // the human-readable header, then the raw JSON, then (if the user
    // shares it through an app that appends one) a footer.
    const clipboardText =
        describeQuestionsSummary([radiusQuestion]) +
        JSON.stringify(hidingZone) +
        "\n\nSent from Firefox 🦊 https://mzl.la/43doGMX";

    expect(clipboardText.startsWith("> (Radius)")).toBe(true);
    expect(parseJsonLenient(clipboardText)).toEqual(hidingZone);
});
