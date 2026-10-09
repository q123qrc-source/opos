/*
 * OPOS Greeter — SDDM theme (Qt 6).
 *
 * SDDM context objects used: sddm (login/power), userModel, sessionModel, keyboard (caps lock),
 * config (theme.conf). Layout: cinematic clock top-left, status pills top-right, centered glass
 * authentication card, input-mode hint bottom-left, power pill bottom-right.
 */
import QtQuick
import QtQuick.Controls
import QtQuick.Effects
import "components"

Item {
    id: root
    width: 1920
    height: 1080

    // ------------------------------------------------------------ configuration
    function cfg(key, fallback) {
        const v = (typeof config !== "undefined" && config) ? config[key] : undefined
        return (v === undefined || v === null || String(v) === "") ? fallback : String(v)
    }
    function cfgBool(key, fallback) {
        return cfg(key, fallback ? "true" : "false").toLowerCase() === "true"
    }

    readonly property bool hasUsers: typeof userModel !== "undefined" && userModel && userModel.count > 0
    readonly property string loginName: hasUsers ? userSelector.userName : usernameBox.text
    property bool busy: false
    property string errorText: ""
    property bool signedIn: false
    readonly property bool vkShown: vkLoader.item ? vkLoader.item.visible : false
    readonly property real vkHeight: vkLoader.item && vkShown ? vkLoader.item.height : 0

    Binding { target: Ui; property: "dp"; value: Math.max(0.6, Math.min(Math.max(root.width, root.height) / 1920, Math.min(root.width, root.height) / 1080) * 1.15) }

    Component.onCompleted: {
        Ui.accent = cfg("accentColor", "#7c8cff")
        Ui.accent2 = cfg("accentColor2", "#f472b6")
        Ui.accent3 = cfg("accentColor3", "#22d3ee")
        Ui.base = cfg("baseColor", "#0a0a0f")
        Ui.fontFamily = cfg("font", "Inter")
        Ui.tvKeyThreshold = parseInt(cfg("tvKeyThreshold", "2")) || 2
        Ui.blurMax = parseInt(cfg("blurMax", "64")) || 64
        entrance.start()
        focusAuth()
        initialFocus.start()
    }

    // The greeter window may not be active yet when the root completes; grab focus again shortly after.
    Timer { id: initialFocus; interval: 120; onTriggered: if (!root.Window.activeFocusItem || root.Window.activeFocusItem === root) root.focusAuth() }

    function focusAuth() {
        if (!hasUsers)
            usernameBox.focusInput()
        else
            passwordBox.focusInput()
    }

    function login() {
        if (busy || signedIn)
            return
        if (!loginName) {
            errorText = "Enter a username"
            shake.restart()
            return
        }
        errorText = ""
        busy = true
        sddm.login(loginName, passwordBox.text, sessionPicker.currentIndex)
    }

    Connections {
        target: typeof sddm !== "undefined" ? sddm : null
        ignoreUnknownSignals: true
        function onLoginFailed() {
            root.busy = false
            root.errorText = "Incorrect password — try again"
            passwordBox.error = true
            passwordBox.clear()
            shake.restart()
            passwordBox.focusInput()
        }
        function onLoginSucceeded() {
            root.busy = false
            root.signedIn = true
        }
    }

    Connections {
        target: Ui
        function onBackRequested() {
            if (confirm.isOpen)
                confirm.close()
            else if (root.vkShown)
                root.toggleKeyboard(false)
            else if (passwordBox.text.length > 0)
                passwordBox.clear()
            else
                root.focusAuth()
        }
    }

    function toggleKeyboard(show) {
        const want = show === undefined ? !vkShown : show
        if (vkLoader.item)
            vkLoader.item.shown = want
        if (want) {
            focusAuth()
            Qt.inputMethod.show()   // also drives Maliit or any other Qt input-method plugin
        } else {
            Qt.inputMethod.hide()
        }
    }

    function requestPower(action) {
        const map = {
            suspend: { title: "Sleep now?", message: "The device will suspend. Press any key or the power button to wake it.", confirmText: "Sleep", iconName: "sleep", tone: Ui.accent, run: () => sddm.suspend() },
            reboot: { title: "Restart OPOS?", message: "Unsaved work in other sessions will be lost.", confirmText: "Restart", iconName: "reboot", tone: Ui.warning, run: () => sddm.reboot() },
            poweroff: { title: "Shut down?", message: "The device will power off completely.", confirmText: "Shut down", iconName: "power", tone: Ui.danger, run: () => sddm.powerOff() }
        }
        const a = map[action]
        confirm.open({ title: a.title, message: a.message, confirmText: a.confirmText, iconName: a.iconName, tone: a.tone, onConfirm: a.run, returnFocus: root.Window.activeFocusItem })
    }

    // ------------------------------------------------------------ input model detection
    property point lastMouse: Qt.point(-1, -1)
    property real mouseTravel: 0
    HoverHandler {
        acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
        cursorShape: Ui.tv ? Qt.BlankCursor : Qt.ArrowCursor
        onPointChanged: {
            const p = point.position
            if (root.lastMouse.x >= 0)
                root.mouseTravel += Math.abs(p.x - root.lastMouse.x) + Math.abs(p.y - root.lastMouse.y)
            root.lastMouse = p
            if (root.mouseTravel > 30) {
                root.mouseTravel = 0
                if (Ui.mode !== "desktop")
                    Ui.notePointer("desktop")
            }
        }
    }
    PointHandler {
        acceptedDevices: PointerDevice.TouchScreen
        onActiveChanged: if (active) Ui.notePointer("touch")
    }
    PointHandler {
        acceptedDevices: PointerDevice.Mouse
        onActiveChanged: if (active && Ui.mode !== "desktop") Ui.notePointer("desktop")
    }
    Timer { interval: 600; running: true; repeat: true; onTriggered: root.mouseTravel = 0 }

    // ------------------------------------------------------------ backdrop
    Background {
        id: background
        anchors.fill: parent
        source: root.cfg("background", "aurora")
        dim: parseFloat(root.cfg("backgroundDim", "0.35"))
        animate: !root.signedIn
    }
    // cinematic overlays: left-side darkening for the clock + bottom vignette
    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            orientation: Gradient.Horizontal
            GradientStop { position: 0.0; color: Qt.rgba(0.02, 0.02, 0.04, 0.55) }
            GradientStop { position: 0.55; color: Qt.rgba(0.02, 0.02, 0.04, 0.0) }
        }
    }
    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: parent.height * 0.35
        gradient: Gradient {
            GradientStop { position: 0.0; color: "transparent" }
            GradientStop { position: 1.0; color: Qt.rgba(0.02, 0.02, 0.04, 0.6) }
        }
    }

    // ------------------------------------------------------------ chrome
    Item {
        id: chrome
        anchors.fill: parent
        opacity: 0

        Clock {
            id: clock
            anchors.left: parent.left
            anchors.top: parent.top
            anchors.leftMargin: Ui.rawPx(72)
            anchors.topMargin: Ui.rawPx(40)
            timeFormat: root.cfg("clockFormat", "HH:mm")
            dateFormat: root.cfg("dateFormat", "dddd, MMMM d")
            showGreeting: root.cfgBool("showGreeting", true)
            transform: Translate { id: clockShift; x: -40 }
            visible: root.width > Ui.rawPx(900) || !Ui.touch
        }

        StatusPills {
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.rightMargin: Ui.px(36)
            anchors.topMargin: Ui.px(36)
            backdrop: background
            hostName: typeof sddm !== "undefined" && sddm ? sddm.hostName : ""
            showHostname: root.cfgBool("showHostname", true)
            showBattery: root.cfgBool("showBattery", true)
            showNetwork: root.cfgBool("showNetwork", true)
        }

        // ---------------------------------------------------- authentication card
        GlassPanel {
            id: card
            backdrop: background
            width: Math.min(Ui.px(500), root.width - Ui.px(32))
            height: authColumn.implicitHeight + Ui.px(64)
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.verticalCenter: parent.verticalCenter
            anchors.horizontalCenterOffset: root.width > Ui.rawPx(1400) ? Ui.rawPx(120) : 0
            anchors.verticalCenterOffset: (root.vkShown ? -root.vkHeight / 2 : Ui.rawPx(30)) + cardShift.offset
            radius: Ui.px(36)
            glow: true
            glowStrength: root.errorText !== "" ? 0.7 : (Ui.tv ? 0.6 : 0.4)
            glowColor: root.errorText !== "" ? Ui.danger : Ui.accent
            Behavior on anchors.verticalCenterOffset { NumberAnimation { duration: Ui.normal; easing.type: Easing.OutCubic } }
            transform: Translate { id: shakeShift; x: 0 }
            QtObject { id: cardShift; property real offset: 40 }

            Column {
                id: authColumn
                anchors.top: parent.top
                anchors.topMargin: Ui.px(30)
                anchors.horizontalCenter: parent.horizontalCenter
                width: parent.width - Ui.px(64)
                spacing: Ui.px(14)

                UserSelector {
                    id: userSelector
                    visible: root.hasUsers
                    width: parent.width
                    model: typeof userModel !== "undefined" ? userModel : null
                    lastIndex: typeof userModel !== "undefined" && userModel ? userModel.lastIndex : -1
                    navDown: passwordBox
                    activeFocusOnTab: true
                    onActivated: passwordBox.focusInput()
                }

                Column {
                    visible: root.hasUsers
                    width: parent.width
                    spacing: Ui.px(8)
                    Text {
                        width: parent.width
                        horizontalAlignment: Text.AlignHCenter
                        text: userSelector.displayName
                        color: Ui.text
                        font.family: Ui.fontFamily
                        font.pixelSize: Ui.px(28)
                        font.weight: Font.DemiBold
                        elide: Text.ElideRight
                    }
                    Row {
                        anchors.horizontalCenter: parent.horizontalCenter
                        spacing: Ui.px(8)
                        Badge {
                            text: "@" + userSelector.userName
                            tone: Ui.textDim
                        }
                        Badge {
                            text: userSelector.currentIndex === (typeof userModel !== "undefined" && userModel ? userModel.lastIndex : -2) ? "Last signed in" : "Local account"
                            tone: Ui.accent
                        }
                    }
                }

                PasswordBox {
                    id: usernameBox
                    visible: !root.hasUsers
                    width: parent.width
                    passwordMode: false
                    placeholder: "Username"
                    navDown: passwordBox
                    onSubmitted: passwordBox.focusInput()
                }

                PasswordBox {
                    id: passwordBox
                    objectName: "passwordBox"
                    width: parent.width
                    capsLock: typeof keyboard !== "undefined" && keyboard ? keyboard.capsLock : false
                    busy: root.busy
                    placeholder: root.hasUsers && !userSelector.needsPassword ? "No password needed — press Enter" : "Password"
                    navUp: root.hasUsers ? userSelector : usernameBox
                    navDown: sessionPicker
                    navRight: null
                    onSubmitted: root.login()
                    onActiveFocusChanged: if (activeFocus && Ui.touch && vkLoader.item && !root.vkShown) root.toggleKeyboard(true)
                }

                Text {
                    width: parent.width
                    horizontalAlignment: Text.AlignHCenter
                    text: root.errorText
                    visible: text !== ""
                    color: Ui.danger
                    font.family: Ui.fontFamily
                    font.pixelSize: Ui.px(14)
                    font.weight: Font.Medium
                }

                Row {
                    anchors.horizontalCenter: parent.horizontalCenter
                    spacing: Ui.px(10)
                    SessionPicker {
                        id: sessionPicker
                        backdrop: background
                        model: typeof sessionModel !== "undefined" ? sessionModel : null
                        currentIndex: typeof sessionModel !== "undefined" && sessionModel && sessionModel.lastIndex >= 0 ? sessionModel.lastIndex : 0
                        navUp: passwordBox
                        navRight: keyboardToggle.visible ? keyboardToggle : powerBar.firstButton
                        navDown: powerBar.firstButton
                    }
                    OposButton {
                        id: keyboardToggle
                        visible: vkLoader.status === Loader.Ready
                        iconName: "keyboard"
                        variant: root.vkShown ? "accent" : "glass"
                        implicitHeight: Ui.px(44)
                        tooltip: "On-screen keyboard"
                        navLeft: sessionPicker
                        navUp: passwordBox
                        navDown: powerBar.firstButton
                        navRight: powerBar.firstButton
                        onClicked: root.toggleKeyboard()
                    }
                }
            }
        }

        ModeHint {
            backdrop: background
            anchors.left: parent.left
            anchors.bottom: parent.bottom
            anchors.leftMargin: Ui.px(36)
            anchors.bottomMargin: Ui.px(36) + root.vkHeight
            visible: root.width > Ui.px(1100)
        }

        PowerBar {
            id: powerBar
            backdrop: background
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            anchors.rightMargin: Ui.px(36)
            anchors.bottomMargin: Ui.px(36) + root.vkHeight
            canSuspend: typeof sddm !== "undefined" && sddm ? sddm.canSuspend : true
            canReboot: typeof sddm !== "undefined" && sddm ? sddm.canReboot : true
            canPowerOff: typeof sddm !== "undefined" && sddm ? sddm.canPowerOff : true
            navUp: sessionPicker
            navLeft: keyboardToggle.visible ? keyboardToggle : sessionPicker
            onRequested: (action) => root.requestPower(action)
        }
    }

    // ------------------------------------------------------------ on-screen keyboard
    Loader {
        id: vkLoader
        anchors.fill: parent
        z: 900
        source: "components/VirtualKeyboard.qml"
        asynchronous: false
    }

    // ------------------------------------------------------------ modal + success
    ConfirmDialog {
        id: confirm
        objectName: "confirmDialog"
        onClosed: if (!root.Window.activeFocusItem || !root.Window.activeFocusItem.visible) root.focusAuth()
        backdrop: background
    }

    Rectangle {
        id: welcome
        anchors.fill: parent
        color: Ui.base
        opacity: root.signedIn ? 1 : 0
        visible: opacity > 0
        z: 2000
        Behavior on opacity { NumberAnimation { duration: 700; easing.type: Easing.InOutQuad } }
        Text {
            anchors.centerIn: parent
            text: "Welcome, " + (userSelector.displayName || root.loginName)
            color: Ui.text
            font.family: Ui.fontFamily
            font.pixelSize: Ui.px(40)
            font.weight: Font.Light
        }
    }

    // ------------------------------------------------------------ animations
    ParallelAnimation {
        id: entrance
        NumberAnimation { target: chrome; property: "opacity"; from: 0; to: 1; duration: 700; easing.type: Easing.OutCubic }
        NumberAnimation { target: cardShift; property: "offset"; from: 40; to: 0; duration: 800; easing.type: Easing.OutCubic }
        NumberAnimation { target: clockShift; property: "x"; from: -40; to: 0; duration: 900; easing.type: Easing.OutCubic }
    }
    SequentialAnimation {
        id: shake
        NumberAnimation { target: shakeShift; property: "x"; to: -18; duration: 60 }
        NumberAnimation { target: shakeShift; property: "x"; to: 16; duration: 70 }
        NumberAnimation { target: shakeShift; property: "x"; to: -10; duration: 70 }
        NumberAnimation { target: shakeShift; property: "x"; to: 6; duration: 70 }
        NumberAnimation { target: shakeShift; property: "x"; to: 0; duration: 60 }
    }
}
