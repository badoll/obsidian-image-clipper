# 卸载

[English](./uninstall.md) | 中文

如果你想从本机移除浏览器扩展、Native Host 和 Obsidian 插件，可以按下面步骤操作。

## 浏览器扩展

在下面页面移除 `Obsidian Image Clipper Cookie Sync`：

- Chrome：`chrome://extensions`
- Edge：`edge://extensions`

## Native Host

删除当前浏览器对应的 Native Messaging manifest。

Chrome：

```text
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.obsidian_image_clipper.cookie_sync.json
```

Edge：

```text
~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.obsidian_image_clipper.cookie_sync.json
```

如果不再需要本地运行文件，也可以删除：

```text
~/.obsidian-image-clipper/native-host/
```

## 本地配置和 auth 文件

只有在你不再需要保存的配置和同步的 auth 数据时，才删除整个本地配置目录：

```text
~/.obsidian-image-clipper/
```

这个目录可能包含 `auth.json`，其中可能有私密 Cookie header。

## Obsidian 插件

先在 Obsidian 中禁用插件，然后删除：

```text
<your-vault>/.obsidian/plugins/obsidian-image-clipper/
```

删除后重启 Obsidian 或重新加载社区插件。
