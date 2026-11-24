---
name: pr-review-checklist
description: Run a structured pull request hygiene check covering diff scope, tests, security, and breaking changes. Use when reviewing a branch, diff, or pull request before merging.
---

# Pull Request Hygiene Checklist

This skill follows the open **Agent Skills** (`SKILL.md`) format and works identically in **Claude Code** and **GitHub Copilot**.

## When to Use

Apply this checklist whenever the user asks to review a branch, audit staged/unstaged changes, or check if a PR is ready to merge.

## Review Procedure

1. **Inspect the Diff**
   - Summarize the files changed and the primary intent of the PR in 2–3 bullet points.
   - Flag unrelated formatting churn, leftover debug logs, or accidentally committed secrets/env files.

2. **Correctness & Edge Cases**
   - Check error handling, null/undefined paths, boundary conditions, and concurrency/race risks.
   - Verify backwards compatibility for public APIs, CLI flags, config files, and database schemas.

3. **Tests & Verification**
   - Confirm new behavior and bug fixes have matching automated tests.
   - Note any missing negative/failure test cases.

4. **Security & Safety**
   - Check for injection risks (shell, SQL, template), unsafe deserialization, or overly broad permissions.
   - Ensure no tokens, private keys, or internal URLs are hardcoded.

5. **Output Format**
   Report findings grouped by severity:
   - **Blocker** — Must fix before merge (bugs, security issues, data loss risks).
   - **Suggestion** — Non-blocking improvements (clarity, maintainability, performance).
   - **Nit** — Minor polish or style notes.

   Always cite specific file paths and line numbers for every finding.
