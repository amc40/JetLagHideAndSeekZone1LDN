import { expect, test } from "vitest";

import { extractJsonObject, parseJsonLenient } from "@/lib/utils";

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
