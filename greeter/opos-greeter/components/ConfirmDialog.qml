import QtQuick

/** Full-screen modal confirmation (power actions). Focus is trapped; BACK cancels. */
FocusScope {
    id: dialog
    property Item backdrop
    property string title: ""
    property string message: ""
    property string confirmText: "Confirm"
    property string iconName: "power"
    property color tone: Ui.danger
    property var onConfirm: null
    property Item returnFocus: null
    readonly property bool isOpen: visible
    signal closed()

    function open(opts) {
        title = opts.title
        message = opts.message
        confirmText = opts.confirmText
        iconName = opts.iconName
        tone = opts.tone || Ui.danger
        onConfirm = opts.onConfirm
        returnFocus = opts.returnFocus || null
        visible = true
        cancelBtn.forceActiveFocus(Qt.OtherFocusReason)
    }
    function close() {
        visible = false
        if (returnFocus && returnFocus.visible) returnFocus.forceActiveFocus(Qt.OtherFocusReason)
        closed()
    }

    visible: false
    anchors.fill: parent
    z: 1000
    opacity: visible ? 1 : 0
    Behavior on opacity { NumberAnimation { duration: Ui.normal } }

    Keys.onPressed: (event) => { if (Ui.isBackKey(event.key)) { dialog.close(); event.accepted = true } }

    Rectangle {
        anchors.fill: parent
        color: Qt.rgba(0.02, 0.02, 0.04, 0.62)
        MouseArea { anchors.fill: parent; onClicked: dialog.close() }
    }

    GlassPanel {
        id: card
        backdrop: dialog.backdrop
        anchors.centerIn: parent
        width: Math.min(Ui.px(480), dialog.width - Ui.px(40))
        height: col.implicitHeight + Ui.px(64)
        radius: Ui.px(30)
        glow: true
        glowColor: dialog.tone
        glowStrength: 0.45
        scale: dialog.visible ? 1 : 0.92
        Behavior on scale { NumberAnimation { duration: Ui.normal; easing.type: Easing.OutBack } }
        MouseArea { anchors.fill: parent } // swallow clicks

        Column {
            id: col
            anchors.centerIn: parent
            width: parent.width - Ui.px(64)
            spacing: Ui.px(14)
            Rectangle {
                anchors.horizontalCenter: parent.horizontalCenter
                width: Ui.px(64); height: width; radius: width / 2
                color: Qt.rgba(dialog.tone.r, dialog.tone.g, dialog.tone.b, 0.18)
                Icon { anchors.centerIn: parent; name: dialog.iconName; size: Ui.px(28); color: dialog.tone }
            }
            Text {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                text: dialog.title
                color: Ui.text
                font.family: Ui.fontFamily
                font.pixelSize: Ui.px(24)
                font.weight: Font.DemiBold
            }
            Text {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
                text: dialog.message
                color: Ui.textDim
                font.family: Ui.fontFamily
                font.pixelSize: Ui.px(15)
            }
            Item { width: 1; height: Ui.px(6) }
            Row {
                anchors.horizontalCenter: parent.horizontalCenter
                spacing: Ui.px(12)
                OposButton {
                    id: cancelBtn
                    text: "Cancel"
                    variant: "glass"
                    implicitWidth: Ui.px(150)
                    navRight: confirmBtn
                    onClicked: dialog.close()
                }
                OposButton {
                    id: confirmBtn
                    text: dialog.confirmText
                    iconName: dialog.iconName
                    variant: "danger"
                    implicitWidth: Ui.px(170)
                    navLeft: cancelBtn
                    onClicked: {
                        const fn = dialog.onConfirm
                        dialog.close()
                        if (fn) fn()
                    }
                }
            }
        }
    }
}
