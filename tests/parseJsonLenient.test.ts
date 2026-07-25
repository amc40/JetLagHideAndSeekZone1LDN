import { expect, test } from "vitest";

import { extractJsonObject, parseJsonLenient } from "@/lib/utils";
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
