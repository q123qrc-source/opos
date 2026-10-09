import QtQuick

/*
 * Universal OPOS button: works with mouse (hover + ripple), touch (large targets) and
 * D-pad (scale + electric glow in TV mode). Declare navUp/navDown/navLeft/navRight to wire
 * 2D navigation.
 */
FocusScope {
    id: button

    property string text: ""
    property string iconName: ""
    property string trailingIconName: ""
    property string variant: "glass"      // glass | accent | ghost | danger
    property real radius: height / 2
    property real iconSize: Ui.px(20)
    property real fontSize: Ui.px(15)
    property real padding: Ui.px(18)
    property bool round: text === ""      // icon-only circular button
    property string tooltip: ""
    /** Whether pointer presses move keyboard focus onto the button. */
    property bool takesFocus: true

    property Item navUp: null
    property Item navDown: null
    property Item navLeft: null
    property Item navRight: null

    signal clicked()
    function activate() { if (enabled) { ripple.burst(width / 2, height / 2); clicked() } }

    activeFocusOnTab: true
    implicitHeight: Ui.px(48)
    implicitWidth: round ? implicitHeight : row.implicitWidth + padding * 2
    opacity: enabled ? 1 : 0.4

    scale: (activeFocus && Ui.tv) ? 1.1 : (mouse.pressed ? 0.96 : 1.0)
    Behavior on scale { NumberAnimation { duration: Ui.fast; easing.type: Easing.OutBack } }

    Keys.onPressed: (event) => Ui.handleKey(event, button, false)

    readonly property bool hovered: mouse.containsMouse && !Ui.tv && !Ui.touch

    FocusGlow { radius: button.radius }

    Rectangle {
        id: bg
        anchors.fill: parent
        radius: button.radius
        color: {
            switch (button.variant) {
            case "accent": return button.hovered ? Qt.lighter(Ui.accent, 1.12) : Ui.accent
            case "danger": return button.hovered ? Qt.rgba(1, 0.42, 0.5, 0.32) : Qt.rgba(1, 0.42, 0.5, 0.2)
            case "ghost": return button.hovered || button.activeFocus ? Qt.rgba(1, 1, 1, 0.1) : "transparent"
            default: return button.hovered || (button.activeFocus && Ui.tv) ? Qt.rgba(1, 1, 1, 0.16) : Qt.rgba(1, 1, 1, 0.07)
            }
        }
        border.width: button.variant === "glass" ? 1 : 0
        border.color: Qt.rgba(1, 1, 1, 0.1)
        Behavior on color { ColorAnimation { duration: Ui.fast } }

        Ripple {
            id: ripple
            color: button.variant === "accent" ? Qt.rgba(1, 1, 1, 0.45) : Qt.rgba(1, 1, 1, 0.22)
            radius: button.radius
        }
    }

    Row {
        id: row
        anchors.centerIn: parent
        spacing: Ui.px(8)
        Icon {
            visible: button.iconName !== ""
            name: button.iconName
            size: button.iconSize
            color: button.variant === "accent" ? "#0a0a0f" : button.variant === "danger" ? Ui.danger : Ui.text
            anchors.verticalCenter: parent.verticalCenter
        }
        Text {
            visible: button.text !== ""
            text: button.text
            color: button.variant === "accent" ? "#0a0a0f" : button.variant === "danger" ? Ui.danger : Ui.text
            font.family: Ui.fontFamily
            font.pixelSize: button.fontSize
            font.weight: Font.DemiBold
            anchors.verticalCenter: parent.verticalCenter
        }
        Icon {
            visible: button.trailingIconName !== ""
            name: button.trailingIconName
            size: button.iconSize * 0.8
            color: Ui.textDim
            anchors.verticalCenter: parent.verticalCenter
        }
    }

    MouseArea {
        id: mouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Ui.tv ? Qt.BlankCursor : Qt.PointingHandCursor
        onPressed: (m) => { if (button.takesFocus) button.forceActiveFocus(Qt.MouseFocusReason); ripple.burst(m.x, m.y) }
        onClicked: if (button.enabled) button.clicked()
    }

    ToolTipBubble {
        text: button.tooltip
        shown: button.tooltip !== "" && button.hovered
    }
}
