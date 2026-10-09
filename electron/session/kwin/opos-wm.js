/*
 * OPOS window-manager bridge — a KWin script (works on KWin 5.27 and KWin 6).
 *
 * Loaded by the OPOS shell through org.kde.kwin.Scripting. It:
 *   - streams the real window list to OPOS (D-Bus: org.opos.Shell.Event),
 *   - long-polls OPOS for commands (D-Bus: org.opos.Shell.NextCommands) and executes them,
 *   - pins OPOS shell surfaces (desktop below everything; panels/overlays above, borderless),
 *   - applies the convergence layout (desktop: decorated floating windows; mobile/tv: borderless,
 *     filling the app area) to every app window, including ones opened later,
 *   - registers global shortcuts and reports pointer activity for input-mode detection.
 *
 * Plain ES5-ish JavaScript on purpose: KWin 5's QJSEngine is conservative.
 */
var SVC = "org.opos.Shell";
var OBJ = "/org/opos/Shell";
var IFACE = "org.opos.Shell";

var state = {
    shellPid: -1,
    mode: "desktop",
    appArea: null,          // {x,y,w,h} — where app windows live in mobile/tv
    surfaces: {},           // caption -> {role, x, y, w, h, visible}
    saved: {},              // window id -> {x,y,w,h,noBorder} saved before mobile/tv layout
    polling: false,
    lastPointer: 0
};

/* ------------------------------------------------------------- compat */

function windows() {
    return workspace.windowList ? workspace.windowList() : workspace.clientList();
}
function activeWindow() {
    return workspace.activeWindow !== undefined ? workspace.activeWindow : workspace.activeClient;
}
function setActive(w) {
    if (workspace.activeWindow !== undefined) workspace.activeWindow = w;
    else workspace.activeClient = w;
}
function geom(w) {
    return w.frameGeometry !== undefined ? w.frameGeometry : w.geometry;
}
function setGeom(w, x, y, width, height) {
    // A plain object converts to QRect(F) on both KWin 5 and 6; Wayland clients resize asynchronously.
    var r = { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
    if (w.frameGeometry !== undefined) w.frameGeometry = r; else w.geometry = r;
}
function screenGeom() {
    var s = workspace.activeScreen;
    if (s && s.geometry !== undefined) return s.geometry; // KWin 6 Output
    return workspace.clientArea(KWin.ScreenArea, s, workspace.currentDesktop);
}
function connect(sig, fn) { if (sig && sig.connect) sig.connect(fn); }
function idOf(w) { return String(w.internalId); }
function byId(id) {
    var all = windows();
    for (var i = 0; i < all.length; i++) if (idOf(all[i]) === id) return all[i];
    return null;
}

/* ---------------------------------------------------- classification */

function isShell(w) { return state.shellPid > 0 && w.pid === state.shellPid; }
function surfaceOf(w) { return isShell(w) ? state.surfaces[w.caption] || null : null; }
function isAppWindow(w) {
    if (w.specialWindow !== undefined && w.specialWindow) return false;
    if (!w.normalWindow) return false;
    if (surfaceOf(w)) return false;
    return true;
}

function serialize(w) {
    var g = geom(w);
    var a = activeWindow();
    return {
        id: idOf(w),
        caption: String(w.caption),
        resourceClass: String(w.resourceClass),
        resourceName: String(w.resourceName),
        desktopFile: w.desktopFileName ? String(w.desktopFileName) : "",
        pid: w.pid,
        x: g.x, y: g.y, w: g.width, h: g.height,
        minimized: !!w.minimized,
        active: a !== null && a !== undefined && idOf(a) === idOf(w),
        fullScreen: !!w.fullScreen,
        maximized: state.saved[idOf(w)] ? false : isMaximized(w),
        normal: !!w.normalWindow,
        dialog: !!w.dialog,
        transient: !!w.transient,
        skipTaskbar: !!w.skipTaskbar,
        shell: isShell(w),
        surface: surfaceOf(w) ? surfaceOf(w).role : ""
    };
}

function isMaximized(w) {
    var a = workspace.clientArea(KWin.MaximizeArea, w);
    var g = geom(w);
    return g.width >= a.width - 2 && g.height >= a.height - 2;
}

/* ----------------------------------------------------------- D-Bus out */

function send(type, data) {
    callDBus(SVC, OBJ, IFACE, "Event", JSON.stringify({ type: type, data: data }));
}

var pendingList = false;
function sendList() {
    var out = [];
    var all = windows();
    for (var i = 0; i < all.length; i++) out.push(serialize(all[i]));
    var s = screenGeom();
    send("windows", { windows: out, screen: { x: s.x, y: s.y, w: s.width, h: s.height } });
}

/* ----------------------------------------------------- shell surfaces */

function applySurface(w) {
    var s = surfaceOf(w);
    if (!s) return;
    w.noBorder = true;
    w.skipTaskbar = true;
    w.skipSwitcher = true;
    w.skipPager = true;
    w.onAllDesktops = true;
    if (s.role === "desktop") {
        w.keepAbove = false;
        w.keepBelow = true;
    } else {
        w.keepBelow = false;
        w.keepAbove = true;
    }
    if (s.w > 0 && s.h > 0) setGeom(w, s.x, s.y, s.w, s.h);
    if (s.minimized !== undefined) w.minimized = s.minimized;
}

/* -------------------------------------------------- convergence layout */

function layoutWindow(w) {
    if (!isAppWindow(w)) return;
    var id = idOf(w);
    if (state.mode === "desktop") {
        var saved = state.saved[id];
        if (saved) {
            if (w.fullScreen) w.fullScreen = false;
            w.noBorder = saved.noBorder;
            setGeom(w, saved.x, saved.y, saved.w, saved.h);
            delete state.saved[id];
        }
        return;
    }
    if (w.dialog || w.transient) return; // dialogs keep their natural size, centered by KWin
    if (!state.saved[id]) {
        var g = geom(w);
        state.saved[id] = { x: g.x, y: g.y, w: g.width, h: g.height, noBorder: !!w.noBorder };
    }
    var area = state.appArea || (function () { var s = screenGeom(); return { x: s.x, y: s.y, w: s.width, h: s.height }; })();
    w.noBorder = true;
    w.__oposFit = 4; // re-assert a few times: dropping the border re-sizes the frame to the old client size
    setGeom(w, area.x, area.y, area.w, area.h);
}

/** Mobile/TV: keep app windows pinned to the app area if a client or decoration change moved them. */
function enforceArea(w) {
    if (state.mode === "desktop" || !isAppWindow(w) || w.dialog || w.transient || w.fullScreen) return;
    if (!state.saved[idOf(w)] || !(w.__oposFit > 0)) return;
    var a = state.appArea, g = geom(w);
    if (!a || (g.x === a.x && g.y === a.y && g.width === a.w && g.height === a.h)) return;
    w.__oposFit--;
    setGeom(w, a.x, a.y, a.w, a.h);
}

function layoutAll() {
    var all = windows();
    for (var i = 0; i < all.length; i++) layoutWindow(all[i]);
}

/* ------------------------------------------------------------ commands */

function run(c) {
    var w = c.id ? byId(c.id) : null;
    switch (c.op) {
    case "config":
        state.shellPid = c.shellPid;
        state.surfaces = c.surfaces || {};
        var all = windows();
        for (var i = 0; i < all.length; i++) applySurface(all[i]);
        break;
    case "surface":
        state.surfaces[c.caption] = c.surface;
        var list = windows();
        for (var j = 0; j < list.length; j++) if (list[j].caption === c.caption && isShell(list[j])) applySurface(list[j]);
        break;
    case "mode":
        state.mode = c.mode;
        state.appArea = c.area || null;
        layoutAll();
        break;
    case "activate":
        if (w) { if (w.minimized) w.minimized = false; setActive(w); }
        break;
    case "minimize":
        if (w) w.minimized = true;
        break;
    case "toggleMinimize":
        if (w) {
            var act = activeWindow();
            if (!w.minimized && act && idOf(act) === idOf(w)) w.minimized = true;
            else { w.minimized = false; setActive(w); }
        }
        break;
    case "close":
        if (w) w.closeWindow();
        break;
    case "toggleMaximize":
        if (w && state.mode === "desktop") {
            if (isMaximized(w)) w.setMaximize(false, false); else w.setMaximize(true, true);
        }
        break;
    case "fullscreen":
        if (w) w.fullScreen = !!c.value;
        break;
    case "geometry":
        if (w) setGeom(w, c.x, c.y, c.w, c.h);
        break;
    case "showDesktop":
        var ws = windows();
        for (var k = 0; k < ws.length; k++) if (isAppWindow(ws[k])) ws[k].minimized = true;
        break;
    case "activateCaption":
        var cs = windows();
        for (var m = 0; m < cs.length; m++) if (cs[m].caption === c.caption && isShell(cs[m])) { cs[m].minimized = false; setActive(cs[m]); }
        break;
    case "list":
        break;
    }
}

function poll() {
    if (state.polling) return;
    state.polling = true;
    callDBus(SVC, OBJ, IFACE, "NextCommands", function (json) {
        state.polling = false;
        var cmds = [];
        try { cmds = JSON.parse(json); } catch (e) { cmds = []; }
        for (var i = 0; i < cmds.length; i++) {
            try { run(cmds[i]); } catch (err) { send("error", String(err)); }
        }
        if (cmds.length) sendList();
        poll();
    });
}

/* --------------------------------------------------------------- hooks */

function watch(w) {
    var update = function () { sendList(); };
    connect(w.captionChanged, function () { if (isShell(w)) applySurface(w); update(); });
    connect(w.minimizedChanged, update);
    connect(w.fullScreenChanged, update);
    connect(w.frameGeometryChanged, function () {
        enforceArea(w);
        // Throttle geometry floods while dragging.
        var now = Date.now();
        if (now - (w.__oposLastGeom || 0) > 250) { w.__oposLastGeom = now; update(); }
    });
}

connect(workspace.windowAdded || workspace.clientAdded, function (w) {
    watch(w);
    applySurface(w);
    if (state.mode !== "desktop") layoutWindow(w);
    sendList();
    poll(); // re-arm the long poll if OPOS restarted
});
connect(workspace.windowRemoved || workspace.clientRemoved, function (w) {
    delete state.saved[idOf(w)];
    sendList();
});
connect(workspace.windowActivated || workspace.clientActivated, function () { sendList(); });
connect(workspace.clientMinimized, function () { sendList(); });
connect(workspace.clientUnminimized, function () { sendList(); });
connect(workspace.screensChanged || workspace.numberScreensChanged, function () { sendList(); send("screens", null); });
connect(workspace.virtualScreenGeometryChanged, function () { sendList(); send("screens", null); });

// Pointer activity → OPOS switches to Desktop mode when the mouse is used anywhere.
connect(workspace.cursorPosChanged, function () {
    var now = Date.now();
    if (now - state.lastPointer > 400) {
        state.lastPointer = now;
        send("pointer", null);
    }
});

// Global shortcuts (also reachable from TV remotes / keyboards that emit these keys).
function shortcut(name, text, keys, action) {
    if (typeof registerShortcut === "function") registerShortcut(name, text, keys, function () { send("shortcut", action); });
}
shortcut("OPOS Start", "OPOS: Start menu / launcher", "Meta+Space", "start");
shortcut("OPOS Home", "OPOS: Go home", "Meta+H", "home");
shortcut("OPOS Back", "OPOS: Back / close overlay", "Meta+Esc", "back");
shortcut("OPOS Recents", "OPOS: Recent apps", "Meta+Tab", "recents");
shortcut("OPOS Mode Auto", "OPOS: Automatic environment", "Meta+Shift+0", "mode:auto");
shortcut("OPOS Mode Desktop", "OPOS: Desktop environment", "Meta+Shift+1", "mode:desktop");
shortcut("OPOS Mode Mobile", "OPOS: Mobile environment", "Meta+Shift+2", "mode:mobile");
shortcut("OPOS Mode TV", "OPOS: TV environment", "Meta+Shift+3", "mode:tv");
shortcut("OPOS Media PlayPause", "OPOS: Play/Pause", "Media Play", "media:playpause");
shortcut("OPOS Media Next", "OPOS: Next track", "Media Next", "media:next");
shortcut("OPOS Media Previous", "OPOS: Previous track", "Media Previous", "media:previous");
shortcut("OPOS Lock", "OPOS: Lock screen", "Meta+L", "lock");

var existing = windows();
for (var n = 0; n < existing.length; n++) watch(existing[n]);
send("hello", { kwin: workspace.windowList ? 6 : 5 });
sendList();
poll();
