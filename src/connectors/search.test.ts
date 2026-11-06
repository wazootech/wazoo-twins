import { assert, assertEquals } from "@std/assert";
import { parseDuckDuckGoHtml, searchWeb } from "./search.ts";

const SAMPLE_HTML = `
<html><body>
<div class="result">
  <a class="result__a" href="https://example.com/ernest">Ernest McCarter — General Translation</a>
  <a class="result__snippet" href="#">VP of Engineering at General Translation, previously at Stripe.</a>
</div>
<div class="result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fgt&amp;rut=abc">General Translation — compilers</a>
  <a class="result__snippet" href="#">Translation infrastructure for the web.</a>
</div>
</body></html>`;

Deno.test("search: DuckDuckGo HTML parses titles, unwrapped URLs, and snippets", () => {
  const results = parseDuckDuckGoHtml(SAMPLE_HTML);
  assertEquals(results.length, 2);
  assertEquals(results[0].title, "Ernest McCarter — General Translation");
  assertEquals(results[0].url, "https://example.com/ernest");
  assert(results[0].snippet.includes("VP of Engineering"));
  assertEquals(results[1].url, "https://example.com/gt");
});

Deno.test("search: unparseable HTML yields zero results, never invented ones", () => {
  assertEquals(
    parseDuckDuckGoHtml("<html><body>no results here</body></html>"),
    [],
  );
  assertEquals(parseDuckDuckGoHtml(""), []);
});

Deno.test("search: searchWeb returns parsed results via injected fetch", async () => {
  const fetchFn = ((): Promise<Response> =>
    Promise.resolve(
      new Response(SAMPLE_HTML, { status: 200 }),
    )) as typeof fetch;
  const results = await searchWeb("Ernest McCarter", 5, fetchFn);
  assertEquals(results.length, 2);
  assertEquals(results[0].url, "https://example.com/ernest");
});

Deno.test("search: searchWeb returns [] on network failure or non-OK status", async () => {
  const failing =
    ((): Promise<Response> =>
      Promise.reject(new Error("network down"))) as typeof fetch;
  assertEquals(await searchWeb("x", 5, failing), []);
  const notOk = ((): Promise<Response> =>
    Promise.resolve(
      new Response("blocked", { status: 403 }),
    )) as typeof fetch;
  assertEquals(await searchWeb("x", 5, notOk), []);
  assertEquals(await searchWeb("   ", 5, failing), []);
});
