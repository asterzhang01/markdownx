📘 MarkdownX 技术规格书 (Technical Specification v1.0)
## 1. 项目愿景与核心理念
MarkdownX 是一个面向未来的、本地优先的个人知识管理系统。
🛡️ 资源自包含 (Self-Contained)：每个 .markdownx 文件夹都是一个原子化的知识单元，资源哈希化存储，确保数据永久完整、可迁移、厂商无关。
🔄 本地优先同步 (Local-First Sync)：基于 CRDT (Automerge) 实现无服务端的多端自动同步，离线可用，冲突自动解决，支持任意文件传输通道。
🧠 AI 原生演进 (AI-Native)：架构设计为“AI 就绪”，未来可无缝集成本地大模型，在绝对隐私的前提下提供上下文感知的智能辅助。

## 2. 文件格式规范 (.markdownx)
.markdownx 是一个标准文件夹（macOS 可配置为 Bundle），结构如下：

MyNote.markdownx/
├── index.md                # [黄金副本] 标准 Markdown 文件。
│                           # - 任何编辑器均可打开渲染。
│                           # - 图片引用格式：![alt](assets/<sha256_hash>.<ext>)
│                           # - 始终保持与 state.bin 内容一致。
│
├── assets/                 # [资源池]
│   ├── a1b2c3...png        # 资源文件以 SHA-256 哈希命名，实现去重与防冲突。
│   └── d4e5f6...pdf
│
└── .markdownx/             # [系统目录]
    ├── state.bin           # [核心] Automerge 二进制状态。包含全文本、操作日志、冲突元数据。
    ├── manifest.json       # [版本控制] 定义 formatVersion, minReaderVersion, features。
    └── config.json         # [可选] 用户本地配置 (如视图模式、AI 设置)。


**关键机制**
双写一致性 (Dual-Write)：每次编辑操作同时更新 state.bin (用于同步) 和 index.md (用于兼容)。写入 index.md 必须采用原子操作 (tmp + rename)。
前向兼容：
传统软件：打开 index.md 即可阅读编辑，忽略 .markdownx 目录。
旧版 App：遇到新版 manifest 仅忽略未知特性，不崩溃。
新版 App：自动修复旧版格式，升级 manifest。

## 3. 技术架构
表格
模块	技术选型	说明
Monorepo	Turborepo	管理多端代码复用
核心逻辑	TypeScript + @automerge/automerge	纯 JS 实现 CRDT，预留 Rust FFI 接口
桌面端	Electron + React + Vite	完整功能，Node.js 文件系统访问
移动端	Expo (React Native) + WebView	统一编辑器内核，WebView 加载 Web 版编辑器
编辑器	@mdxeditor/editor	两端共用同一套 Web 代码，确保体验一致
样式	Tailwind CSS	桌面端直接引用，移动端通过 NativeWind/WebView 适配
解析器	remark + remark-gfm	处理 Markdown AST 及图片路径转换

## 4. AI 演进路线 (AI-Ready Architecture)
MVP 阶段：专注于构建结构化、本地化的数据底层。确保 index.md 清晰易读，assets 管理规范，为 AI 提供高质量的上下文数据源。
二期规划：
集成 web-llm 或系统原生 AI API。
利用本地数据优势，实现离线摘要、语义搜索、智能续写。
在 manifest.json 中预留 ai_metadata 字段，存储向量索引或标签。