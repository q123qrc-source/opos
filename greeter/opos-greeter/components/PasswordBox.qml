import QtQuick

/** Oversized glass password field with reveal toggle, unlock arrow and caps-lock warning. */
FocusScope {
    id: box
    property alias text: input.text
    property string placeholder: "Password"
    property bool capsLock: false
    property bool busy: false
    property bool error: false
    property bool masked: true
    property bool passwordMode: true

    property Item navUp: null
    property Item navDown: null
    property Item navLeft: null
    property Item navRight: null
    readonly property bool isTextInput: true

    signal submitted()
    function activate() { if (!busy) submitted() }
    function clear() { input.text = "" }
    function focusInput() { input.forceActiveFocus() }

    activeFocusOnTab: true
    implicitWidth: Ui.px(380)
    implicitHeight: Ui.px(Ui.touch ? 64 : 56) + (capsLock ? Ui.px(30) : 0)
    Behavior on implicitHeight { NumberAnimation { duration: Ui.fast } }

    scale: activeFocus && Ui.tv ? 1.05 : 1
    Behavior on scale { NumberAnimation { duration: Ui.fast; easing.type: Easing.OutBack } }

    Rectangle {
        id: field
        width: parent.width
        height: Ui.px(Ui.touch ? 64 : 56)
        radius: height / 2
        color: Qt.rgba(1, 1, 1, box.activeFocus ? 0.12 : 0.07)
        border.width: box.activeFocus ? 2 : 1
        border.color: box.error ? Ui.danger : box.activeFocus ? Qt.rgba(Ui.accent.r, Ui.accent.g, Ui.accent.b, 0.9) : Qt.rgba(1, 1, 1, 0.14)
        Behavior on color { ColorAnimation { duration: Ui.fast } }
        Behavior on border.color { ColorAnimation { duration: Ui.fast } }

        FocusGlow { target: box; radius: field.radius; visible: Ui.tv }

        Icon {
            id: lockIcon
            name: box.passwordMode ? "keyboard" : "user"
            size: Ui.px(18)
            color: Ui.textFaint
            anchors.left: parent.left
            anchors.leftMargin: Ui.px(22)
            anchors.verticalCenter: parent.verticalCenter
            visible: false
        }

        // The whole pill is the click/tap target, not just the 1-line text band.
        MouseArea {
            anchors.fill: parent
            cursorShape: Ui.tv ? Qt.BlankCursor : Qt.IBeamCursor
            onPressed: {
                input.forceActiveFocus(Qt.MouseFocusReason)
                input.cursorPosition = input.length
            }
        }

        TextInput {
            id: input
            focus: true
            anchors.left: parent.left
            anchors.leftMargin: Ui.px(26)
            anchors.right: box.passwordMode ? reveal.left : parent.right
            anchors.rightMargin: Ui.px(8)
            anchors.verticalCenter: parent.verticalCenter
            color: Ui.text
            selectionColor: Ui.accent
            selectedTextColor: Ui.base
            font.family: Ui.fontFamily
            font.pixelSize: Ui.px(box.masked && box.passwordMode && text.length ? 22 : 17)
            font.letterSpacing: box.masked && box.passwordMode && text.length ? Ui.px(3) : 0
            echoMode: box.passwordMode && box.masked ? TextInput.Password : TextInput.Normal
            passwordCharacter: "●"
            passwordMaskDelay: Ui.touch ? 700 : 0
            clip: true
            cursorDelegate: Rectangle {
                width: 2
                color: Ui.accent
                visible: input.activeFocus
                SequentialAnimation on opacity {
                    loops: Animation.Infinite
                    running: input.activeFocus
                    NumberAnimation { to: 0; duration: 500 }
                    NumberAnimation { to: 1; duration: 500 }
                }
            }
            inputMethodHints: box.passwordMode ? (Qt.ImhSensitiveData | Qt.ImhNoPredictiveText | Qt.ImhNoAutoUppercase | Qt.ImhHiddenText) : Qt.ImhNoAutoUppercase
            onAccepted: box.activate()
            onTextChanged: box.error = false

            Keys.onPressed: (event) => {
                // Left/Right move the caret until it hits the edge, then they navigate.
                const atStart = cursorPosition === 0 && selectedText === ""
                const atEnd = cursorPosition === length && selectedText === ""
                const caret = (event.key === Qt.Key_Left && !atStart) || (event.key === Qt.Key_Right && !atEnd)
                if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                    Ui.noteKey(event.key, false)
                    return  // handled by onAccepted
                }
                Ui.handleKey(event, box, caret)
            }

            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: box.placeholder
                color: Ui.textFaint
                font: input.font
                visible: input.text.length === 0 && !input.inputMethodComposing
            }
        }

        OposButton {
            id: reveal
            visible: box.passwordMode
            anchors.right: unlock.left
            anchors.rightMargin: Ui.px(4)
            anchors.verticalCenter: parent.verticalCenter
            implicitHeight: Ui.px(Ui.touch ? 46 : 38)
            iconName: box.masked ? "eye" : "eye-off"
            iconSize: Ui.px(17)
            variant: "ghost"
            takesFocus: false
            activeFocusOnTab: false
            tooltip: box.masked ? "Show password" : "Hide password"
            onClicked: { box.masked = !box.masked; input.forceActiveFocus() }
        }

        OposButton {
            id: unlock
            visible: box.passwordMode
            anchors.right: parent.right
            anchors.rightMargin: Ui.px(6)
            anchors.verticalCenter: parent.verticalCenter
            implicitHeight: field.height - Ui.px(12)
            iconName: "arrow-right"
            iconSize: Ui.px(20)
            variant: "accent"
            takesFocus: false
            activeFocusOnTab: false
            enabled: !box.busy
            tooltip: "Sign in"
            onClicked: box.activate()

            // busy spinner
            Rectangle {
                anchors.fill: parent
                radius: width / 2
                color: Ui.accent
                visible: box.busy
                Rectangle {
                    anchors.centerIn: parent
                    width: parent.width * 0.5
                    height: width
                    radius: width / 2
                    color: "transparent"
                    border.width: 2
                    border.color: Ui.base
                    Rectangle { width: parent.width / 2; height: parent.height / 2; color: Ui.accent }
                    RotationAnimation on rotation { from: 0; to: 360; duration: 800; loops: Animation.Infinite; running: box.busy }
                }
            }
        }
    }

    Row {
        anchors.top: field.bottom
        anchors.topMargin: Ui.px(10)
        anchors.horizontalCenter: parent.horizontalCenter
        spacing: Ui.px(6)
        opacity: box.capsLock ? 1 : 0
        visible: opacity > 0
        Behavior on opacity { NumberAnimation { duration: Ui.fast } }
        Icon { name: "caps"; size: Ui.px(15); color: Ui.warning; anchors.verticalCenter: parent.verticalCenter }
        Text {
            text: "Caps Lock is on"
            color: Ui.warning
            font.family: Ui.fontFamily
            font.pixelSize: Ui.px(13)
            font.weight: Font.Medium
            anchors.verticalCenter: parent.verticalCenter
        }
    }
}
