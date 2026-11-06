/**
 * Model client (plan §2.1, decision 4).
 *
 * Pluggable provider; v1 default DeepSeek (already the wazoobench driver),
 * env-var switch to a frontier model. The model is used ONLY for draft
 * prose (inbox drafts, brief wording). Brief content itself is assembled
 * deterministically from World facts — never free-generated — so a missing
 * API key degrades gracefully to template rendering instead of failing.
 *
 * Environment:
 * - TWIN_MODEL_PROVIDER: "deepseek" (default) | "frontier"
 * - DEEPSEEK_API_KEY / FRONTIER_API_KEY: provider keys (never committed)
 * - TWIN_MODEL_NAME: optional model name override
 */

export interface ModelClient {
  /** Complete a short prose passage (draft reply, brief wording). Returns null when no model is configured. */
  complete(prompt: string): Promise<string | null>;
  readonly provider: string;
  readonly configured: boolean;
}

function env(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

/**
 * Template fallback: deterministic rendering used when no model is
 * configured. Keeps the Twin runnable and verifiable with zero API keys.
 */
export function templateComplete(prompt: string): string {
  return `[template] ${prompt}`;
}

class HttpModelClient implements ModelClient {
  readonly provider: string;
  readonly configured: boolean;
  private readonly apiKey: string | undefined;
  private readonly model: string | undefined;
  private readonly baseUrl: string;

  constructor(provider: string, baseUrl: string) {
    this.provider = provider;
    this.baseUrl = baseUrl;
    this.apiKey = provider === "deepseek"
      ? env("DEEPSEEK_API_KEY")
      : env("FRONTIER_API_KEY");
    this.model = env("TWIN_MODEL_NAME");
    this.configured = this.apiKey !== undefined && this.apiKey !== "";
  }

  async complete(prompt: string): Promise<string | null> {
    if (!this.configured || !this.apiKey) return null;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model ??
          (this.provider === "deepseek"
            ? "deepseek-chat"
            : "claude-sonnet-4-5"),
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json() as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? null;
  }
}

export function createModelClient(): ModelClient {
  const provider = env("TWIN_MODEL_PROVIDER") ?? "deepseek";
  if (provider === "frontier") {
    return new HttpModelClient("frontier", "https://api.anthropic.com/v1");
  }
  return new HttpModelClient("deepseek", "https://api.deepseek.com/v1");
}
