# Zyro Git Workflow (Safety Rules)

This project uses a simple, safe Git workflow to reduce mistakes and keep the remote correct.

## Always Before You Commit
- Confirm the remote is correct: `git remote -v` should show `https://github.com/ataptregmi/Zyro.git`.
- Check status is clean or only includes intended changes: `git status -sb`.
- Stage safely (avoid accidental deletions): prefer `git add -A` only when you intend to capture all changes; otherwise use `git add <file>`.

## Commit Format
- Use consistent messages: `Zyro: <short description of change>`

## Safety Rule
- Never modify Git config or remotes unless explicitly asked.

## Auto Commit + Push (Hooks)
- A `pre-commit` hook auto-stages changes before each commit (opt out: `NO_AUTO_STAGE=1`).
- A `post-commit` hook auto-pushes to GitHub after each commit (opt out: `NO_AUTO_PUSH=1`).
- These hooks only run when you execute `git commit`. They do not run on file save.
