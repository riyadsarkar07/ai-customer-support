import { env, hasOpenAI } from "@/lib/env";
import { logger } from "@/lib/logger";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatResult = {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  model: string;
};

export class AiUnavailableError extends Error {
  constructor(message = "AI provider is not configured") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
  "gpt-4o": { input: 2.5 / 1_000_000, output: 10 / 1_000_000 },
  "gpt-4.1-mini": { input: 0.4 / 1_000_000, output: 1.6 / 1_000_000 },
};

function estimateCost(model: string, prompt: number, completion: number): number {
  const price = PRICING[model] ?? PRICING["gpt-4o-mini"];
  return prompt * price.input + completion * price.output;
}

async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function chatCompletion(params: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
}): Promise<ChatResult> {
  if (!hasOpenAI()) throw new AiUnavailableError();
  const model = params.model ?? env.OPENAI_CHAT_MODEL;

  const res = await withTimeout(
    (signal) =>
      fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: params.messages,
          temperature: params.temperature ?? 0.4,
          max_tokens: params.maxTokens ?? 700,
          ...(params.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
        signal,
      }),
    45_000,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.error({ status: res.status, body: text.slice(0, 500) }, "OpenAI chat failed");
    throw new AiUnavailableError(
      `AI provider error (${res.status}). Please check the server API key.`,
    );
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const completionTokens = data.usage?.completion_tokens ?? 0;

  return {
    content,
    promptTokens,
    completionTokens,
    totalTokens: data.usage?.total_tokens ?? promptTokens + completionTokens,
    costUsd: estimateCost(model, promptTokens, completionTokens),
    model,
  };
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!hasOpenAI()) throw new AiUnavailableError();
  const model = env.OPENAI_EMBEDDING_MODEL;

  const res = await withTimeout(
    (signal) =>
      fetch(`${env.OPENAI_BASE_URL}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model, input: texts }),
        signal,
      }),
    45_000,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.error({ status: res.status, body: text.slice(0, 500) }, "OpenAI embedding failed");
    throw new AiUnavailableError(`Embedding provider error (${res.status}).`);
  }

  const data = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return data.data.map((d) => d.embedding);
}

export function detectLanguage(text: string): "bn" | "en" | "unknown" {
  if (!text) return "unknown";
  const bangla = (text.match(/[\u0980-\u09FF]/g) ?? []).length;
  const latin = (text.match(/[a-zA-Z]/g) ?? []).length;
  if (bangla === 0 && latin === 0) return "unknown";
  return bangla >= latin ? "bn" : "en";
}

export function aiConfigured(): boolean {
  return hasOpenAI();
}
