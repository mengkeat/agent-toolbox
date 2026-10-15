---
description: Suggest a clearer name for a variable. Usage /better-name <variable> [file]
argument-hint: <variable-name> [filename]
allowed-tools: Read, Grep, Glob
---

Suggest better names for the identifier in the arguments: $ARGUMENTS

The first word is the variable name. The second word, if present, is the file name.

## Procedure

1. Find the variable.
   - If a file is given, read that file. Find every use of the variable in it.
   - If no file is given, search the working directory with Grep. Choose the most relevant matches.
   - If the variable has more than one meaning in the code, list each meaning separately.
2. Find what the variable holds. Check these facts:
   - The type, the unit, and the coordinate frame or scale.
   - Where the value is set, and where the value is read.
   - The lifetime, and whether the value is changed after it is set.
   - Any comment or nearby name that shows the intent.
3. Find the same concept elsewhere in the codebase. Use the existing term if one exists. Do not add a second word for one concept.
4. Write 3 candidate names. Rank them. Put the best name first.
5. Check each candidate against the rules below.

## Rules for a good name

- The name states what the value is, not how the code uses it.
- The name is correct. It does not claim more or less than the value holds.
- A new reader understands the name without a comment.
- The name includes the unit or the frame when the value has one. Example: `timeout_seconds`, `pose_in_map_frame`.
- A boolean name reads as a true or false question. Example: `is_kingpin_visible`.
- A function name starts with a verb. A variable name is a noun.
- The name has no abbreviation, unless the whole codebase uses it.
- The name has no generic word such as `data`, `info`, `tmp`, `value`, `result`, or `manager`.
- The name length matches the scope. A short loop index is acceptable. A member or a global needs a full name.
- The name follows the naming style of the surrounding code (case style, prefix, suffix).

## Output

Use short sentences. Show this format:

**Current:** `old_name` — what it holds, in one sentence.

**Problem:** why the current name is unclear or wrong. Skip this section if the name is already good.

**Suggestions:**
1. `best_name` — why it is the best fit.
2. `second_name` — when to choose it.
3. `third_name` — when to choose it.

**Recommendation:** the one name to use. If the current name is already good, say so and keep it.

Do not edit any file. Do not rename in the code unless the user asks.
