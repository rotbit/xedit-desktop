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

`build/icon.icns` 与 `build/dock.png` 由主仓库 `public/mascot/stage-6.png` 生成：

```bash
mkdir -p build/icon.iconset
for s in 16 32 128 256 512; do sips -z $s $s stage-6.png --out build/icon.iconset/icon_${s}x${s}.png; done
for s in 16 32 128 256; do d=$((s*2)); sips -z $d $d stage-6.png --out build/icon.iconset/icon_${s}x${s}@2x.png; done
iconutil -c icns build/icon.iconset -o build/icon.icns
```
