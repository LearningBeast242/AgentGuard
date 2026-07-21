declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ENVIRONMENT?: string;
    OPENAI_API_KEY?: string;
    OPENROUTER_API_KEY?: string;
    OPENROUTER_MODEL?: string;
    GMAIL_ACCESS_TOKEN?: string;
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
    CLERK_SECRET_KEY?: string;
  }
}
