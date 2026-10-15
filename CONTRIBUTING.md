# Contributing to UIGraph

Thanks for helping improve UIGraph. This guide covers how to set up the project, what we care about when reviewing changes, and how to get a pull request merged.

## Before you start

- Search [existing issues](https://github.com/uigraph-oss/uigraph/issues) first. For anything larger than a small fix, open an issue to discuss the approach before writing code.
- UIGraph is a CLI (`src/`) plus a local viewer (`viewer/`). The CLI starts the viewer, reads and writes artifacts in the user's project, and runs Lens reviews.
- The CLI does not generate artifacts. The UIGraph skill does, and it lives in a separate repository, [uigraph-oss/skills](https://github.com/uigraph-oss/skills). Changes to generation, diagram or artifact conventions belong there, not here.

## What we value

These are the product guarantees users rely on. A change that weakens one needs a strong reason and a note in the PR description.

1. **UIGraph documents, it does not monitor or execute.** No live incident state, alerting, or actions taken on a user's services. Display and sync only.
2. **Ground truth over inference.** Services, APIs and dependencies come from files in the repository. Where an agent writes artifacts, they must be reviewable, plain files the user can commit and diff.
3. **A small footprint in the user's project.** Artifacts live only in `.uigraph.yaml` and `.uigraph/`.
4. **Local by default.** The viewer listens on `127.0.0.1` only. Do not add network listeners, telemetry, or outbound calls without discussion.
5. **Honest consent and cost.** Anything that sends project contents to a model provider, or spends the user's money, is stated before it happens.

## Development setup

Requirements: Node.js 20 or later and [pnpm](https://pnpm.io).

UIGraph currently links a sibling `uigraph-lens` package (`link:../uigraph-lens` in `package.json`), so that folder must sit next to this one and be built first:

```sh
cd uigraph-lens && pnpm install && pnpm build
cd ../uigraph && pnpm install && pnpm build
node dist/bin.mjs
```

To rebuild on every change, run `pnpm build:watch` in `uigraph` (and in `uigraph-lens` if you are changing it).

Useful scripts:

| Command | What it does |
| --- | --- |
| `pnpm build` | Builds the CLI (`tsdown`) and the viewer (`vite`) |
| `pnpm build:watch` | Rebuilds both on change |
| `pnpm typecheck` | Type-checks the CLI and the viewer |
| `pnpm lint` | Runs ESLint (`pnpm lint:fix` applies fixes) |

To try your changes on a real project, run `node /path/to/uigraph/dist/bin.mjs` from inside that project. Use `--port` if 7357 is taken and `--debug` for stack traces.

## Making a change

1. Fork the repository and branch from `main`.
2. Keep the change focused: one concern per pull request.
3. Run the checks before you push:

   ```sh
   pnpm typecheck && pnpm lint && pnpm build
   ```

4. Check the behavior you changed by running the built CLI, and say how in the PR. For viewer changes, include a screenshot or short recording.
5. Open a pull request against `main`.

CI runs type-checking, linting, the build and a smoke test of the built CLI on Node 20 and 22, and a dependency security scan.

### Code style

- TypeScript throughout, formatted with Prettier (`.prettierrc`) and linted with ESLint. Follow the surrounding code.
- Prefer small, explicit functions. Avoid new dependencies unless they clearly earn their place, and mention any you add in the PR.
- Treat file paths, subprocess arguments, URLs and agent output as untrusted input. Do not interpolate them into shell commands.

### Working on agent integrations

Lens supports several agents (Claude Code, Codex, OpenCode, Pi and Cursor). When you change how Lens runs them:

- Keep behavior consistent across agents, or document and gate the difference.
- Never log or persist credentials. Authentication stays with the agent's own login or the user's environment variables.

## Commit messages

Write a clear, imperative subject line (for example, "Fix port conflict message when the viewer is already running"). For non-trivial changes, use the body to explain why the change is needed, not only what changed.

## Pull requests

A good description covers:

- the problem and who it affects
- what you changed and why this approach
- how you verified it (commands run, what you checked by hand)
- any known limitations or follow-ups

Rebase on `main` before asking for review. Keep unrelated formatting changes out of the diff.

AI-assisted contributions are welcome. You are responsible for understanding, testing and standing behind what you submit.

## Reporting issues

**Bugs:** include the UIGraph version (`uigraph --version`), Node.js version, operating system, which agent you used, the command you ran, what you expected and what happened. Output with `--debug` helps. Remove any secrets or private code before pasting.

**Feature requests:** describe the problem first, then the behavior you would like. Check it against the guarantees above.

**Security issues:** do not open a public issue. Report them privately through the repository's Security tab.

## Review expectations

Reviewers look for correctness, a clear scope, safety of anything that touches the user's files or credentials, and updated documentation (README, `--help` text) when behavior changes.

## License

UIGraph is licensed under the [Apache License 2.0](LICENSE). By submitting a contribution, you agree that it is licensed under the same terms, as described in Section 5 of the license. There is no separate CLA.
