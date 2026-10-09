import QtQuick
import QtQuick.Effects

/** The OPOS aurora: slow-drifting colour fields over obsidian, heavily blurred into a mesh gradient. */
Rectangle {
    id: aurora
    color: Ui.base
    property bool animate: true

    Item {
        id: blobs
        anchors.fill: parent
        visible: false
        layer.enabled: true
        layer.smooth: true

        Repeater {
            model: [
                { c: "#4338ca", x: 0.18, y: 0.22, r: 0.42, dx: 0.06, dy: 0.04, t: 23000 },
                { c: "#be185d", x: 0.82, y: 0.14, r: 0.36, dx: -0.05, dy: 0.06, t: 29000 },
                { c: "#0e7490", x: 0.72, y: 0.86, r: 0.44, dx: -0.07, dy: -0.04, t: 31000 },
                { c: "#6d28d9", x: 0.12, y: 0.9, r: 0.38, dx: 0.05, dy: -0.06, t: 27000 },
                { c: "#1d4ed8", x: 0.5, y: 0.5, r: 0.25, dx: 0.08, dy: 0.05, t: 35000 }
            ]
            delegate: Rectangle {
                id: blob
                required property var modelData
                property real phase: 0
                readonly property real size: Math.max(aurora.width, aurora.height) * modelData.r
                width: size
                height: size
                radius: size / 2
                color: modelData.c
                opacity: 0.85
                x: aurora.width * (modelData.x + modelData.dx * Math.sin(phase * Math.PI * 2)) - size / 2
                y: aurora.height * (modelData.y + modelData.dy * Math.cos(phase * Math.PI * 2)) - size / 2
                NumberAnimation on phase {
                    from: 0; to: 1
                    duration: blob.modelData.t
                    loops: Animation.Infinite
                    running: aurora.animate
                }
            }
        }
    }

    MultiEffect {
        anchors.fill: parent
        source: blobs
        autoPaddingEnabled: false
        blurEnabled: true
        blur: 1.0
        blurMax: 64
        blurMultiplier: 2.0
        saturation: 0.15
    }

    // Fine film grain-free vignette
    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            orientation: Gradient.Vertical
            GradientStop { position: 0.0; color: Qt.rgba(0.04, 0.04, 0.06, 0.15) }
            GradientStop { position: 1.0; color: Qt.rgba(0.04, 0.04, 0.06, 0.55) }
        }
    }
}
