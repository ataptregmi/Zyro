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
