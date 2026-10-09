# OPOS Shell — Open Platform OS

A universal **convergence shell** built with Electron, React, Tailwind CSS and Zustand. One codebase adapts its UI, input model and window management to three environments — **TV**, **Mobile** and **Desktop** — and switches between them live, based on the input device you use.

```
npm install
npm run dev        # Vite + Electron with hot reload
npm run dev:web    # shell only, in a browser (webviews fall back to <iframe>)
npm run build      # typecheck + production renderer build (dist/)
npm start          # run Electron against dist/
npm run dist       # package with electron-builder
```

## Architecture

```
electron/
  main.cjs            Main process: Widevine bootstrap, frameless device window, webview hardening,
                      permissions, IPC (window state, mode sync, media keys, DRM status, telemetry)
  preload.cjs         Shell preload → typed `window.opos` bridge (contextIsolation, sandboxed)
  webview-shim.cjs    Compatibility shim force-injected into every <webview>
src/
  store/useOS.ts      Convergence State Engine (Zustand): mode heuristics, process table,
                      window manager, persisted settings, toasts, overlays
  engine/
    useConvergence.ts Input wiring: mouse / touch / keys / gamepad / resize / IPC / idle screensaver
    spatialNav.ts     Strict 2D spatial navigation for TV mode
  components/
    ProcessLayer.tsx  Renders every app once; swaps only the frame per mode (window / fullscreen)
    WebviewContainer  The Universal App Container (<webview>, iframe fallback in browsers)
  shells/             desktop/ (taskbar, start menu, tray, desktop), mobile/, tv/
  apps/
    manifest.ts       App Registry — metadata for all 28 apps
    components.ts     Lazy, code-split component table
    native/           The native apps
  lib/                audio engine, virtual file system, weather, back stack, media router, …
```

### Phase 1 — Core architecture & IPC

- **Widevine**: `main.cjs` detects the castLabs **Electron for Content Security** build (`components.whenReady()`); otherwise it looks for a local CDM (`OPOS_WIDEVINE_PATH` / `OPOS_WIDEVINE_VERSION`, or an installed Chrome's `WidevineCdm`) and registers it via `widevine-cdm-path`. The `mediaKeySystem` permission is granted. Status shows in Settings → DRM & Media and in the webview toolbar.
  > Stock Electron ships **without** Widevine. For real DRM playback replace the `electron` dependency with a castLabs ECS release (`"electron": "github:castlabs/electron-releases#<version>+wvcus"`, picking the tag that matches the Electron major you use) and sign it with castLabs EVS for production.
- **IPC**: `window:minimize|maximize|close|fullscreen|get-state`, `window:state` (push), `mode:changed` (renderer → main, updates the window title), `mode:request` (menu accelerators **Ctrl/Cmd+Shift+0/1/2/3** → Auto/Desktop/Mobile/TV), `opos:media` (global media keys), `drm:status`, `system:stats`.
- **Universal App Container**: third-party apps run in `<webview plugins partition="persist:opos-apps">`. `will-attach-webview` forces the shim preload, `plugins`, and context isolation on *every* guest regardless of what the renderer requested. Popups open in the same guest.
- **Compatibility shim** (`webview-shim.cjs`):
  - WebOS / Tizen remote keycodes (461, 10009, 415, 19, 412, 417, 10252, 427/428, colour keys…) → standard DOM keys, and standard keys → the remote keycode the app's profile expects (dispatched in the page's main world so `keyCode` is visible to page scripts).
  - Minimal `window.webOS` and `window.tizen` (`tvinputdevice.registerKey`, `platformBack`, …) so TV web apps boot.
  - Touch: flicks → arrow keys for TV-profiled apps, long-press → `contextmenu`, bottom-edge swipe-up → home.
  - Reports mouse/touch/key activity to the host so mode detection works while a guest has focus; forwards unhandled Back; executes host media commands; fallback spatial navigation in TV mode.

### Phase 2 — Convergence State Engine

`useOS` (Zustand) owns `mode`, with the heuristics in `reportInput` / `reportResize`:

| Mode | Trigger |
|---|---|
| Desktop | real mouse movement (≥36 px within 450 ms — jitter-proof), or a resize to width > 1024 px |
| Mobile | any touch / pen pointer, or a resize to a narrow portrait viewport |
| TV | N consecutive Arrow / Enter presses (default **3**, configurable); the cursor is hidden |

Typing in text fields never counts toward TV. TV ignores resizes (fullscreen transitions). A **mode lock** (Settings → Convergence, quick settings, tray, `mode` command, or accelerators) disables heuristics. Running apps survive every switch — `ProcessLayer` keeps each app at a stable tree position and only changes its frame.

### Phase 3 — Environments

- **TV**: cinematic hero driven by the focused tile, horizontal carousels, giant type, remote hint bar. `spatialNav.ts` scores candidates geometrically (edge distance + orthogonal penalty), traps focus in the top-most `[data-nav-scope]`, remembers the last item per row (`data-nav-group`), swallows Tab, and gives focus a heavy glow and a 1.1× scale. ESC / Backspace / BrowserBack / 461 / 10009 = Back; media keys are routed globally. Gamepads are mapped to D-pad / A / B.
- **Mobile**: portrait-locked (landscape screens get a centered device frame), status bar (time, real battery, Wi-Fi), paginated swipeable launcher with widgets and a dock, sticky Back / Home / Recents bar, swipe-to-close recents, pull-down control center, apps fullscreen below the status bar with a “Swipe up to go home” gesture zone.
- **Desktop**: taskbar with Start menu (search, pinned, all apps, recommended files, power menu), pinned + running apps, system tray (quick settings, notification center, calendar, frameless-host window controls), desktop icons, context menus everywhere. Windows drag, resize on 8 edges, snap (top = maximize, sides = halves), and z-order correctly.

### Phase 4 — The 28 apps

| # | App | Kind | Notes |
|---|---|---|---|
| 1 | OPOS Settings | native | TV: oversized vertical list · Mobile: iOS grouped lists · Desktop: two-pane |
| 2 | OPOS Cinema | webview | bitmovin.com/demos/drm, WebOS remote profile, Widevine badge |
| 3 | OPTube | webview | youtube.com/tv with a Tizen TV user agent |
| 4 | OPStream | webview | twitch.tv |
| 5 | OPOS Music | native | Generative Web Audio engine, visualizer, MediaSession, media keys |
| 6 | Local Plex | native | Library grid, detail sheet, remote-friendly video player |
| 7 | Cloud Gamer | native + webview | Xbox Cloud / GeForce NOW / Luna / Boosteroid, controller + latency HUD |
| 8 | Live IPTV | native | Live preview, EPG grid with now-line, CH+/−, number entry |
| 9 | Weather Station | native | Open-Meteo live data (offline fallback), massive type |
| 10 | Screensaver | native overlay | Aerial video playlist with procedural flyover fallback; idle-triggered |
| 11–19 | Phone, Messages, Browser, Camera, Maps, Calendar, Calculator, Notes, Social Feed | native | DTMF tones, auto-replies, getUserMedia + filters, OSM + Nominatim, VFS auto-save, infinite reels… |
| 20–28 | File Explorer, Terminal, Code Editor, Office Writer, System Monitor, Web Browser, Email, Photo Editor, Floating Player | native | Shared VFS; `opsh` shell; CodeMirror 6 IDE with Run; rich text; real Electron telemetry; tabbed webviews; 3-pane mail; canvas paint; PiP player |

Files written by any app land in a shared virtual file system (`lib/vfs.ts`, persisted to localStorage) — create a file in Terminal, see it in File Explorer, open it in the Code Editor.

## Notes

- The screensaver can play your own aerial video: `localStorage.setItem('opos:screensaver-video', '<url>')`.
- `window.__opos` exposes the store for automation and debugging (e.g. `__opos.getState().setModeLock('tv')`).
- Some sites refuse to be framed; in the browser preview they show a notice with an “Open” link. In Electron every app runs in a real `<webview>`.

## Login screen (SDDM greeter)

`greeter/opos-greeter` is a matching Qt 6 SDDM theme. It has the same convergence model as the shell: TV D-pad navigation, touch with an on-screen keyboard, and desktop mouse and keyboard. It also includes an optional **OPOS Shell** login session. Install it with `sudo ./scripts/install-greeter.sh`, or preview it with `./scripts/install-greeter.sh --test`. See [greeter/README.md](greeter/README.md).
