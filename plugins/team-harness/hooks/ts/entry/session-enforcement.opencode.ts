// hooks/ts/entry/session-enforcement.opencode.ts
// opencode (Bun) plugin entry for session-config enforcement.
//
// On every session.created event, reads the opencode-owned .team-harness.json
// and injects the configured orchestrator-disposition / language / english-
// learning directive via client.session.prompt(noReply:true) — the opencode-
// native equivalent of Claude Code's SessionStart additionalContext.
//
// Directive text is shared with the CC session-start body via the exported
// composeSessionDirectives() function (single source of truth; no divergence).
//
// Fail mode: FAIL-SILENT on every error path (S-4 / plan §Risks).
//   - Absent/unreadable/malformed config → still injects orchestrator directive.
//   - Missing or invalid sessionID → no-op (SEC-001 defense-in-depth).
//   - client.session.prompt throws → error is swallowed; session is never blocked.
//   - Non-session.created events → no-op (AC-5 trigger discipline).
//
// Security (SEC-DR-A/B):
//   - Directive composed ONLY from fixed templates + LANG_RE-validated language
//     + exact-literal-true booleans. Reuses the existing loaders verbatim via
//     composeSessionDirectives(). No raw config byte flows into injected text.

import { composeSessionDirectives } from "../bodies/session-start.js";
import { readOpencodeConfig } from "../shim/opencode-config.js";

// ---------------------------------------------------------------------------
// Minimal client type — only the surface used here.
// The full opencode SDK client has more methods; we type only what we call
// so the plugin compiles without a full SDK dependency.
// ---------------------------------------------------------------------------

interface SessionPromptBody {
  noReply: true;
  parts: Array<{ type: "text"; text: string }>;
}

interface SessionClient {
  session: {
    prompt(args: {
      path: { id: string };
      body: SessionPromptBody;
    }): Promise<unknown>;
  };
}

// ---------------------------------------------------------------------------
// sessionEnforcementPlugin — factory that returns the event hook object.
//
// Exported as a named factory so the test suite can call it directly with a
// mock client (S-1 wired-injection test discipline: the test drives the plugin
// through the factory, not through a stub that bypasses the factory wiring).
// ---------------------------------------------------------------------------

export function sessionEnforcementPlugin(client: SessionClient): {
  hooks: {
    event: (args: { event: unknown }) => Promise<void>;
  };
} {
  return {
    hooks: {
      // event hook — fires for every opencode session/system event.
      // Trigger: event.type === "session.created" only (AC-5).
      event: async ({ event }: { event: unknown }): Promise<void> => {
        try {
          // AC-5: only act on session.created.
          if (
            !event ||
            typeof event !== "object" ||
            (event as Record<string, unknown>)["type"] !== "session.created"
          ) {
            return;
          }

          // Defensive multi-path sessionID extraction.
          // The ApiEvent envelope carries payload.sessionID (format ses_*).
          // Guard against shape variations across opencode versions.
          const payload = (event as Record<string, unknown>)["payload"];
          const id =
            typeof payload === "object" && payload !== null
              ? (payload as Record<string, unknown>)["sessionID"]
              : undefined;

          // SEC-001: session id must be a non-empty string before use.
          if (typeof id !== "string" || id.length === 0) {
            // No valid session id — cannot inject; silent no-op.
            return;
          }

          // Read the opencode-owned .team-harness.json.
          // Returns null when absent/unreadable/malformed — that is fine;
          // composeSessionDirectives(null) still returns the unconditional
          // orchestrator directive (AC-3: orchestrator always injected).
          const config = readOpencodeConfig();

          // Compose the directive array (shared with CC session-start).
          const directives = composeSessionDirectives(config);
          if (directives.length === 0) {
            return;
          }

          const text = directives.join("\n\n");

          // Inject directive once per session (noReply: true — context only,
          // no AI response triggered). Mirrors CC's once-per-session
          // SessionStart additionalContext model.
          await client.session.prompt({
            path: { id },
            body: {
              noReply: true,
              parts: [{ type: "text", text }],
            },
          });
        } catch {
          // S-4: ALL error paths are silent no-ops.
          // A thrown client.session.prompt (network/IPC error, bad session id,
          // etc.) must never propagate — the session must never be blocked.
          return;
        }
      },
    },
  };
}
