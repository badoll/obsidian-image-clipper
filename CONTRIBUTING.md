# Contributing

Thanks for helping improve Obsidian Image Clipper. This project has three runtime pieces, so the best contributions keep browser permissions, local files, and Obsidian behavior aligned.

## Development Setup

```bash
npm install
npm test
npm run typecheck
npm run build
```

The repository uses npm workspaces:

- `apps/browser-extension`: Chrome/Edge Manifest V3 extension.
- `apps/native-host`: macOS Native Messaging host.
- `apps/obsidian-plugin`: Obsidian plugin.
- `packages/shared`: shared config, auth, domain, and response validation logic.

Build outputs are written to `dist/` and should not be committed.

## Pull Request Checklist

- Keep auth matching exact-host only; do not add wildcard auth rules.
- Do not log or expose cookie values, auth headers, or private auth file contents.
- Add or update focused tests for behavior changes.
- Run `npm test`, `npm run typecheck`, and `npm run build`.
- Update `README.md`, `README_zh-CN.md`, or user-facing docs when behavior or setup changes.

## Local Manual Checks

For browser/native-host changes, also test the release build manually:

```bash
npm run package:release
```

Then load `dist/release/obsidian-image-clipper-<version>/browser-extension` in Chrome or Edge and verify the browser, native host, and Obsidian plugin flow.

## Reporting Bugs

Please include:

- Operating system and browser.
- Extension version or commit.
- Whether the native host was installed for Chrome or Edge.
- Sanitized domain examples, such as `kb.example.com`.
- The visible error message.

Never paste real Cookie headers, auth file contents, or private internal URLs.
