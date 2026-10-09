import QtQuick
import QtQuick.Effects

/** Circular avatar: user face icon if available, otherwise gradient initials. */
Item {
    id: avatar
    property string source: ""
    property string name: "?"
    property real size: Ui.px(120)
    property bool active: false
    width: size
    height: size

    readonly property var palettes: [["#7c8cff", "#f472b6"], ["#22d3ee", "#6366f1"], ["#34d399", "#0ea5e9"], ["#fbbf24", "#f97316"], ["#a78bfa", "#ec4899"], ["#f87171", "#7c3aed"]]
    readonly property var colors: {
        let h = 0
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
        return palettes[h % palettes.length]
    }
    readonly property bool hasImage: img.status === Image.Ready

    // ambient ring
    Rectangle {
        anchors.centerIn: parent
        width: parent.width + Ui.px(10)
        height: width
        radius: width / 2
        color: "transparent"
        border.width: Ui.px(3)
        border.color: avatar.active ? Ui.accent : Qt.rgba(1, 1, 1, 0.14)
        Behavior on border.color { ColorAnimation { duration: Ui.normal } }
        layer.enabled: avatar.active
        layer.effect: MultiEffect { shadowEnabled: true; shadowColor: Ui.accent; shadowBlur: 1; blurMax: 48; shadowScale: 1.05 }
    }

    Rectangle {
        anchors.fill: parent
        radius: width / 2
        visible: !avatar.hasImage
        gradient: Gradient {
            orientation: Gradient.Vertical
            GradientStop { position: 0; color: avatar.colors[0] }
            GradientStop { position: 1; color: avatar.colors[1] }
        }
        Text {
            anchors.centerIn: parent
            text: {
                const parts = avatar.name.trim().split(/\s+/)
                return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase()
            }
            color: "white"
            font.family: Ui.fontFamily
            font.pixelSize: avatar.size * 0.38
            font.weight: Font.Bold
        }
    }

    Image {
        id: img
        anchors.fill: parent
        source: avatar.source ? (avatar.source.indexOf("://") > 0 ? avatar.source : "file://" + avatar.source) : ""
        sourceSize: Qt.size(avatar.size * 2, avatar.size * 2)
        fillMode: Image.PreserveAspectCrop
        visible: false
        asynchronous: true
    }
    Item {
        id: mask
        anchors.fill: parent
        visible: false
        layer.enabled: true
        Rectangle { anchors.fill: parent; radius: width / 2 }
    }
    MultiEffect {
        anchors.fill: parent
        visible: avatar.hasImage
        source: img
        maskEnabled: true
        maskSource: mask
        autoPaddingEnabled: false
    }
}
