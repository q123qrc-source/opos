import QtQuick
import QtQuick.Effects

/*
 * Acrylic glass container: blurs the live backdrop behind itself (ShaderEffectSource →
 * MultiEffect blur, clipped to a rounded mask), adds a tint, a hairline border, a top sheen
 * and an optional neon ambient glow.
 */
Item {
    id: panel

    property Item backdrop: null
    property real radius: Ui.px(28)
    property color tint: Ui.glassTint
    property color borderColor: Ui.glassBorder
    property real borderWidth: 1
    property bool glow: false
    property color glowColor: Ui.accent
    property real glowStrength: 0.55
    default property alias content: contentArea.data

    // ---- neon ambient glow (shadow of an invisible rounded rect)
    Rectangle {
        id: glowShape
        anchors.fill: parent
        radius: panel.radius
        color: Ui.base
        visible: false
        layer.enabled: true
    }
    MultiEffect {
        anchors.fill: glowShape
        source: glowShape
        visible: panel.glow
        opacity: panel.glowStrength
        shadowEnabled: true
        shadowColor: panel.glowColor
        shadowBlur: 1.0
        shadowScale: 1.03
        blurMax: 64
        Behavior on opacity { NumberAnimation { duration: Ui.normal } }
    }

    // ---- frosted backdrop
    ShaderEffectSource {
        id: backdropSource
        anchors.fill: parent
        visible: false
        live: true
        recursive: false
        sourceItem: panel.backdrop
        sourceRect: {
            // Re-evaluated whenever our geometry changes.
            void (panel.x + panel.y + panel.width + panel.height)
            if (!panel.backdrop)
                return Qt.rect(0, 0, 0, 0)
            const p = panel.mapToItem(panel.backdrop, 0, 0)
            return Qt.rect(p.x, p.y, panel.width, panel.height)
        }
    }
    Item {
        id: mask
        anchors.fill: parent
        visible: false
        layer.enabled: true
        Rectangle { anchors.fill: parent; radius: panel.radius; color: "white" }
    }
    MultiEffect {
        anchors.fill: parent
        visible: panel.backdrop !== null
        source: backdropSource
        autoPaddingEnabled: false
        blurEnabled: true
        blur: 1.0
        blurMax: Ui.blurMax
        saturation: 0.25
        brightness: -0.04
        maskEnabled: true
        maskSource: mask
    }

    // ---- tint, sheen and hairline border
    Rectangle {
        anchors.fill: parent
        radius: panel.radius
        color: panel.tint
    }
    Rectangle {
        anchors.fill: parent
        radius: panel.radius
        gradient: Gradient {
            GradientStop { position: 0.0; color: Qt.rgba(1, 1, 1, 0.09) }
            GradientStop { position: 0.35; color: Qt.rgba(1, 1, 1, 0.02) }
            GradientStop { position: 1.0; color: Qt.rgba(1, 1, 1, 0.0) }
        }
    }
    Rectangle {
        anchors.fill: parent
        radius: panel.radius
        color: "transparent"
        border.width: panel.borderWidth
        border.color: panel.borderColor
    }

    Item {
        id: contentArea
        anchors.fill: parent
    }
}
