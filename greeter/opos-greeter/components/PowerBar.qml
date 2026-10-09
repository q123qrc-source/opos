import QtQuick

/** Bottom-right frosted pill with Sleep / Restart / Shut down. Emits requests; Main confirms. */
GlassPanel {
    id: bar
    property bool canSuspend: true
    property bool canReboot: true
    property bool canPowerOff: true
    property Item navUp: null
    property Item navLeft: null
    readonly property Item firstButton: sleepBtn.visible ? sleepBtn : rebootBtn.visible ? rebootBtn : offBtn
    signal requested(string action)

    radius: height / 2
    height: Ui.px(60)
    width: buttons.implicitWidth + Ui.px(16)
    glow: true
    glowStrength: 0.22
    glowColor: Ui.accent2

    Row {
        id: buttons
        anchors.centerIn: parent
        spacing: Ui.px(6)
        OposButton {
            id: sleepBtn
            visible: bar.canSuspend
            iconName: "sleep"
            variant: "ghost"
            tooltip: "Sleep"
            implicitHeight: Ui.px(46)
            navUp: bar.navUp
            navLeft: bar.navLeft
            navRight: rebootBtn.visible ? rebootBtn : offBtn
            onClicked: bar.requested("suspend")
        }
        OposButton {
            id: rebootBtn
            visible: bar.canReboot
            iconName: "reboot"
            variant: "ghost"
            tooltip: "Restart"
            implicitHeight: Ui.px(46)
            navUp: bar.navUp
            navLeft: sleepBtn.visible ? sleepBtn : bar.navLeft
            navRight: offBtn
            onClicked: bar.requested("reboot")
        }
        OposButton {
            id: offBtn
            visible: bar.canPowerOff
            iconName: "power"
            variant: "ghost"
            tooltip: "Shut down"
            implicitHeight: Ui.px(46)
            navUp: bar.navUp
            navLeft: rebootBtn.visible ? rebootBtn : sleepBtn
            onClicked: bar.requested("poweroff")
        }
    }
}
