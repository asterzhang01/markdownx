# MarkdownX

<p align="center">
  <strong>面向未来的本地优先知识管理系统</strong><br/>
  <em>Future-Ready, Local-First Knowledge Management System</em>
</p>

<p align="center">
  简体中文 | <a href="./README.md">English</a>
</p>

---

### 🌟 核心理念

MarkdownX 是一款基于三大支柱构建的下一代笔记应用：

#### 1. 🛡️ 资源自包含

`.mdx` 格式将每个笔记视为原子化的知识单元 —— 一个自包含的文件夹，包含：

- **`index.md`** —— 标准 Markdown 黄金副本，任何编辑器均可打开
- **`assets/`** —— 资源文件以 SHA-256 哈希命名，实现去重与完整性保障
- **`.mdx/`** —— Automerge 二进制状态，包含完整操作历史

> **厂商无关**：你的数据永远属于你。没有云锁定，没有专有格式。

#### 2. 🔄 基于 CRDT 的本地优先同步

基于 [Automerge](https://automerge.org/) 技术，MarkdownX 实现：

- **无服务端协作** —— 设备间直接同步，无需中央服务器
- **离线优先** —— 无网络连接时功能完整可用
- **自动冲突解决** —— CRDT 保证数据收敛，无需手动合并
- **任意传输通道** —— 支持 iCloud、WiFi、文件共享或任何你选择的传输方式

#### 3. 🤖 AI 原生架构

从底层设计即面向 AI 时代：

- **结构化数据基础** —— 清晰的 Markdown + 有序的资源为 LLM 提供高质量上下文
- **隐私优先 AI** —— 本地数据支持端侧 AI，无需将笔记发送到云端
- **面向未来** —— Manifest 格式预留 `ai_metadata` 字段，支持向量索引和语义搜索

### 🚀 快速开始

```bash
# 克隆仓库
git clone https://github.com/yourusername/markdownx.git
cd markdownx

# 安装依赖
pnpm install

# 运行桌面端
pnpm desktop

# 运行移动端
pnpm --filter @markdownx/mobile start
```

### 📁 项目结构

```
markdownx/
├── apps/
│   ├── desktop/          # Electron + React + Vite
│   └── mobile/           # Expo + React Native
├── packages/
│   ├── core/             # 共享 CRDT 逻辑与 .mdx 格式
│   └── editor-web/       # Web 编辑器组件
└── .qoder/rules/spec.md  # 完整技术规格书
```

### 🛠️ 技术栈

| 模块 | 技术 |
|------|------|
| Monorepo | Turborepo |
| CRDT 核心 | @automerge/automerge |
| 桌面端 | Electron + React + Vite |
| 移动端 | Expo + React Native + WebView |
| 编辑器 | @mdxeditor/editor |
| 样式 | Tailwind CSS |

### 📄 许可证

MIT 许可证 —— 详见 [LICENSE](./LICENSE)

---

<p align="center">
  <sub>Built with ❤️ for the future of personal knowledge management</sub>
</p>
