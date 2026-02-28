# MarkdownX

A **local-first**, **AI-ready** cross-platform note-taking application built with modern web technologies.

## Core Philosophy

MarkdownX is designed around three fundamental principles:

### 1. Self-Contained Resources
Every `.markdownx` document is an atomic, portable knowledge unit:
- Standard folder structure that works on any OS
- Assets (images, PDFs) stored with content-addressed hashing (SHA-256)
- `index.md` as the "golden copy" - readable by any text editor
- Zero vendor lock-in - your data is always accessible

### 2. Local-First Sync
Built on [Automerge](https://automerge.org/) CRDT for seamless multi-device synchronization:
- Works completely offline
- Automatic conflict resolution
- No server required - sync via any file transfer method (Dropbox, iCloud, USB)
- Full edit history preserved

### 3. AI-Ready Architecture
Designed for future AI integration while maintaining absolute privacy:
- All data stays local
- Clean data structure for AI consumption
- Reserved metadata fields for embeddings and tags
- Placeholder hooks for local LLM integration

## Document Format (.markdownx)

```
MyNote.markdownx/
├── index.md                # Golden Copy - Standard Markdown
│                           # - Readable/editable by any text editor
│                           # - Images: ![alt](assets/<hash>.<ext>)
│
├── assets/                 # Content-addressed asset storage
│   ├── a1b2c3...d4.png    # SHA-256 hashed filenames
│   └── e5f6g7...h8.pdf    # Automatic deduplication
│
└── .markdownx/            # System metadata
    ├── state.bin          # Automerge CRDT state
    ├── manifest.json      # Version control & features
    └── config.json        # Local preferences
```

## Architecture

### Monorepo Structure

```
markdownx/
├── packages/
│   ├── core/              # Shared business logic
│   │   ├── types.ts       # TypeScript definitions
│   │   ├── automerge.ts   # CRDT operations
│   │   ├── sync-engine.ts # Dual-write mechanism
│   │   ├── asset-manager.ts # Hash & store assets
│   │   └── fs-adapter.ts  # Cross-platform FS abstraction
│   │
│   └── editor-web/        # Shared editor (MDXEditor)
│       ├── Editor.tsx     # Main editor component
│       ├── bridge.ts      # Native communication protocol
│       └── ai-hooks.ts    # Future AI integration points
│
├── apps/
│   ├── desktop/           # Electron app
│   │   ├── main.ts        # Main process (Node.js FS)
│   │   ├── preload.ts     # Secure bridge
│   │   └── renderer/      # React UI
│   │
│   └── mobile/            # Expo (React Native) app
│       ├── app/           # Expo Router screens
│       └── native-modules/ # FS adapter for mobile
```

### Key Technologies

| Component | Technology | Purpose |
|-----------|------------|---------|
| Monorepo | Turborepo | Build orchestration |
| Core Logic | TypeScript + Automerge | CRDT operations |
| Desktop | Electron + React + Vite | Full Node.js access |
| Mobile | Expo + WebView | Shared editor via WebView |
| Editor | @mdxeditor/editor | Rich markdown editing |
| Styling | Tailwind CSS | Consistent UI |

## Dual-Write Mechanism

The heart of data integrity - every edit updates both formats atomically:

```
┌─────────────────────────────────────────────────────────────┐
│                      User Edits                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Automerge Document                          │
│              (In-memory CRDT state)                          │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
┌───────────────────────┐       ┌───────────────────────┐
│    state.bin          │       │    index.md           │
│  (Binary CRDT)        │       │  (Golden Copy)        │
│                       │       │                       │
│  • Full history       │       │  • Human readable     │
│  • Sync metadata      │       │  • Git-friendly       │
│  • Conflict data      │       │  • External editors   │
└───────────────────────┘       └───────────────────────┘
```

### Atomic Write Process

1. Update Automerge document in memory
2. Serialize to binary → `state.bin`
3. Export to markdown string
4. **Atomic write** to `index.md`:
   - Write to `index.md.tmp.<timestamp>`
   - `rename()` to `index.md` (atomic on POSIX/NTFS)
5. Update `manifest.json`

This ensures `index.md` is never corrupted, even if the app crashes mid-write.

## External Edit Handling

When `index.md` is modified by an external editor (VS Code, etc.):

```
┌─────────────────────┐
│  External Editor    │
│  modifies index.md  │
└─────────────────────┘
          │
          ▼
┌─────────────────────┐
│   File Watcher      │
│   (chokidar)        │
└─────────────────────┘
          │
          ▼
┌─────────────────────┐
│   Import into       │
│   Automerge         │
│                     │
│   • Create change   │
│   • Update state.bin│
│   • Notify UI       │
└─────────────────────┘
```

## WebView Bridge Protocol

Mobile apps communicate with the web editor via a structured message protocol:

```typescript
type BridgeMessage =
  | { type: 'LOAD'; basePath: string }
  | { type: 'LOADED'; content: string; manifest: Manifest }
  | { type: 'SAVE'; content: string }
  | { type: 'SAVED' }
  | { type: 'UPLOAD_IMAGE'; id: string; data: ArrayBuffer; fileName: string }
  | { type: 'UPLOAD_IMAGE_RESULT'; id: string; path: string }
  | { type: 'EXTERNAL_CHANGE'; content: string }
  | { type: 'ERROR'; message: string };
```

## Version Compatibility

The manifest system ensures forward/backward compatibility:

```json
{
  "formatVersion": 1,
  "minReaderVersion": 1,
  "features": [],
  "aiMetadata": {
    "embeddingModel": null,
    "lastIndexed": null,
    "tags": []
  }
}
```

| Scenario | Behavior |
|----------|----------|
| App version >= minReaderVersion | Full read/write |
| formatVersion > App understands | Read-only mode |
| minReaderVersion > App version | Blocked (upgrade required) |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/markdownx/markdownx.git
cd markdownx

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Development

```bash
# Run desktop app
pnpm desktop

# Run mobile app
pnpm mobile

# Run both in development
pnpm dev
```

### Building for Production

```bash
# Desktop (Electron)
cd apps/desktop
pnpm build
pnpm package  # Creates distributable

# Mobile (Expo)
cd apps/mobile
eas build --platform ios
eas build --platform android
```

## AI Roadmap

MarkdownX is "AI-ready" but intentionally ships without AI features in MVP:

### Phase 1: Foundation (Current)
- Clean, structured data format
- Reserved metadata fields
- Placeholder hooks in code

### Phase 2: Local AI Integration
- [ ] web-llm for browser-based inference
- [ ] System AI APIs (Apple Intelligence, Windows Copilot)
- [ ] Local ollama server support

### Planned AI Features
- **Smart Completion**: Context-aware text suggestions
- **Semantic Search**: Find related notes by meaning
- **Auto-tagging**: AI-generated document tags
- **Summarization**: Quick document summaries

All AI processing will be **local-first** - your data never leaves your device.

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) first.

### Development Guidelines

- TypeScript strict mode required
- All core logic in `packages/core`
- UI components shared via `packages/editor-web`
- Platform-specific code only in `apps/`

## License

MIT License - see [LICENSE](LICENSE)

---

Built with ❤️ for the local-first future.
