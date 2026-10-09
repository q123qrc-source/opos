pragma Singleton
import QtQuick

/*
 * OPOS greeter design tokens + the convergence input model.
 *
 *   desktop  mouse / keyboard: hover states, click ripples, thin keyboard-focus rings
 *   touch    touchscreen: oversized targets, on-screen keyboard surfaced
 *   tv       D-pad / remote: focused element scales up with an electric glow, cursor hidden
 *
 * Every focusable control routes its key events through handleKey(), which both performs
 * 2D navigation (navUp/navDown/navLeft/navRight properties on the item) and feeds the
 * TV-mode heuristic (N consecutive arrow/enter presses).
 */
QtObject {
    id: ui

    // ---------------------------------------------------------------- palette
    property color base: "#0a0a0f"
    property color accent: "#7c8cff"
    property color accent2: "#f472b6"
    property color accent3: "#22d3ee"
    readonly property color text: "#f5f6fb"
    readonly property color textDim: Qt.rgba(1, 1, 1, 0.62)
    readonly property color textFaint: Qt.rgba(1, 1, 1, 0.38)
    readonly property color glassTint: Qt.rgba(0.08, 0.09, 0.14, 0.55)
    readonly property color glassBorder: Qt.rgba(1, 1, 1, 0.12)
    readonly property color danger: "#ff6b81"
    readonly property color warning: "#fbbf24"
    readonly property color success: "#34d399"

    property string fontFamily: "Inter"
    property int blurMax: 64

    // ---------------------------------------------------------- input model
    property string mode: "desktop"
    readonly property bool tv: mode === "tv"
    readonly property bool touch: mode === "touch"
    /** True once the keyboard has been used for navigation (shows focus rings in desktop mode). */
    property bool keyboardNav: false
    property int tvKeyThreshold: 2
    property int keyStreak: 0

    /** Resolution scale (set by Main.qml) × per-mode comfort scale. */
    property real dp: 1.0
    readonly property real comfort: tv ? 1.18 : touch ? 1.12 : 1.0
    function px(v) { return Math.round(v * dp * comfort) }
    /** Size that ignores the comfort multiplier (e.g. the clock). */
    function rawPx(v) { return Math.round(v * dp) }

    signal backRequested()

    function setMode(m) {
        if (mode === m)
            return
        mode = m
    }

    function noteKey(key, fromTextCaret) {
        const navKey = key === Qt.Key_Up || key === Qt.Key_Down
            || ((key === Qt.Key_Left || key === Qt.Key_Right) && !fromTextCaret)
            || key === Qt.Key_Return || key === Qt.Key_Enter || key === Qt.Key_Select
        if (navKey) {
            keyboardNav = true
            keyStreak += 1
            if (keyStreak >= tvKeyThreshold)
                setMode("tv")
        } else if (key !== Qt.Key_Shift && key !== Qt.Key_CapsLock) {
            keyStreak = 0
            keyboardNav = key === Qt.Key_Tab || key === Qt.Key_Backtab || keyboardNav
        }
    }

    function notePointer(kind) {
        keyStreak = 0
        keyboardNav = false
        setMode(kind)
    }

    function isBackKey(key) {
        return key === Qt.Key_Escape || key === Qt.Key_Back || key === Qt.Key_Exit
    }

    function isActivateKey(key) {
        return key === Qt.Key_Return || key === Qt.Key_Enter || key === Qt.Key_Select || key === Qt.Key_Space
    }

    /**
     * Shared key handler. `item` may declare navUp/navDown/navLeft/navRight (Item) and
     * activate() (function). Returns true if the event was consumed.
     */
    function handleKey(event, item, fromTextCaret) {
        noteKey(event.key, !!fromTextCaret)
        let target = null
        switch (event.key) {
        case Qt.Key_Up: target = item.navUp; break
        case Qt.Key_Down: target = item.navDown; break
        case Qt.Key_Left: if (!fromTextCaret) target = item.navLeft; break
        case Qt.Key_Right: if (!fromTextCaret) target = item.navRight; break
        }
        if (target && target.visible && target.enabled) {
            target.forceActiveFocus(Qt.TabFocusReason)
            event.accepted = true
            return true
        }
        if (isActivateKey(event.key) && typeof item.activate === "function"
                && !(event.key === Qt.Key_Space && item.isTextInput)) {
            item.activate()
            event.accepted = true
            return true
        }
        if (isBackKey(event.key)) {
            backRequested()
            event.accepted = true
            return true
        }
        return false
    }

    // Animation timings
    readonly property int fast: 140
    readonly property int normal: 240
    readonly property int slow: 520
}
