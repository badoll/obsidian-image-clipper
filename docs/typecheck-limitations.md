# Typecheck Notes

The root `npm run typecheck` command covers:

- `@obsidian-image-clipper/shared`
- `obsidian-image-clipper`
- `@obsidian-image-clipper/browser-extension`
- `@obsidian-image-clipper/native-host`

The inherited Obsidian plugin now includes local compatibility declarations for
Obsidian runtime APIs that exist in the desktop app but are not declared in the
pinned `obsidian` package:

- `vault.getConfig`
- `workspace.activeEditor`
- `fileManager.processFrontMatter`
- `vault.exists`
- `internalPlugins`
- adapter `basePath`

The plugin package uses `skipLibCheck` because its inherited CodeMirror and
Node type packages conflict with newer DOM declarations. Source files are still
checked with `noImplicitAny`.
