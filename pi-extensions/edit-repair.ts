/**
 * edit-repair.ts — makes the built-in `edit` tool's anchor failures actionable.
 *
 * Why: the built-in matcher finds `oldText` only as a contiguous substring
 * (exact, then NFKC-normalized with quotes/dashes mapped to ASCII). When an
 * agent edits from a stale read, the anchor block no longer exists contiguously
 * and the tool fails with a terse "Could not find the exact text ..." error
 * that gives no recovery information.
 *
 * This extension:
 *  1. Appends edit guidelines to the system prompt (prevent the failure).
 *  2. Intercepts `tool_call` for `edit` and, when an anchor is not found but a
 *     unique, highly-similar contiguous region exists (>=90% of the block's
 *     lines match in order), rewrites the anchor to the file's actual text so
 *     the built-in matcher succeeds (self-heal). Ambiguous or low-similarity
 *     cases are left for the built-in to report.
 *  3. Intercepts `tool_result` for failed `edit` calls and replaces the terse
 *     error with a diagnostic report: the closest region with line numbers,
 *     which anchor line(s) mismatch, and what to do next.
 *
 * No runtime imports from the pi package — only Node built-ins — so it is
 * version-robust and easy to test. It never auto-applies approximate edits;
 * it only corrects anchors to text that actually exists in the file.
 *
 * Install: put this file in ~/.pi/agent/extensions/ (global) or
 * .pi/extensions/ (project-local), then run /reload.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Characters the built-in matcher normalizes to ASCII (NFKC + this map). */
const DASH_QUOTE_MAP: Record<string, string> = {
  "\u201c": '"', // left double quote
  "\u201d": '"', // right double quote
  "\u2018": "'", // left single quote
  "\u2019": "'", // right single quote
  "\u2013": "-", // en dash
  "\u2014": "-", // em dash
  "\u2015": "-", // horizontal bar
  "\u2010": "-", // hyphen
  "\u2212": "-", // minus sign
};

/** Mirror of the built-in matcher's normalization (subset: enough to predict it). */
export function normalizeForEdit(text: string): string {
  return [...text.normalize("NFKC")]
    .map((char) => DASH_QUOTE_MAP[char] ?? char)
    .join("")
    .replace(/[ \t]+$/gm, "")
    .replace(/\r\n/g, "\n");
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function occurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) return count;
    count += 1;
    from = index + needle.length;
  }
}

interface ClosestWindow {
  lines: string[];
  score: number; // fraction of the block's lines matching in order
  startLine: number; // 1-based line number in the file
}

/**
 * Best contiguous window of `content` (same line count as `block`) by
 * line-match score. Returns null when the content has fewer lines than the
 * block or the block is empty.
 */
/** Drop trailing empty lines so a file's final newline never fakes a match. */
function stripTrailingEmpty(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1] === "") end -= 1;
  return lines.slice(0, end);
}

export function closestWindow(content: string, block: string): ClosestWindow | null {
  const contentLines = stripTrailingEmpty(content.split("\n"));
  const blockLines = stripTrailingEmpty(block.split("\n"));
  if (blockLines.length === 0 || contentLines.length < blockLines.length) return null;

  let best: ClosestWindow | null = null;
  for (let start = 0; start + blockLines.length <= contentLines.length; start++) {
    let matched = 0;
    for (let i = 0; i < blockLines.length; i++) {
      if (normalizeForEdit(contentLines[start + i]) === normalizeForEdit(blockLines[i])) {
        matched += 1;
      }
    }
    const score = matched / blockLines.length;
    if (!best || score > best.score) {
      best = {
        lines: contentLines.slice(start, start + blockLines.length),
        score,
        startLine: start + 1,
      };
    }
  }
  return best;
}

/** Line numbers (1-based) of the block's lines that differ from the window. */
function mismatchedLines(block: string, window: ClosestWindow): number[] {
  const blockLines = block.split("\n");
  const mismatched: number[] = [];
  for (let i = 0; i < blockLines.length; i++) {
    if (normalizeForEdit(window.lines[i]) !== normalizeForEdit(blockLines[i])) {
      mismatched.push(i + 1);
    }
  }
  return mismatched;
}

interface EditInput {
  path?: unknown;
  edits?: Array<{ oldText?: unknown; newText?: unknown }>;
  text?: unknown;
}

interface ToolEvent {
  toolName?: unknown;
  input?: EditInput;
  content?: Array<{ type?: unknown; text?: unknown }>;
  isError?: unknown;
}

const NOT_FOUND_PATTERN = /Could not find (the exact text|edits\[\d+\])|Found \d+ occurrences|overlap in/;

export default function (pi: {
  on: (event: string, handler: (event: ToolEvent, ctx: { cwd: string }) => unknown) => void;
}) {
  // 1. Prevent the failure: teach the model to edit from a fresh read.
  pi.on("before_agent_start", (event) => {
    const eventAny = event as unknown as { systemPrompt?: string };
    const systemPrompt = eventAny.systemPrompt ?? "";
    if (systemPrompt.includes("edit-repair")) return; // already appended
    return {
      systemPrompt:
        systemPrompt +
        "\n\nEdit tool guidelines (edit-repair extension):\n" +
        "- Re-read the target file immediately before editing; anchors built from an earlier read are stale and fail to match.\n" +
        "- An anchor must match a unique contiguous block in the current file. Prefer one short unique line with @INS.BEFORE/@INS.AFTER over large @REPLACE blocks; use one hunk per edit call.\n" +
        "- If an edit fails with 'Could not find the exact text', re-read the file and re-issue the edit with the current text; never blindly retry the same anchor.",
    };
  });

  // 2. Self-heal stale anchors when the match is unambiguous and very similar.
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "edit") return;
    const input = event.input;
    const path = typeof input?.path === "string" ? input.path : null;
    const edits = Array.isArray(input?.edits) ? input.edits : null;
    if (!path || !edits || edits.length === 0) return;

    let content: string;
    try {
      content = await readFile(resolve(ctx.cwd, path), "utf-8");
    } catch {
      return; // let the built-in report file errors
    }
    const normalizedContent = normalizeForEdit(content);

    for (const edit of edits) {
      const oldText = edit.oldText;
      if (typeof oldText !== "string" || oldText.length === 0) continue;
      const normalizedAnchor = normalizeForEdit(oldText);

      if (occurrences(normalizedContent, normalizedAnchor) !== 0) continue; // built-in handles it

      // Not found. Heal only when a unique window matches >=90% of the block's
      // lines in order — the typical "one line drifted / block got reformatted"
      // stale-anchor case. Single-line anchors never heal (score is 0 or 1).
      const window = closestWindow(content, oldText);
      if (!window || window.score < 0.9) continue;
      const corrected = window.lines.join("\n");
      if (occurrences(normalizedContent, normalizeForEdit(corrected)) !== 1) continue;
      edit.oldText = corrected; // align the anchor to the file's real text
    }
  });

  // 3. Turn the terse failure into an actionable diagnostic report.
  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "edit" || !event.isError) return;
    const contentText = (event.content ?? [])
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("\n");
    if (!NOT_FOUND_PATTERN.test(contentText)) return;

    const input = event.input;
    const path = typeof input?.path === "string" ? input.path : null;
    const edits = Array.isArray(input?.edits) ? input.edits : [];

    let content = "";
    if (path) {
      try {
        content = await readFile(resolve(ctx.cwd, path), "utf-8");
      } catch {
        // keep content empty
      }
    }

    const report: string[] = [
      "Edit anchor mismatch (edit-repair): the built-in matcher needs the anchor as a unique contiguous block of the current file.",
    ];
    if (edits.length === 0) {
      report.push("- Could not inspect per-edit anchors; re-read the file and re-issue the edit with a small unique anchor.");
    } else {
      edits.forEach((edit, index) => {
        const oldText = typeof edit?.oldText === "string" ? edit.oldText : "";
        report.push(`- edits[${index}] anchor (${oldText.split("\n").length} line(s)):`);
        if (oldText.length === 0) {
          report.push("  empty anchor");
          return;
        }
        const window = closestWindow(content, oldText);
        if (!window || window.score === 0) {
          report.push("  no similar region found in the file — the target text is likely absent; re-read the file.");
          return;
        }
        const endLine = window.startLine + window.lines.length - 1;
        const similarity = Math.round(window.score * 100);
        report.push(`  closest region: lines ${window.startLine}–${endLine} (${similarity}% of lines match):`);
        report.push("  ```");
        report.push(...window.lines.map((line) => `  ${line}`));
        report.push("  ```");
        if (window.score < 1) {
          const mismatched = mismatchedLines(oldText, window);
          report.push(`  anchor lines that differ: ${mismatched.join(", ")}`);
        }
      });
    }
    report.push("Fix: re-read the file and re-issue the edit with the exact current text, using a small unique anchor.");

    return { content: [{ type: "text", text: report.join("\n") }], isError: true };
  });
}
