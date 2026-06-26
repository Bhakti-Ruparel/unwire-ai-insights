/**
 * huggingFaceProvider.ts
 *
 * HuggingFace Inference API provider — fallback when OpenRouter is down.
 * Uses the free inference API with rate limits.
 */

import axios from "axios";
import {
  registerAIProvider,
  type AIProvider,
  type GenerateOptions,
  type GenerateResult,
} from "./AIProvider";

const HF_URL = "https://api-inference.huggingface.co/models";

// Map our model names to HuggingFace model IDs
const HF_MODEL_MAP: Record<string, string> = {
  "meta-llama/llama-3.3-70b-instruct:free": "meta-llama/Llama-3.3-70B-Instruct",
  "qwen/qwen3-coder:free": "Qwen/Qwen2.5-Coder-32B-Instruct",
  "deepseek/deepseek-r1:free": "deepseek-ai/DeepSeek-R1",
  // Fallback
  "default": "meta-llama/Llama-3.3-70B-Instruct",
};

const huggingFaceProvider: AIProvider = {
  name: "huggingface",

  isAvailable(): boolean {
    return !!process.env.HUGGINGFACE_API_KEY;
  },

  async generateResponse(opts: GenerateOptions): Promise<GenerateResult> {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) throw new Error("HUGGINGFACE_API_KEY not configured.");

    const hfModel = HF_MODEL_MAP[opts.model] ?? HF_MODEL_MAP["default"];
    const start = Date.now();

    // HuggingFace uses a different format — build a single prompt
    const prompt = opts.messages.map((m) => {
      if (m.role === "system") return `<|system|>\n${m.content}`;
      if (m.role === "user") return `<|user|>\n${m.content}`;
      return `<|assistant|>\n${m.content}`;
    }).join("\n") + "\n<|assistant|>\n";

    const response = await axios.post(`${HF_URL}/${hfModel}`, {
      inputs: prompt,
      parameters: {
        max_new_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.3,
        return_full_text: false,
      },
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 60_000,
    });

    const data = response.data;
    const content = Array.isArray(data)
      ? data[0]?.generated_text?.trim() ?? ""
      : data?.generated_text?.trim() ?? "";

    return {
      content,
      model: hfModel,
      provider: "huggingface",
      latencyMs: Date.now() - start,
    };
  },
};

registerAIProvider(huggingFaceProvider);
export default huggingFaceProvider;
