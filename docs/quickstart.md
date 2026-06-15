# Quick Start

English | [中文](./quickstart_zh-CN.md)

This guide is the shortest path for testing the full local flow on macOS with Chrome or Edge.

## 1. Download The Release

Download `obsidian-image-clipper-<version>.zip` from the GitHub Release page and unzip it.

The unzipped directory should look like:

```text
obsidian-image-clipper-<version>/
  browser-extension/
  native-host/
  obsidian-image-clipper/
  INSTALL.md
  artifact-manifest.json
```

If you are building from source instead, run:

```bash
npm install
npm run build
npm run package:release
```

Then use `dist/release/obsidian-image-clipper-<version>/` as the release directory.

## 2. Load The Browser Extension

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable developer mode.
3. Load unpacked extension from `<release-directory>/browser-extension`.
4. Copy the loaded extension ID.

## 3. Install The Native Host

From the release directory:

```bash
node scripts/install-native-host-macos.mjs --browser=chrome --extension-id=<loaded-extension-id>
```

For Edge:

```bash
node scripts/install-native-host-macos.mjs --browser=edge --extension-id=<loaded-extension-id>
```

Fully quit and reopen the browser after installing or reinstalling the native host.

## 4. Add Protected Domains

1. Open a real protected `https://` page in the same browser profile.
2. Open the extension popup.
3. Add the current page hostname, or open Settings and add one or more exact domains.
4. Click `Save and grant access`.

Do not include protocols, paths, ports, or wildcards.

## 5. Refresh Cookies

1. Make sure you are logged in on each configured domain.
2. Open the extension popup.
3. Click `Refresh now`.
4. Confirm `~/.obsidian-image-clipper/auth.json` exists.

The file should contain one rule per successfully synced domain. Do not share this file.

## 6. Install The Obsidian Plugin

Copy the contents of:

```text
<release-directory>/obsidian-image-clipper/
```

into:

```text
<your-vault>/.obsidian/plugins/obsidian-image-clipper/
```

Then restart Obsidian or reload community plugins and enable `Obsidian Image Clipper`.

## 7. Diagnose A Protected Image

In Obsidian, select a protected image URL and run:

```text
Diagnose authenticated image URL
```

If diagnostics are healthy, run one of the localization commands for the current note.
