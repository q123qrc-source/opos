import QtQuick

/** Bottom-left chip explaining the active input model. */
GlassPanel {
    id: hint
    radius: height / 2
    height: Ui.px(44)
    width: row.implicitWidth + Ui.px(30)
    tint: Qt.rgba(0.08, 0.09, 0.14, 0.4)

    readonly property string message: Ui.tv
        ? "◀ ▶ switch user   ▲ ▼ move   OK sign in   BACK clear"
        : Ui.touch
            ? "Tap the keyboard key for the on-screen keyboard"
            : "Tab to move  ·  Enter to sign in  ·  Arrow keys for TV mode"

    Row {
        id: row
        anchors.centerIn: parent
        spacing: Ui.px(10)
        Icon {
            name: Ui.tv ? "tv" : Ui.touch ? "touch" : "keyboard"
            size: Ui.px(17)
            color: Ui.accent3
            anchors.verticalCenter: parent.verticalCenter
        }
        Text {
            text: hint.message
            color: Ui.textDim
            font.family: Ui.fontFamily
            font.pixelSize: Ui.px(13)
            font.weight: Font.Medium
            anchors.verticalCenter: parent.verticalCenter
        }
    }
}
