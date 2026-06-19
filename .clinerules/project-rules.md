# Node.js Project Rules

## Repository Usage

* Do not analyze the entire repository unless explicitly requested.
* Read only files relevant to the current task.
* Prefer targeted searches over repository-wide scans.
* Minimize unnecessary file reads and repeated analysis.
* Reuse information already gathered during the current task.

## Development Standards

* Follow the existing project structure and coding style.
* Use async/await when possible.
* Reuse existing utilities, services, and patterns whenever possible.
* Do not modify unrelated files.
* Do not refactor unrelated code.
* Keep implementations simple and maintainable.
* Avoid introducing unnecessary abstractions.

## Planning

* Create a concise implementation plan before making changes.
* Do not repeatedly re-plan unless new information is discovered.
* Identify affected files before editing.

## Validation

After modifying code:

1. Run the appropriate validation commands available in the project.
2. If TypeScript is used, run `npx tsc --noEmit`.
3. If a build script exists, run `npm run build`.
4. If linting exists, run `npm run lint`.
5. If tests are relevant to the change, run `npm run test`.

## Error Resolution

* If validation fails, investigate and fix the errors.
* Re-run validation after each fix.
* Continue until validation passes or user input is required.
* Do not mark the task complete while validation errors remain.

## Completion

Before completing a task:

* Confirm the requested change was implemented.
* Confirm validation results.
* Summarize modified files.
* Summarize key changes made.
* Report any remaining risks, warnings, or limitations.
