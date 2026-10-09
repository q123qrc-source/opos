import QtQuick

/** Cinematic 10-foot clock: massive time, date and a contextual greeting. */
Column {
    id: clock
    property string timeFormat: "HH:mm"
    property string dateFormat: "dddd, MMMM d"
    property bool showGreeting: true
    property date now: new Date()
    spacing: Ui.rawPx(4)

    Timer {
        interval: 1000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: clock.now = new Date()
    }

    Text {
        text: Qt.formatTime(clock.now, clock.timeFormat)
        color: Ui.text
        font.family: Ui.fontFamily
        font.pixelSize: Ui.rawPx(Ui.tv ? 190 : 168)
        font.weight: Font.ExtraLight
        font.letterSpacing: -Ui.rawPx(6)
        lineHeight: 0.86
        style: Text.Normal
        Behavior on font.pixelSize { NumberAnimation { duration: Ui.normal } }
    }
    Text {
        text: Qt.formatDate(clock.now, clock.dateFormat)
        color: Ui.text
        opacity: 0.9
        font.family: Ui.fontFamily
        font.pixelSize: Ui.rawPx(38)
        font.weight: Font.Light
        leftPadding: Ui.rawPx(8)
    }
    Text {
        visible: clock.showGreeting
        readonly property int h: clock.now.getHours()
        text: h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
        color: Ui.textDim
        font.family: Ui.fontFamily
        font.pixelSize: Ui.rawPx(20)
        font.weight: Font.Medium
        font.letterSpacing: Ui.rawPx(5)
        font.capitalization: Font.AllUppercase
        leftPadding: Ui.rawPx(10)
        topPadding: Ui.rawPx(10)
    }
}
