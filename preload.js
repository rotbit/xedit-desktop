// 桌面端不设登录门槛：未登录且本地库为空时，在页面脚本运行前按网页端
// localDocs 的存储格式播种一篇欢迎文档，首页据此直接进入本地工作台而非登录页。
// 是否已登录由主进程读会话 cookie 判断（httpOnly，这里读不到）。
// 存储格式与欢迎文案须与 xedit 仓库 src/lib/localDocs.ts、src/store/useStore.ts 保持一致。
const { contextBridge, ipcRenderer } = require('electron')

// 告诉网页自己跑在桌面壳里：网页据此给红绿灯留位、把顶栏设为可拖拽区域
contextBridge.exposeInMainWorld('xeditDesktop', { platform: process.platform })
// documentElement 在 preload 执行时还不存在，必须等 DOM 就绪再打标记
window.addEventListener('DOMContentLoaded', () => {
  if (process.platform === 'darwin') document.documentElement.classList.add('desktop-mac')
})

const INDEX_KEY = 'xedit-local-docs'
const DOC_PREFIX = 'xedit-local-doc:'

const WELCOME_TITLE = '欢迎使用 xEdit'
const WELCOME_MARKDOWN = `# 欢迎使用 xEdit

一款 **Markdown 微信公众号排版工具**。左侧编辑，右侧实时预览，点击右上角「复制到公众号」即可粘贴进微信后台。

## 它能做什么

- 多套排版主题，代码高亮支持 Mac 风格窗口
- 外部链接自动转成文末[参考链接](https://github.com)
- 支持数学公式：$E = mc^2$
- 图片粘贴自动上传图床（需登录并配置阿里云 OSS）

> 登录 GitHub 账号后，文章自动保存到云端，多篇管理。

## 代码示例

\`\`\`javascript
function hello(name) {
  console.log(\`Hello, \${name}!\`);
}
hello("公众号");
\`\`\`

## 表格

| 功能 | 状态 |
| --- | --- |
| 公众号复制 | ✅ |
| 知乎复制 | ✅ |
| 云端同步 | ✅ |

$$
\\int_{-\\infty}^{+\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}
$$
`

// 摘要与字数口径与网页端 summarize 一致
function summarize(content) {
  const plain = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`~$|-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return { excerpt: plain.slice(0, 90), chars: content.replace(/\s/g, '').length }
}

function localDocCount() {
  try {
    const list = JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]')
    return Array.isArray(list) ? list.length : 0
  } catch {
    return 0
  }
}

async function seedWelcomeDoc() {
  const shouldSeed = await ipcRenderer.invoke('xedit:should-seed-welcome', location.origin)
  if (!shouldSeed || localDocCount() > 0) return
  const meta = {
    id: `local-${crypto.randomUUID()}`,
    title: WELCOME_TITLE,
    category: '未分类',
    updatedAt: new Date().toISOString(),
    ...summarize(WELCOME_MARKDOWN),
  }
  localStorage.setItem(DOC_PREFIX + meta.id, WELCOME_MARKDOWN)
  localStorage.setItem(INDEX_KEY, JSON.stringify([meta]))
}

// 本地启动页/错误页是 file 协议，不参与
if (location.protocol.startsWith('http')) {
  seedWelcomeDoc().catch(() => {})
}
