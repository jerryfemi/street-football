# Clip Lab: Decisions Log

All architectural choices and minor design clarifications made during implementation are recorded here.

## 2026-11-04 - Initial Setup (M1)
- **Vanilla DOM UI**: Components are implemented as TypeScript classes with clean DOM nodes and scoped CSS classes.
- **IndexedDB**: Implemented zero-dependency IndexedDB wrapper (`src/io/db.ts`) with stores `files` (ArrayBuffer) and `project` (JSON).
- **Three.js**: Reused Three.js v0.186.x and ES modules.

