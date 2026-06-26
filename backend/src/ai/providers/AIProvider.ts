/**
 * AIProvider.ts
 *
 * Abstract interface for AI model providers.
 * The rest of the application calls this interface — never a specific provider.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface GenerateResult {
  content: string;
  model: string;
  provider: string;
  latencyMs: number;
  tokensUsed?: number;
}

export interface AIProvider {
  readonly name: string;

  /** Generate a chat completion */
  generateResponse(opts: GenerateOptions): Promise<GenerateResult>;

  /** Check if provider is available (has API key configured) */
  isAvailable(): boolean;
}

// ─── Provider Registry ────────────────────────────────────────────────────

const providers = new Map<string, AIProvider>();

export function registerAIProvider(provider: AIProvider): void {
  providers.set(provider.name, provider);
}

export function getAIProvider(name: string): AIProvider | undefined {
  return providers.get(name);
}

export function getAvailableProviders(): AIProvider[] {
  return Array.from(providers.values()).filter((p) => p.isAvailable());
}
