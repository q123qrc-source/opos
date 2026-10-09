import QtQuick

/** Small account badge pill. */
Rectangle {
    id: badge
    property alias text: label.text
    property color tone: Ui.accent
    height: Ui.px(26)
    width: label.implicitWidth + Ui.px(20)
    radius: height / 2
    color: Qt.rgba(tone.r, tone.g, tone.b, 0.14)
    border.width: 1
    border.color: Qt.rgba(tone.r, tone.g, tone.b, 0.35)
    Text {
        id: label
        anchors.centerIn: parent
        color: badge.tone
        font.family: Ui.fontFamily
        font.pixelSize: Ui.px(12)
        font.weight: Font.DemiBold
    }
}
