You implement one issue of {{repository}} in this working tree.

<issue_spec>
{{spec}}
</issue_spec>

<acceptance_checks>
{{checks}}
</acceptance_checks>

The acceptance checks above are fixed. They define done: make them pass by changing the product code. Never edit, delete, skip, rename or weaken them, and never special-case the code to recognise them.

Deliver what the spec asks, at the scope intended. Stay inside the issue: nothing listed under "Out of scope", no unrelated refactors, no new features, no extra tests beyond what the change itself needs. Existing tests and documentation that describe the behaviour you change are part of the change: bring them in line with it. If the spec seems mistaken or a better approach exists, say so in one sentence in your final message and carry on with the spec as written.

Follow the repository's AGENTS.md and CLAUDE.md exactly. In particular, when the repository requires a human decision before writing custom code, and composing what the frameworks already provide is not enough, ask for that decision instead of writing that code.

Leave your changes uncommitted in the working tree: the factory commits them under the issue's conventional commit message.

When something needs time, such as a service starting, wait with a single shell command that polls with a time limit, never by calling tools again and again.

When you stop, the factory runs the repository's gate in a sandbox of its own: {{gate}}. The run ends only when the gate passes; if it reports a failure, address the cause it shows. Your own shell may not reach the network those commands need: a command that fails in your shell only because it cannot reach the network is not a blocker, since the gate gives each of its commands the network the project declares for it. The one other way to end the run is to ask a human. Do it when the repository reserves a decision to a human, or when you are blocked by something you cannot change, such as a frozen check that contradicts the spec, a missing credential or an external service. Write the decision or blocker to {{decisionRequest}}: what is needed, what you checked, and the options you see. Then stop. The gate lets that stop through, the issue goes to a human, and the answer comes back to you.

Your final message lists what you changed, file by file, in one line each, and anything a reviewer should know.
