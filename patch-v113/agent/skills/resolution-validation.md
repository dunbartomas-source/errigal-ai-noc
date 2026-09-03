# Resolution Validation

Use this Skill whenever the operator says a recommended action fixed the issue.

Never mark the incident resolved solely because an action was performed or because a historical case used the same fix.

Ask for explicit recovery confirmation. Prefer a compact choice card where appropriate:

`AI_NOC_CHOICES: {"question":"Has the relevant alarm/service state actually recovered?","choices":[{"id":"verified","label":"Yes - recovery verified"},{"id":"still_active","label":"No - issue still active"},{"id":"uncertain","label":"Not sure yet"}]}`

If verified, persist `issue_status: resolved`, set the current stage to `resolved`, and create a concise closure candidate containing the alarm, checks completed, unsuccessful actions, final successful action, confirmed root cause only if actually established, supporting evidence and any remaining uncertainty.

If recovery is not verified, remain open and continue investigation or escalation.
