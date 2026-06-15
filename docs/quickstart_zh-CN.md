# 快速开始

[English](./quickstart.md) | 中文

这是一条在 macOS + Chrome 或 Edge 上跑通完整本地流程的最短路径。

## 1. 下载发布包

从 GitHub Release 页面下载 `obsidian-image-clipper-<version>.zip`，然后解压。

解压后的目录应类似：

```text
obsidian-image-clipper-<version>/
  browser-extension/
  native-host/
  obsidian-image-clipper/
  INSTALL.md
  artifact-manifest.json
```

如果你是从源码构建，执行：

```bash
npm install
npm run build
npm run package:release
```

然后把 `dist/release/obsidian-image-clipper-<version>/` 当作发布目录使用。

## 2. 加载浏览器扩展

1. 打开 `chrome://extensions` 或 `edge://extensions`。
2. 打开开发者模式。
3. 选择加载未打包扩展，目录为 `<release-directory>/browser-extension`。
4. 复制已加载扩展的 ID。

## 3. 安装 Native Host

在发布目录中执行：

```bash
node scripts/install-native-host-macos.mjs --browser=chrome --extension-id=<loaded-extension-id>
```

Edge 使用：

```bash
node scripts/install-native-host-macos.mjs --browser=edge --extension-id=<loaded-extension-id>
```

安装或重新安装 Native Host 后，完全退出并重新打开浏览器。

## 4. 添加受保护域名

1. 在同一个浏览器 profile 中打开真实的受保护 `https://` 页面。
2. 打开扩展弹窗。
3. 添加当前页面 hostname，或进入 Settings 添加一个或多个精确域名。
4. 点击 `Save and grant access`。

不要包含协议、路径、端口或 wildcard。

## 5. 刷新 Cookie

1. 确认每个已配置域名都已登录。
2. 打开扩展弹窗。
3. 点击 `Refresh now`。
4. 确认 `~/.obsidian-image-clipper/auth.json` 已生成。

该文件应为每个同步成功的域名包含一条 rule。不要分享这个文件。

## 6. 安装 Obsidian 插件

将下面目录中的内容：

```text
<release-directory>/obsidian-image-clipper/
```

复制到：

```text
<your-vault>/.obsidian/plugins/obsidian-image-clipper/
```

然后重启 Obsidian 或重新加载社区插件，并启用 `Obsidian Image Clipper`。

## 7. 诊断受保护图片

在 Obsidian 中选中一个受保护图片 URL，然后运行：

```text
Diagnose authenticated image URL
```

如果诊断正常，再执行当前笔记的图片本地化命令。
