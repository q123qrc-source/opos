import QtQuick
import QtQuick.Effects

/*
 * Focus indicator. TV mode: thick electric border + bloom. Desktop keyboard navigation: a thin
 * accent ring. Pointer-driven focus shows nothing (hover states take over).
 */
Item {
    id: glow
    property Item target: parent
    property real radius: Ui.px(16)
    property real spread: Ui.tv ? Ui.px(4) : Ui.px(3)
    readonly property bool shown: target && target.activeFocus && (Ui.tv || Ui.keyboardNav)

    anchors.fill: parent
    anchors.margins: -spread
    opacity: shown ? 1 : 0
    visible: opacity > 0
    z: -1
    Behavior on opacity { NumberAnimation { duration: Ui.fast } }

    Rectangle {
        id: ring
        anchors.fill: parent
        radius: glow.radius + glow.spread
        color: "transparent"
        border.width: Ui.tv ? Ui.px(3) : 2
        border.color: Ui.accent
        layer.enabled: Ui.tv
        layer.effect: MultiEffect {
            shadowEnabled: true
            shadowColor: Ui.accent
            shadowBlur: 1.0
            shadowScale: 1.04
            blurMax: 48
            shadowOpacity: 1.0
        }
    }
}
