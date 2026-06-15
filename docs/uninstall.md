# Uninstall

English | [中文](./uninstall_zh-CN.md)

Use this when you want to remove the extension, native host, and Obsidian plugin from a local machine.

## Browser Extension

Remove `Obsidian Image Clipper Cookie Sync` from:

- Chrome: `chrome://extensions`
- Edge: `edge://extensions`

## Native Host

Remove the native messaging manifest for the browser you installed.

Chrome:

```text
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.obsidian_image_clipper.cookie_sync.json
```

Edge:

```text
~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.obsidian_image_clipper.cookie_sync.json
```

Then remove the local runtime directory if you no longer need it:

```text
~/.obsidian-image-clipper/native-host/
```

## Local Config And Auth Files

Remove the local config directory only if you no longer need any saved settings or synced auth data:

```text
~/.obsidian-image-clipper/
```

This directory may contain `auth.json`, which can include private Cookie headers.

## Obsidian Plugin

In Obsidian, disable the plugin first. Then remove:

```text
<your-vault>/.obsidian/plugins/obsidian-image-clipper/
```

Restart Obsidian or reload community plugins after removal.
