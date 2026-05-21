---
name: create-issue
description: Explore relevant code then create a meaningful GitHub Issue with root cause analysis and a recommended fix.
---

Create a GitHub Issue for the task description provided as the skill argument. Do not ask for confirmation at any step — explore, analyse, and file the issue autonomously.

---

## Step 1 — Understand the task description

Read the skill argument carefully. Extract:

- **What is broken or missing** (the symptom the user described).
- **Which area of the codebase** is likely involved — auth, data model, UI, routing, deployment, etc.
- **What kind of issue** it is: bug, feature request, infrastructure/config, docs, performance.

Use this to drive targeted exploration in Step 2.

---

## Step 2 — Explore relevant code

Do **not** read every file. Focus only on the files most likely to be relevant. Use the Key Files table in `CLAUDE.md` as your map.

Useful commands:

```bash
# Find files related to a keyword
rtk grep -rn "keyword" src/ --include="*.ts" --include="*.tsx"

# Inspect recent changes in the area
rtk git log --oneline -10 -- src/path/to/area/

# Check what env vars are documented
rtk read .env.local.example
```

Collect from your exploration:
- **Specific file paths and line numbers** that are relevant.
- **What the code currently does** (briefly — enough to explain the gap).
- **Any configuration, environment variable, or external dependency** involved.
- **Related commits** that might explain why it works the way it does.

---

## Step 3 — Analyse and draft the issue

Synthesise your findings into a structured draft. The issue must be concrete and actionable — not vague. Use the evidence you gathered in Step 2.

**Required sections:**

### Problem
One paragraph. What the user observes. Include reproduction steps if they can be inferred from the description.

### Root Cause
Explain the technical reason this happens. Reference specific files, line numbers, env vars, or external services. If there are multiple contributing factors, list them.

### Affected Files
A short list of the files and line ranges directly involved.

### Recommended Fix
Pick the best option and say why. Be direct. Include the specific change required (code, config, external service, docs) and any notable trade-offs.

Only add a second option if another approach is genuinely equally valid — different trade-offs, not just a worse alternative. If there is a clear best fix, state only that one.

---

## Step 4 — File the issue

Run:

```bash
rtk gh issue create \
  --title "<concise title, ≤ 72 chars>" \
  --body "$(cat <<'EOF'
<formatted body from Step 3>
EOF
)"
```

Output the issue URL to the user when done.

---

## Rules

- Ground every claim in evidence from Step 2. Do not speculate without saying so.
- File paths in the issue body must be real paths you confirmed exist.
- If the issue is purely a missing feature with no buggy code to point to, say so in Root Cause rather than inventing one.
- The title must read as a specific problem statement, not a vague label. Bad: "Auth bug". Good: "Google OAuth fails on Vercel preview deployments due to unregistered redirect URIs".
- Do not add labels, assignees, or milestones unless the user specified them.
