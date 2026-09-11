# xEdit Desktop · Mac 客户端

[xEdit](https://github.com/rotbit/xedit)（Markdown 公众号排版工具）的 Mac 桌面客户端。

Electron 壳直连线上站点 <https://xedit.me/>，GitHub 登录、云端同步、版本历史等能力与网页版完全一致；登录态持久化保存，重启应用不用重新登录。

## 功能

- 直连 xedit.me，功能与网页版实时同步（服务端更新无需发新版客户端）
- 登录态持久化（独立于系统浏览器的会话）
- Mac 原生菜单与快捷键：⌘N 新建文章、⇧⌘H 回到工作台、⌘+/- 缩放
- 站外链接自动跳转系统浏览器打开；GitHub OAuth 在窗口内完成
- 断网时显示重连页；窗口位置大小记忆；单实例运行

## 一键打包

```bash
./build.sh
```

自动完成：装依赖（首次）→ 补 Electron 二进制 → 设 npmmirror 镜像 → 打未签名 arm64 DMG，
产物在 `release/xEdit-<版本>-arm64.dmg`，完成后在 Finder 中定位。

## 开发

依赖 Node 20+。国内网络建议先设置镜像：

```bash
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"

npm install
npm start        # 开发运行
npm run dist     # 仅打包（不含 build.sh 的依赖自检）
```

首次 `npm install` 后如果 Electron 二进制没下载（allow-scripts 策略拦截），手动执行：

```bash
node node_modules/electron/install.js
```

## 配置

默认连接 `https://xedit.me/`。如需指向其他环境（如本地开发的 `http://localhost:3000`），在
`~/Library/Application Support/xEdit/config.json` 写入：

```json
{ "url": "http://localhost:3000" }
```

## 图标

启动页使用「展页」图标搭配 xEdit 字标，Dock 与应用图标使用独立书页图形。
浅色启动页使用靛蓝书页与墨色文字，深色启动页使用浅色 Logo；方形图标使用浅底靛蓝。

源文件在网页仓库的 `public/logo.svg` 与 `public/logo-mark.svg`。
更新源图后，在网页仓库执行以下命令即可同步 SVG、PNG 和完整尺寸的 ICNS：

```bash
cd ../xedit
node scripts/build-brand-assets.mjs ../xedit-desktop
```

生成 `build/icon.icns` 需要 macOS 自带的 `iconutil`。
`build/dock.png` 和 `splash-logo.svg` 已列入打包文件，`splash-logo.png` 保留同版栅格副本。
`build/logo-candidates/` 是历史设计草稿，不参与打包。
