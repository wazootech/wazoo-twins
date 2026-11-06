/**
 * Web search connector (plan §3.1).
 *
 * Endpoint choice (Nov 6, 2026): DuckDuckGo's public HTML endpoint
 * (`https://html.duckduckgo.com/html/?q=...`), parsed as HTML. Rationale:
 * no API key, no account, plain GET, returns title/url/snippet per result.
 * Caveats, recorded here rather than hidden: it is an unofficial HTML
 * endpoint, so it can change shape or rate-limit; the parser below is
 * defensive (a parse failure yields zero results, never invented ones).
 * If it proves unreliable, the swap is one function: keep the
 * `SearchResult` shape and replace `searchWeb`'s fetch + parse.
 *
 * Results are never invented: network failure, non-OK status, or an
 * unparseable page all return an empty array.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

type FetchFn = typeof fetch;

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a DuckDuckGo HTML results page into `{title, url, snippet}` rows.
 * Pure function — unit-testable without network.
 */
export function parseDuckDuckGoHtml(html: string): SearchResult[] {
  const linkRe =
    /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  const titles: { url: string; title: string }[] = [];
  const snippets: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const rawUrl = decodeEntities(m[1]);
    // DDG wraps outbound links as /l/?uddg=<url-encoded target>.
    const wrapped = /[?&]uddg=([^&]+)/.exec(rawUrl);
    const url = wrapped ? decodeURIComponent(wrapped[1]) : rawUrl;
    const title = stripTags(m[2]);
    if (url.startsWith("http") && title) titles.push({ url, title });
  }
  while ((m = snippetRe.exec(html)) !== null) snippets.push(stripTags(m[1]));
  return titles.map((t, i) => ({ ...t, snippet: snippets[i] ?? "" }));
}

/** Web search. Returns `[]` (never invented results) on any failure. */
export async function searchWeb(
  query: string,
  limit = 5,
  fetchFn: FetchFn = fetch,
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  let response: Response;
  try {
    response = await fetchFn(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
      { headers: { "User-Agent": "WazooTwins/0.1 (research agent)" } },
    );
  } catch {
    return [];
  }
  if (!response.ok) return [];
  const html = await response.text();
  return parseDuckDuckGoHtml(html).slice(0, limit);
}
