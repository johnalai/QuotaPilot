# Claude Code Token Cheat Sheet

Mental model: **your whole transcript is re-sent every turn**, so cost scales with
_context size × number of turns_. Output tokens bill ~5× input; cache reads ~10% of input.
A small, stable context is the entire game.

---

## 1. The four things that burn tokens

| Source                                | Cost shape                                | Fix                                                   |
| ------------------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| Conversation history                  | Re-sent every turn (cached, but not free) | `/clear` between tasks, shorter sessions              |
| Tool + agent + skill definitions      | Injected into _every_ request             | Disable unused plugins/MCP; keep the roster small     |
| Tool output (reads, greps, test logs) | Once read, it lives in context forever    | Targeted reads, delegation, tail-only logs            |
| Thinking + your prompt                | Multiplied by every retry                 | Plan first; one precise prompt beats three vague ones |

## 2. Daily habits (highest leverage first)

1. **`/clear` when the task changes.** Cheapest big win there is. Don't carry a refactor into a debugging session.
2. **`/compact` with instructions** when you need continuity: `/compact keep the file list and open questions`.
3. **Run `/context`** to see what's eating the window — system prompt, tools/agents, memory files, or messages.
4. **Delegate noisy exploration.** "Find where X is handled" belongs in a subagent: it burns its _own_ context and returns one summary. Never let the main thread read 40 files to answer one question.
5. **Never paste volume.** No whole logs, no whole files. `grep`/`--tail` first, then read the 30 relevant lines.
6. **Redirect noisy commands to a file**, then read the excerpt. A 3,000-line test run in context costs more than the fix.
7. **Plan before editing.** One wrong turn costs a full re-send of everything; a plan costs a few hundred tokens.
8. **Correct with rewind, not prose.** Undoing a bad attempt keeps it out of context; explaining it keeps it forever.

## 3. Project setup (one-time, pays every session)

- **`CLAUDE.md` = 50–150 lines of invariants**, not a wiki. It loads into every session _and_ every subagent. Link to deep docs instead of inlining them.
- **Push long procedures into skills** — loaded on demand, not always.
- **Audit plugins and MCP servers monthly.** Agent, skill, and tool descriptions are injected into every request whether used or not.
- **Keep the prompt prefix stable.** Editing `CLAUDE.md`, enabling a plugin, or adding an MCP server mid-session invalidates the prompt cache — the next turn pays full price. Put volatile notes in the prompt, not in memory files.
- **Allowlist trusted commands.** Fewer round-trips, fewer approval turns.

## 4. Settings worth knowing

- `autoCompactWindow` — how full the window gets before auto-compaction fires. **Set it below the model's real context limit**, or it never fires and you hit a hard wall instead.
- Model routing: cheap/fast models for mechanical work (renames, scaffolding, formatting), frontier models for design and debugging.
- Cap thinking budget when the task is mechanical.
- `/cost` for actual spend per session — measure before optimizing.
- Prompt caching is worth 10 minutes of reading: https://code.claude.com/docs/en/prompt-caching

## 5. Anti-patterns

- "Read the entire repo and tell me about it."
- One session running all day across five unrelated tasks.
- Letting auto-compact fire silently — the summary loses detail, the model re-explores, you pay twice.
- Re-pasting context you cleared instead of putting it in `CLAUDE.md`.
- Long vague prompts. Precision is cheaper than iteration.

## 6. The 5-line version

> `/clear` often · `/context` when curious · subagents for searching · `CLAUDE.md` under 150 lines ·
> no logs in the main thread · a precise prompt beats retries.

---

# Your setup: measured leaks

Audited: `C:\Users\User\Projects\QuotaPilot` (`CLAUDE.md`, `.claude/settings.json`,
`.claude/settings.local.json`), `~/.claude/settings.json`, `~/.claude.json`,
`~/.claude/plugins/*`. **MCP is clean — zero MCP servers configured anywhere.** The leaks
are all in the plugin layer.

## Ranked findings

| #   | Leak                                                                                                                                   | Measured                                                                   | Fix                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | **60 subagent definitions** loaded from 3 VoltAgent packs (core-dev 13, **lang 30**, qa-sec 17)                                        | ~2–4k tokens (est.) in _every_ request                                     | Drop `voltagent-lang` entirely; trim the other two to the 4–6 agents this project actually uses |
| 2   | **`superpowers` installed twice** — identical v6.3.0, same git SHA, from two marketplaces                                              | Duplicate skill listings + 2× `SessionStart` hook                          | Remove `superpowers@superpowers-marketplace`; keep the official one                             |
| 3   | **~34 skill descriptions** always in context (14 superpowers ×2, 5 skill-creator, 1 remember)                                          | ~1.5–2.5k tokens (est.)                                                    | Dedupe (see #2); drop `skill-creator` when you're not writing skills                            |
| 4   | **`remember` plugin hooks every turn** — `UserPromptSubmit` + `PostToolUse` + `SessionStart`                                           | Per-prompt latency/tokens; `.remember/logs/memory-2026-09-15.log` is 13 KB | Keep if you value the memory, but it is not free; prune the log                                 |
| 5   | **`security-guidance` ships 22 hook files**                                                                                            | Per-event overhead; any context-injecting hook is per-tool-call            | Test with it off; re-enable only for auth/crypto work                                           |
| 6   | **`CLAUDE.md` is 6.1 KB (~1.6k tokens)** and re-states rules that already live in `architecture.md` (28 KB), `domain-model.md` (34 KB) | ~1.6k tokens per session _and per subagent_                                | Cut §3 rule rationales to one line + a doc pointer; target 60–80 lines                          |
| 7   | **`apps/web/CLAUDE.md` imports `AGENTS.md`** (687 B)                                                                                   | small, fine                                                                | No action                                                                                       |
| 8   | **`CLAUDE_CODE_AUTO_COMPACT_WINDOW=420000`** with an OpenRouter free model via `localhost:20128`                                       | Risk: if the model's real context < 420k, auto-compact **never fires**     | Set it under the model's true context limit                                                     |
| 9   | **Duplicate project key in `~/.claude.json`**: both `C:/Users/User/Projects/QuotaPilot` and `c:/Users/User/Projects/QuotaPilot`        | Split project state: separate history, approvals, allowlists               | Delete one entry, then always launch with the same path casing                                  |
| 10  | `C:/Users/User` registered as a project                                                                                                | sessions started from the home dir pollute state                           | Launch Claude Code from the project root                                                        |

## Actions taken

Pre-flight check: **nothing in the repo references any of these plugins.** A grep across all
`*.md`, plus `README.md`, `package.json`, and `.github/workflows/ci.yml`, found zero plugin,
skill, or subagent invocations — CI runs `pnpm lint/typecheck/test/build` only. Safe to disable.

1. **DONE — deduped `superpowers`.** `superpowers@superpowers-marketplace` → `false`
   (the `claude-plugins-official` copy stays enabled). Removes 14 duplicate skill listings
   and one duplicate `SessionStart` hook.
2. **DONE — disabled `voltagent-lang`** (30 agents). This project does not need an Angular,
   C++, C#, Django, Elixir, Flutter, or .NET Framework specialist.
3. **DONE — disabled `skill-creator`** (5 skills). Dev-time tool; re-enable to author skills.
   `voltagent-core-dev` (13) and `voltagent-qa-sec` (17) left enabled.
   `security-guidance` deliberately **kept** — this repo is auth + tenancy + RLS heavy, so its
   hooks earn their cost.
4. **DONE — slimmed `CLAUDE.md`**: 80 → 65 lines, 6.1 KB → 5.7 KB. Every invariant
   (tenancy, transaction-scoped RLS claims, money as integer minor units, AI-never-writes-
   financials, zod contracts, service-layer authz, the cross-tenant isolation release gate,
   the error contract) was preserved and verified by keyword check.
5. **TODO — fix `CLAUDE_CODE_AUTO_COMPACT_WINDOW=420000`** to match the gateway model's real
   context size. Highest remaining risk: if the real window is smaller, auto-compact never
   fires and you hit a hard wall mid-task.
6. **TODO — collapse the duplicate project key** in `~/.claude.json`
   (`C:/.../QuotaPilot` vs `c:/.../QuotaPilot`) and always launch from the project root.

**Remaining opportunity:** `voltagent-core-dev` + `voltagent-qa-sec` still load **30 agent
definitions** you will rarely use (mobile-developer, electron-pro, websocket-engineer,
penetration-tester, chaos-engineer, gdpr-ccpa-compliance, ui-ux-tester…). Copy the few you
actually delegate into `QuotaPilot\.claude\agents\`, then disable both packs: 30 → a handful.

## Not token-related, but noticed

`cookies.txt` and `JohnA - Shortcut.lnk` sit at the repo root. Confirm both are gitignored.

## How to re-measure

- `/context` — what's loaded right now (run it first thing after cleanup, and again on a long session).
- `/cost` — spend for the session.
- `/plugin` — see and toggle what's enabled.
- `~/.claude/plugins/installed_plugins.json` — the authoritative list of what is actually installed and at which scope.
