import QtQuick

Rectangle {
    id: tip
    property string text
    property bool shown: false
    anchors.bottom: parent.top
    anchors.bottomMargin: Ui.px(10)
    anchors.horizontalCenter: parent.horizontalCenter
    width: label.implicitWidth + Ui.px(20)
    height: label.implicitHeight + Ui.px(10)
    radius: height / 2
    color: Qt.rgba(0.07, 0.08, 0.12, 0.92)
    border.color: Ui.glassBorder
    opacity: shown ? 1 : 0
    visible: opacity > 0
    Behavior on opacity { NumberAnimation { duration: Ui.fast } }
    Text {
        id: label
        anchors.centerIn: parent
        text: tip.text
        color: Ui.text
        font.family: Ui.fontFamily
        font.pixelSize: Ui.px(12)
    }
}
