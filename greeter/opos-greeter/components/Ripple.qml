import QtQuick
import QtQuick.Effects

/** Click ripple clipped to a rounded shape. Call burst(x, y). */
Item {
    id: ripple
    property color color: Qt.rgba(1, 1, 1, 0.28)
    property real radius: 0
    property int active: 0
    anchors.fill: parent

    function burst(x, y) {
        const c = circleComponent.createObject(canvas, { cx: x, cy: y })
        active += 1
        c.start()
    }

    Item {
        id: canvas
        anchors.fill: parent
        visible: false
        layer.enabled: ripple.active > 0
    }
    Item {
        id: mask
        anchors.fill: parent
        visible: false
        layer.enabled: true
        Rectangle { anchors.fill: parent; radius: ripple.radius; color: "white" }
    }
    MultiEffect {
        anchors.fill: parent
        visible: ripple.active > 0
        source: canvas
        maskEnabled: true
        maskSource: mask
        autoPaddingEnabled: false
    }

    Component {
        id: circleComponent
        Rectangle {
            id: circle
            property real cx
            property real cy
            readonly property real maxR: Math.hypot(Math.max(cx, ripple.width - cx), Math.max(cy, ripple.height - cy))
            x: cx - width / 2
            y: cy - height / 2
            width: 0
            height: width
            radius: width / 2
            color: ripple.color
            function start() { anim.start() }
            ParallelAnimation {
                id: anim
                NumberAnimation { target: circle; property: "width"; to: circle.maxR * 2; duration: 420; easing.type: Easing.OutCubic }
                SequentialAnimation {
                    PauseAnimation { duration: 160 }
                    NumberAnimation { target: circle; property: "opacity"; to: 0; duration: 340 }
                }
                onFinished: { ripple.active -= 1; circle.destroy() }
            }
        }
    }
}
