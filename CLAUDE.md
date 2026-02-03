# SimpleGIF

Local-first GIF toolkit. All processing runs in-browser via ffmpeg.wasm, gifenc, omggif, and Canvas API. No server uploads.

## Tech Stack

- **Framework:** SvelteKit 2 + Svelte 5 (runes: `$state`, `$derived`, `$effect`)
- **Styling:** Tailwind CSS 4 (dark zinc theme, green accents)
- **Build:** Vite 7, pnpm
- **Adapter:** `adapter-static` with SPA fallback (`fallback: 'index.html'`)
- **Icons:** unplugin-icons with `@iconify-json/dinkie-icons`
- **GIF decode:** omggif (frame extraction with disposal handling)
- **GIF encode:** gifenc (color quantization + palette encoding)
- **Video decode:** @ffmpeg/ffmpeg + @ffmpeg/util (lazy-loaded from CDN)
- **Vite headers:** COOP/COEP required for ffmpeg.wasm SharedArrayBuffer

## Commands

- `pnpm dev` — dev server
- `pnpm build` — production build
- `pnpm check` — svelte-check (type checking)
- `pnpm lint` — prettier + eslint
- `pnpm format` — auto-format

## File Structure

```
src/
  lib/
    stores/
      project.svelte.ts       — Singleton project state (file, frames, dimensions)
      processing.svelte.ts    — Progress tracking (isProcessing, progress%, statusText)
      ffmpeg.svelte.ts         — Lazy-loaded ffmpeg.wasm instance
      filmstrip.svelte.ts     — Trim mode state (trimMode, trimStart, trimEnd)
    processing/
      decoder.ts               — GIF decoding via omggif, file type detection
      encoder.ts               — GIF encoding via gifenc
      ffmpeg-bridge.ts         — Video-to-frames and image-sequence-to-frames
      transforms/              — Pure functions: FrameData[] → FrameData[]
        crop.ts, resize.ts, rotate.ts, reverse.ts,
        framerate.ts, skip-frames.ts, trim.ts, optimize.ts
    components/
      Sidebar.svelte           — Nav links grouped by category, file info
      Editor.svelte            — Orchestrates DropZone vs Preview+Controls
      DropZone.svelte          — Drag-drop + click upload, auto-detects file type
      PreviewCanvas.svelte     — Canvas animation loop (requestAnimationFrame)
      PlaybackControls.svelte  — iOS-style filmstrip scrubber with thumbnails, playhead, and trim handles
      DownloadButton.svelte    — Encode + download GIF
      ProcessingOverlay.svelte — Modal progress bar
      ToolPanel.svelte         — Consistent wrapper for tool controls
      NavItem.svelte           — Sidebar nav button with active state
      controls/
        SliderInput.svelte, NumberInput.svelte, CropOverlay.svelte
    types/
      index.ts                 — FrameData, ProjectFile, CropRect, tool option types
      gifenc.d.ts, omggif.d.ts — Library type declarations
    utils/
      file.ts, canvas.ts, download.ts
  routes/
    +layout.svelte             — Root: CSS import, favicon
    (tools)/
      +layout.svelte           — App shell: Sidebar + Editor + ProcessingOverlay
      +layout.ts               — ssr=false, prerender=false
      +page.svelte             — Landing page (/)
      convert/                 — Video to GIF (ffmpeg)
      sequence/                — Image sequence to GIF
      crop/, resize/, trim/    — Geometry tools
      rotate/, reverse/        — Orientation tools
      framerate/, skip-frames/ — Timing tools
      optimize/                — Export optimization (color reduction)
```

## Architecture

### State Management
Module-level `$state` singletons in `.svelte.ts` files. Components import stores directly. Reactivity propagates automatically. State persists across client-side route navigation.

### Processing Pipeline
```
Input File → Decode (omggif/ffmpeg) → FrameData[] → Transform → Encode (gifenc) → Blob → Download
```
All transforms are pure functions: `(frames, options, onProgress?) → newFrames`. Use OffscreenCanvas for pixel manipulation.

### Tool Pattern
Each tool route renders a `<ToolPanel>` with controls. Apply button calls the transform, then `project.updateFrames()`. The Editor/PreviewCanvas re-renders automatically via reactivity.

### Layout
```
Sidebar (w-80) | Editor area (flex-1)
               |   PreviewCanvas (flex-1, centered)
               |   PlaybackControls (bottom bar)
               |   {tool page content} (below controls)
               |   DownloadButton (footer)
```

## Key Types

```typescript
interface FrameData { imageData: ImageData; delay: number }
interface ProjectFile { name: string; type: string; size: number; blob: Blob }
```

## Notes

- `animationId` and `lastFrameTime` in PreviewCanvas are plain variables (not `$state`) to avoid re-triggering the `$effect` that manages the animation loop.
- PlaybackControls renders frame thumbnails onto a canvas via OffscreenCanvas, sampled evenly across the frame count. Thumbnails regenerate only when the frames array reference changes (not on every playhead move).
- The Trim tool (`/trim`) activates `filmstrip.trimMode` on mount and deactivates on unmount. Gold iOS-style handles on the filmstrip let users drag to select the trim range. The ToolPanel just shows frame numbers and the Apply button.
- ffmpeg.wasm loads from `unpkg.com/@ffmpeg/core@0.12.6` CDN. Only loaded when user visits `/convert` or `/sequence`.
- `optimizeDeps.exclude` in vite.config.ts prevents Vite from pre-bundling ffmpeg (breaks worker loading).
