// hooks/ts/bodies/policy-block.ts
// Minimal irreversible-boundary guard shared by Claude Code and OpenCode.
//
// This hook intentionally owns only two high-confidence failure classes:
//   1. recursive deletion of a catastrophic target; and
//   2. a credential with a provider-specific shape crossing through a write
//      tool or an obvious Bash carrier.
//
// Workflow policy belongs in agent contracts and outward-action routing, not
// in this gate. In particular, this body does not police git history edits,
// hook bypass flags, SQL text, configuration choices, filenames, or reads.
// Those broad heuristics produced false positives and runtime-dependent
// blocks without forming a dependable security boundary.

import type { NormalizedDecision, NormalizedInput } from "../shim/normalized-v1.js";

function deny(reason: string): NormalizedDecision {
  return {
    decision: "deny",
    reason: `Blocked by team-harness safety policy: ${reason}.`,
    mutations: null,
  };
}

function none(): NormalizedDecision {
  return { decision: "none", reason: "", mutations: null };
}

// Keep this list narrow: every match identifies a provider credential or a
// private-key header. Generic JWTs, Bearer strings and entropy-based guesses
// are deliberately excluded because fixtures and generated prose commonly
// share those shapes.
const HIGH_CONFIDENCE_SECRETS: ReadonlyArray<readonly [RegExp, string]> = [
  [/AKIA[0-9A-Z]{16}/, "AWS access key"],
  [/\bghp_[A-Za-z0-9]{36}\b/, "GitHub personal access token"],
  [/\bgithub_pat_[A-Za-z0-9_]{22,}\b/, "GitHub fine-grained personal access token"],
  [/-----BEGIN (?:RSA |EC |OPENSSL |DSA )?PRIVATE KEY-----/, "private key"],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}\b/, "Anthropic API key"],
  [/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/, "OpenAI-style secret key"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"],
  [/\b[rs]k_live_[0-9A-Za-z]{16,}\b/, "Stripe live secret key"],
  [/\bglpat-[0-9A-Za-z_-]{20}\b/, "GitLab personal access token"],
  [/\bgh[osru]_[A-Za-z0-9]{36}\b/, "GitHub OAuth/server/refresh/user token"],
  [/\bxoxb-[A-Za-z0-9-]{10,}\b/, "Slack bot token"],
  [/\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/, "SendGrid API key"],
  [/\bAC[0-9a-f]{32}\b/, "Twilio account SID"],
  [/\bSK[0-9a-f]{32}\b/, "Twilio API key SID"],
];

function scanForHighConfidenceSecret(content: string): NormalizedDecision | null {
  for (const [pattern, label] of HIGH_CONFIDENCE_SECRETS) {
    if (pattern.test(content)) {
      return deny(`${label} detected in tool input`);
    }
  }
  return null;
}

// These targets can erase a machine or the whole current tree. The patterns
// remain deliberately literal and bounded; this is not a general shell
// policy parser.
const CATASTROPHIC_DELETE_PATTERNS: ReadonlyArray<RegExp> = [
  /^\s*rm\s+\S*[rR]\S*[fF]\S*\s+(?:--\s+)?(?:\/|~|\$\{?HOME\}?)(?:\s|$)/i,
  /^\s*rm\s+\S*[fF]\S*[rR]\S*\s+(?:--\s+)?(?:\/|~|\$\{?HOME\}?)(?:\s|$)/i,
  /^\s*rm\s+-r\b.*\s+-f\b.*\s+(?:--\s+)?(?:\/|~|\$\{?HOME\}?)(?:\s|$)/i,
  /^\s*rm\s+\S*[rR]\S*[fF]\S*\s+(?:--\s+)?\*(?:\s|$)/i,
];

// Scan Bash only when the command visibly transports or persists inline
// content. A generic command-string scan would once again turn documentation
// and search queries into policy decisions.
function bashCarriesInlineContent(command: string): boolean {
  const curlData =
    /\bcurl\b.*(?:--data(?:-[a-z]+)?\b|\s-d\b|--json\b|\s-F\b|--form\b)/i.test(command);
  const curlAuth =
    /\bcurl\b.*(?:-H|--header)\s+['"]?Authorization:\s*Bearer\b/i.test(command);

  return (
    /\bgit\s+commit\b/i.test(command) ||
    curlData ||
    curlAuth ||
    /\bwget\b.*--post-(?:data|file)\b/i.test(command) ||
    /\btee\b/i.test(command) ||
    /\bexport\s+\w+\s*=/i.test(command) ||
    /\benv\s+\w+=/i.test(command)
  );
}

function writeContent(input: NormalizedInput): string {
  const toolName = input.tool?.name ?? "";
  const toolInput = input.tool?.input ?? {};
  const field =
    toolName === "Write" ? "content" : toolName === "Edit" ? "new_string" : "new_source";
  return typeof toolInput[field] === "string" ? (toolInput[field] as string) : "";
}

export function evaluate(input: NormalizedInput): NormalizedDecision {
  const toolName = input.tool?.name ?? "";
  const toolInput = input.tool?.input ?? {};

  if (toolName === "Bash") {
    const command =
      typeof toolInput["command"] === "string" ? (toolInput["command"] as string) : "";
    if (!command) return none();

    if (CATASTROPHIC_DELETE_PATTERNS.some((pattern) => pattern.test(command))) {
      return deny("recursive deletion targets '/', HOME, '~', or a bare wildcard");
    }

    if (bashCarriesInlineContent(command)) {
      return scanForHighConfidenceSecret(command) ?? none();
    }
    return none();
  }

  if (toolName === "Write" || toolName === "Edit" || toolName === "NotebookEdit") {
    const content = writeContent(input);
    return content ? scanForHighConfidenceSecret(content) ?? none() : none();
  }

  return none();
}
