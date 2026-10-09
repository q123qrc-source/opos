import QtQuick
import QtQuick.Effects

/** Monochrome SVG icon from assets/icons, recoloured with MultiEffect colorization. */
Item {
    id: icon
    property string name
    property color color: Ui.text
    property real size: Ui.px(20)
    implicitWidth: size
    implicitHeight: size

    Image {
        id: img
        anchors.fill: parent
        source: icon.name ? Qt.resolvedUrl("../assets/icons/" + icon.name + ".svg") : ""
        sourceSize: Qt.size(Math.ceil(icon.size * 2), Math.ceil(icon.size * 2))
        smooth: true
        visible: false
    }
    MultiEffect {
        anchors.fill: img
        source: img
        colorization: 1.0
        colorizationColor: icon.color
        brightness: 1.0
    }
}
