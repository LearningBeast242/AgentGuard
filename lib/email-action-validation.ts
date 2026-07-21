import type { EmailAction } from "./governance.ts";

const MAX_RECIPIENT_LENGTH = 320;
const MAX_SUBJECT_LENGTH = 998;
const MAX_BODY_LENGTH = 100_000;

export type EmailActionValidation =
  | { ok: true; action: EmailAction }
  | { ok: false; error: string };

function boundedString(
  value: unknown,
  field: string,
  maximum: number,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, error: `${field} is required.` };
  }
  if (value.length > maximum) {
    return { ok: false, error: `${field} exceeds the maximum length.` };
  }
  return { ok: true, value };
}

export function validateEmailAction(value: unknown): EmailActionValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "A structured email action is required." };
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.tool !== "gmail.send") {
    return { ok: false, error: "Only gmail.send is accepted by this endpoint." };
  }

  const to = boundedString(candidate.to, "Recipient", MAX_RECIPIENT_LENGTH);
  if (!to.ok) return to;
  const subject = boundedString(
    candidate.subject,
    "Subject",
    MAX_SUBJECT_LENGTH,
  );
  if (!subject.ok) return subject;
  const body = boundedString(candidate.body, "Body", MAX_BODY_LENGTH);
  if (!body.ok) return body;

  return {
    ok: true,
    action: {
      tool: "gmail.send",
      to: to.value,
      subject: subject.value,
      body: body.value,
    },
  };
}

