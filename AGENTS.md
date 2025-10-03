# Repository Guidelines

## Project Structure & Module Organization
The Electron main process lives in `index.js`, which bootstraps the WebSocket server in `ws-server.js` and loads the Svelte renderer. Shared map utilities and serialization logic sit in `dataframe.js`. The Svelte UI resides under `renderer/`, with `App.svelte` driving interactions and Vite build output landing in `renderer/dist/`. Keep new modules co-located with their runtime (main process vs renderer) and mirror filenames for paired source and test files.

## Build, Test, and Development Commands
Run `npm install` before first use. `npm run dev` starts the Svelte dev server and Electron shell together; use `npm run dev:ui` or `npm run dev:electron` when debugging either side in isolation. `npm run build` produces the Vite bundle and packages the Electron app, while `npm run build:ui` only emits renderer assets to `renderer/dist/`.

## Coding Style & Naming Conventions
The project uses ES modules with two-space indentation and semicolons omitted. Prefer descriptive camelCase exports (e.g., `saveMapToFile`) and PascalCase for classes (`Quadtree`). In Svelte components, keep script logic minimal and place UI helper modules beside the component. Run Vite formatting (`npx prettier`) if you introduce Prettier; otherwise match existing spacing and quote style (double quotes in Svelte, single quotes elsewhere).

## Testing Guidelines
Unit tests live alongside their source (`dataframe-test.js` exercises `dataframe.js`) and rely on Node's built-in `assert`. Add new tests following the `<module>-test.js` pattern and wrap async checks in `async` functions. Execute `npm run test:dataframe` (or the matching script you add) before you push, and document any known gaps in the PR description.

## Commit & Pull Request Guidelines
Existing history favors short, present-tense commit subjects (e.g., "change package name"). Keep subjects under 60 characters and expand details in the body if needed. Every PR should include: a succinct summary of changes, linked issues or task references, test command output (`npm run test:dataframe`), and screenshots or screen recordings when altering the renderer UI. Request review when CI-equivalent checks pass and the branch is rebased onto the latest main.

## Runtime Notes
The WebSocket server binds to `ws://localhost:48829`; update both `ws-server.js` and `renderer/App.svelte` together if the port changes. Electron loads the Vite dev server in development, so confirm it is reachable at `http://127.0.0.1:5174` before launching `npm run dev`.
