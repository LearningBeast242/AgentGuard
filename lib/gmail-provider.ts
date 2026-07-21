import type {
  EmailDeliveryReceipt,
  EmailProvider,
} from "./gateway.ts";
import type { EmailAction } from "./governance.ts";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type GmailSendResponse = {
  id?: unknown;
  threadId?: unknown;
};

function assertSafeHeader(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} is required.`);
  }
  if (/[\r\n]/.test(normalized)) {
    throw new Error(`${field} contains prohibited newline characters.`);
  }
  return normalized;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${bytesToBase64(new TextEncoder().encode(value))}?=`;
}

export function encodeGmailMessage(action: EmailAction): string {
  const to = assertSafeHeader(action.to, "Recipient");
  const subject = assertSafeHeader(action.subject, "Subject");
  const mime = [
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    action.body,
  ].join("\r\n");

  return bytesToBase64(new TextEncoder().encode(mime))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export class GmailEmailProvider implements EmailProvider {
  private readonly accessToken: string;
  private readonly fetcher: FetchLike;
  private readonly now: () => Date;
  private readonly timeoutMs: number;

  constructor({
    accessToken,
    fetcher = fetch,
    now = () => new Date(),
    timeoutMs = 30_000,
  }: {
    accessToken: string;
    fetcher?: FetchLike;
    now?: () => Date;
    timeoutMs?: number;
  }) {
    if (!accessToken.trim()) {
      throw new Error("A Gmail access token is required.");
    }
    this.accessToken = accessToken;
    this.fetcher = fetcher;
    this.now = now;
    this.timeoutMs = timeoutMs;
  }

  async send(action: EmailAction): Promise<EmailDeliveryReceipt> {
    const response = await this.fetcher(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ raw: encodeGmailMessage(action) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      },
    );

    if (!response.ok) {
      throw new Error(`Gmail rejected the message with status ${response.status}.`);
    }

    const payload = (await response.json()) as GmailSendResponse;
    if (typeof payload.id !== "string" || payload.id.length === 0) {
      throw new Error("Gmail returned an invalid delivery receipt.");
    }

    return {
      provider: "gmail",
      messageId: payload.id,
      threadId:
        typeof payload.threadId === "string" ? payload.threadId : undefined,
      acceptedAt: this.now().toISOString(),
    };
  }
}
