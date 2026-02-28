# MarkdownX Project Structure Analysis

## Overview

MarkdownX is a **local-first, cross-platform note-taking application** built with a monorepo architecture. It uses CRDT (Automerge) for conflict-free data synchronization and supports both desktop (Electron) and mobile (Expo/React Native) platforms.

---

## Project Architecture

```
markdownx/                          # Root
├── apps/                           # Application packages
│   ├── desktop/                    # Electron desktop app
│   └── mobile/                     # Expo React Native mobile app
├── packages/                       # Shared libraries
│   ├── core/                       # Core logic (CRDT, sync, assets)
│   └── editor-web/                 # Shared web editor component
├── .qoder/                         # AI agent configuration
├── package.json                    # Root package configuration
├── pnpm-workspace.yaml             # pnpm workspace definition
├── turbo.json                      # Turborepo task orchestration
└── tsconfig.base.json              # Shared TypeScript configuration
```

---

## Technology Stack

| Category | Technology | Purpose |
|----------|------------|---------|
| Monorepo | Turborepo + pnpm workspaces | Code sharing & build orchestration |
| Core Logic | TypeScript + Automerge | CRDT-based sync engine |
| Desktop | Electron + React + Vite | Full-featured desktop application |
| Mobile | Expo (React Native) + WebView | Cross-platform mobile app |
| Editor | @mdxeditor/editor | Rich Markdown editing experience |
| Styling | Tailwind CSS | Consistent UI across platforms |
| Build | tsup, vite, electron-vite | Module bundling |

---

## Workspace Packages

### 1. Root Configuration

**File:** `package.json`

```json
{
  "name": "markdownx",
  "version": "1.0.0",
  "packageManager": "pnpm@8.15.0",
  "workspaces": ["apps/*", "packages/*"]
}
```

**Key Scripts:**
- `pnpm dev` - Start development mode for all packages
- `pnpm build` - Build all packages
- `pnpm desktop` - Start desktop app only
- `pnpm desktop:build` - Build desktop app

---

### 2. Apps

#### 2.1 Desktop App (`apps/desktop/`)

**Package:** `@markdownx/desktop`

| File/Directory | Purpose |
|----------------|---------|
| `src/main.ts` | Electron main process - window management, IPC, file operations |
| `src/preload.ts` | Preload script for secure renderer-main communication |
| `src/renderer/` | React frontend (loads web editor) |
| `electron.vite.config.ts` | Vite configuration for Electron (main/preload/renderer) |
| `package.json` | Dependencies & electron-builder config |

**Key Dependencies:**
- `electron` ^33.0.0
- `electron-vite` ^2.3.0
- `chokidar` ^4.0.0 (file watching)
- `electron-store` ^10.0.0 (settings persistence)

**Build Outputs:**
- `dist/main/main.js` - Main process
- `dist/preload/preload.js` - Preload script
- `dist/renderer/` - Frontend assets
- `out/` - Packaged application (DMG, ZIP, etc.)

**Architecture:**
```
Main Process (Node.js)
├── Window Management
├── File System Operations (IPC handlers)
├── Document Lifecycle (SyncEngine)
└── File Watcher (chokidar)

Renderer Process (React)
└── Loads @markdownx/editor-web via WebView
```

---

#### 2.2 Mobile App (`apps/mobile/`)

**Package:** `@markdownx/mobile`

| File/Directory | Purpose |
|----------------|---------|
| `app/` | Expo Router app directory |
| `app/_layout.tsx` | Root layout component |
| `app/index.tsx` | Home screen (document list) |
| `app/editor/[id].tsx` | Editor screen (dynamic route) |
| `native-modules/FileSystemModule.ts` | Native file system bridge |
| `app.json` | Expo configuration |

**Key Dependencies:**
- `expo` ~52.0.0
- `expo-router` ~4.0.0 (file-based routing)
- `react-native-webview` 13.12.0 (embeds web editor)
- `expo-file-system` ~18.0.0

**Platform Support:**
- iOS (bundleId: `com.markdownx.app`)
- Android (package: `com.markdownx.app`)

---

### 3. Shared Packages

#### 3.1 Core Package (`packages/core/`)

**Package:** `@markdownx/core`

The heart of MarkdownX - provides document management, CRDT synchronization, and asset handling.

| Source File | Purpose | Key Exports |
|-------------|---------|-------------|
| `index.ts` | Public API entry | All public functions |
| `types.ts` | TypeScript definitions | `SyncEngine`, `FsAdapter`, `MarkdownXDocument` |
| `sync-engine.ts` | Document synchronization | `createSyncEngine()`, `SyncEngine` class |
| `automerge.ts` | CRDT operations | `createDocument()`, `applyChange()`, `mergeChanges()` |
| `asset-manager.ts` | Asset (image) management | `processImage()`, `getAssetPath()` |
| `fs-adapter.ts` | File system abstraction | `createNodeFsAdapter()`, `createExpoFsAdapter()` |
| `manifest.ts` | Document metadata | `createManifest()`, `validateManifest()` |

**Key Dependencies:**
- `@automerge/automerge` ^2.2.0 (CRDT implementation)

**Build:**
- Output: `dist/index.js` (CJS), `dist/index.mjs` (ESM)
- Types: `dist/index.d.ts`

---

#### 3.2 Web Editor (`packages/editor-web/`)

**Package:** `@markdownx/editor-web`

Shared rich text editor component used by both desktop and mobile apps.

| Source File | Purpose |
|-------------|---------|
| `main.tsx` | Vite dev entry point |
| `index.tsx` | Library export entry |
| `App.tsx` | Demo/standalone app wrapper |
| `Editor.tsx` | Core MDXEditor integration |
| `bridge.ts` | Communication bridge (desktop/mobile) |
| `ai-hooks.ts` | AI assistant integration hooks |
| `styles.css` | Editor-specific Tailwind styles |

**Key Dependencies:**
- `@mdxeditor/editor` ^3.20.0 (Markdown editor)
- `react` ^18.3.0

**Build:**
- Output: `dist/editor.es.js`
- Styles: `dist/editor-web.css`

---

## File Format (.markdownx)

MarkdownX uses a special folder structure for documents:

```
MyNote.markdownx/                   # Document bundle (folder)
├── index.md                        # Human-readable Markdown content
├── assets/                         # Embedded resources
│   ├── a1b2c3d4e5f6...png         # SHA256-hashed images
│   └── ...
└── .markdownx/                     # Internal metadata
    ├── state.bin                   # Automerge CRDT binary state
    ├── manifest.json               # Format version & features
    └── config.json                 # User preferences (optional)
```

**Key Mechanism - Dual-Write:**
- Every edit updates both `state.bin` (for sync) and `index.md` (for compatibility)
- `index.md` uses atomic writes (tmp + rename)
- Traditional editors can open `index.md` directly

---

## Build System

### Turborepo Pipeline (`turbo.json`)

```json
{
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ...] },
    "dev": { "cache": false, "persistent": true },
    "lint": { "dependsOn": ["^build"] },
    "type-check": { "dependsOn": ["^build"] }
  }
}
```

### Package Dependencies

```
@markdownx/desktop
├── @markdownx/core (workspace:*)
└── @markdownx/editor-web (workspace:*)

@markdownx/mobile
└── @markdownx/core (workspace:*)

@markdownx/editor-web
└── @markdownx/core (workspace:*)
```

---

## Development Workflow

### Quick Start

```bash
# Install dependencies
pnpm install

# Start desktop app
pnpm desktop

# Start mobile app
cd apps/mobile && pnpm start

# Build all packages
pnpm build
```

### Platform-Specific Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all dev servers |
| `pnpm desktop` | Desktop dev mode (HMR enabled) |
| `pnpm desktop:build` | Build desktop for distribution |
| `pnpm type-check` | TypeScript validation |
| `pnpm lint` | Lint all packages |
| `pnpm clean` | Remove all build artifacts |

---

## Key Design Decisions

1. **Local-First Architecture**: All data stored locally, no cloud dependency
2. **CRDT for Sync**: Automerge enables offline editing with automatic conflict resolution
3. **Shared Editor**: Web-based editor reused across desktop and mobile via WebView
4. **Dual-Write Consistency**: Maintains both binary state (sync) and Markdown (compatibility)
5. **Asset Hashing**: SHA256-based asset naming prevents conflicts and enables deduplication
6. **Monorepo Structure**: Turborepo enables code sharing while maintaining platform-specific apps

---

## Future Roadmap

- **AI Integration**: Local LLM support via web-llm
- **Semantic Search**: Vector indexing of document content
- **Collaborative Sync**: P2P document sharing
- **Plugin System**: Extensible editor capabilities
