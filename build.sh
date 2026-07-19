#!/usr/bin/env bash
# xEdit Mac 客户端一键打包：./build.sh
# 产物：release/xEdit-<版本>-arm64.dmg（未签名）
set -euo pipefail
cd "$(dirname "$0")"

# 国内镜像（已设同名环境变量则优先用外部的）
export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
export ELECTRON_BUILDER_BINARIES_MIRROR="${ELECTRON_BUILDER_BINARIES_MIRROR:-https://npmmirror.com/mirrors/electron-builder-binaries/}"
# 未签名打包，跳过证书查找
export CSC_IDENTITY_AUTO_DISCOVERY=false

if [ ! -d node_modules ]; then
  echo "==> 首次运行，安装依赖"
  npm install
fi

# allow-scripts 策略可能拦掉 electron 的 postinstall，二进制缺失时手动补
if [ ! -x node_modules/electron/dist/Electron.app/Contents/MacOS/Electron ]; then
  echo "==> 下载 Electron 二进制"
  node node_modules/electron/install.js
fi

echo "==> 打包 DMG"
npx electron-builder --mac

DMG=$(ls -t release/*.dmg | head -1)
echo ""
echo "✅ 打包完成：$DMG ($(du -h "$DMG" | cut -f1))"
# 终端交互运行时在 Finder 里定位到产物
[ -t 1 ] && open -R "$DMG" || true
