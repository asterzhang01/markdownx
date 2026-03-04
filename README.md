# MarkdownX

<p align="center">
  <strong>Future-Ready, Local-First Knowledge Management System</strong><br/>
  <em>面向未来的本地优先知识管理系统</em>
</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a> | English
</p>

---

### 🌟 Core Philosophy

MarkdownX is a next-generation note-taking application built on three foundational pillars:

#### 1. 🛡️ Self-Contained Resources

The `.mdx` format treats each note as an atomic knowledge unit — a self-contained folder that includes:

- **`index.md`** — The golden copy in standard Markdown, readable by any editor
- **`assets/`** — Resources stored by SHA-256 hash for deduplication and integrity
- **`.mdx/`** — Automerge binary state for full operation history

> **Vendor Independence**: Your data is yours forever. No cloud lock-in, no proprietary formats.

#### 2. 🔄 Local-First Sync with CRDT

Powered by [Automerge](https://automerge.org/), MarkdownX enables:

- **Serverless Collaboration** — Sync directly between devices without a central server
- **Offline-First** — Full functionality without internet connection
- **Automatic Conflict Resolution** — CRDTs guarantee convergence, no manual merging needed
- **Any Transport Channel** — Sync via iCloud、WiFi, file sharing, or any method you choose

#### 3. 🤖 AI-Native Architecture

Designed from the ground up for the AI era:

- **Structured Data Foundation** — Clean Markdown + organized assets provide high-quality context for LLMs
- **Privacy-First AI** — Local data enables on-device AI without sending your notes to the cloud
- **Future-Ready** — Manifest format reserves `ai_metadata` fields for vector indexing and semantic search

### 🚀 Getting Started

```bash
# Clone the repository
git clone https://github.com/yourusername/markdownx.git
cd markdownx

# Install dependencies
pnpm install

# Run desktop app
pnpm desktop

# Run mobile app
pnpm --filter @markdownx/mobile start
```

### 📁 Project Structure

```
markdownx/
├── apps/
│   ├── desktop/          # Electron + React + Vite
│   └── mobile/           # Expo + React Native
├── packages/
│   ├── core/             # Shared CRDT logic & .mdx format
│   └── editor-web/       # Web-based editor component
└── .qoder/rules/spec.md  # Full technical specification
```

### 🛠️ Tech Stack

| Module | Technology |
|--------|------------|
| Monorepo | Turborepo |
| CRDT Core | @automerge/automerge |
| Desktop | Electron + React + Vite |
| Mobile | Expo + React Native + WebView |
| Editor | @mdxeditor/editor |
| Styling | Tailwind CSS |

### 📄 License

MIT License — See [LICENSE](./LICENSE) for details.

---

<p align="center">
  <sub>Built with ❤️ for the future of personal knowledge management</sub>
</p>
