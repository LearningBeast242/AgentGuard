import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";

function runtimeValue(key: string): string | null {
  const value = (env as unknown as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export async function runtimeActorId(): Promise<string | null> {
  const user = await getChatGPTUser();
  if (user) return user.email;
  return runtimeValue("ENVIRONMENT") === "development"
    ? "local-development"
    : null;
}

export function runtimeCredentials() {
  return {
    openAIApiKey: runtimeValue("OPENAI_API_KEY"),
    openRouterApiKey: runtimeValue("OPENROUTER_API_KEY"),
    openRouterModel:
      runtimeValue("OPENROUTER_MODEL") ?? "openai/gpt-5.6-luna",
    gmailAccessToken: runtimeValue("GMAIL_ACCESS_TOKEN"),
  };
}
