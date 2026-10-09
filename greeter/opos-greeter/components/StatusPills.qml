import QtQuick

/** Top-right status pills: input mode, network, battery, host + live time. */
Row {
    id: pills
    property Item backdrop
    property string hostName: ""
    property bool showHostname: true
    property bool showBattery: true
    property bool showNetwork: true
    property date now: new Date()
    spacing: Ui.px(10)

    SystemStatus { id: sys }

    Timer { interval: 1000; running: true; repeat: true; onTriggered: pills.now = new Date() }

    component Pill: GlassPanel {
        id: pill
        property alias label: text.text
        property string iconName
        property color iconColor: Ui.text
        backdrop: pills.backdrop
        radius: height / 2
        height: Ui.px(40)
        width: rowContent.implicitWidth + Ui.px(28)
        Row {
            id: rowContent
            anchors.centerIn: parent
            spacing: Ui.px(8)
            Icon { name: pill.iconName; size: Ui.px(17); color: pill.iconColor; anchors.verticalCenter: parent.verticalCenter; visible: pill.iconName !== "" }
            Text {
                id: text
                color: Ui.text
                font.family: Ui.fontFamily
                font.pixelSize: Ui.px(14)
                font.weight: Font.Medium
                anchors.verticalCenter: parent.verticalCenter
                visible: text.text !== ""
            }
        }
    }

    Pill {
        iconName: Ui.tv ? "tv" : Ui.touch ? "touch" : "monitor"
        iconColor: Ui.accent
        label: Ui.tv ? "TV" : Ui.touch ? "Touch" : "Desktop"
    }
    Pill {
        visible: pills.showNetwork && sys.network !== "unknown"
        iconName: sys.network === "wifi" ? "wifi" : sys.network === "wired" ? "ethernet" : "wifi-off"
        iconColor: sys.network === "offline" ? Ui.warning : Ui.text
        label: sys.network === "wifi" ? (sys.wifiQuality > 0 ? sys.wifiQuality + "%" : "Wi-Fi")
             : sys.network === "wired" ? "Wired" : "Offline"
    }
    Pill {
        visible: pills.showBattery && sys.batteryPresent
        iconName: sys.charging ? "battery-charging" : "battery"
        iconColor: sys.batteryLevel >= 0 && sys.batteryLevel < 20 && !sys.charging ? Ui.danger : (sys.charging ? Ui.success : Ui.text)
        label: sys.batteryLevel + "%"
    }
    Pill {
        iconName: "clock"
        label: (pills.showHostname && pills.hostName ? pills.hostName + "  ·  " : "") + Qt.formatTime(pills.now, "HH:mm:ss")
    }
}
