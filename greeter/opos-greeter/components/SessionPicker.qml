import QtQuick
import QtQuick.Controls

/** Minimal session dropdown over SDDM's sessionModel. */
FocusScope {
    id: picker
    property var model
    property int currentIndex: 0
    property Item backdrop
    readonly property string currentName: mirror.count > currentIndex && currentIndex >= 0 && mirror.itemAt(currentIndex) ? mirror.itemAt(currentIndex).sessionName : "Session"

    property Item navUp: null
    property Item navDown: null
    property Item navLeft: null
    property Item navRight: null
    function activate() { popup.open() }

    activeFocusOnTab: true
    implicitHeight: Ui.px(44)
    implicitWidth: button.implicitWidth

    // Hidden mirror so we can read session names by index.
    Repeater {
        id: mirror
        model: picker.model
        delegate: Item {
            required property string name
            readonly property string sessionName: name
        }
    }

    OposButton {
        id: button
        anchors.fill: parent
        focus: true
        text: picker.currentName
        iconName: "layers"
        variant: "glass"
        fontSize: Ui.px(14)
        iconSize: Ui.px(17)
        navUp: picker.navUp
        navDown: picker.navDown
        navLeft: picker.navLeft
        navRight: picker.navRight
        onClicked: popup.open()
        trailingIconName: "chevron-down"
    }

    Popup {
        id: popup
        parent: Overlay.overlay
        modal: true
        focus: true
        padding: Ui.px(8)
        x: Math.round((parent.width - width) / 2)
        y: Math.round((parent.height - height) / 2)
        width: Math.min(Ui.px(380), parent.width - Ui.px(32))
        height: Math.min(list.contentHeight + Ui.px(70), parent.height * 0.7)
        closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
        Overlay.modal: Rectangle { color: Qt.rgba(0.02, 0.02, 0.04, 0.55) }
        onOpened: { list.currentIndex = picker.currentIndex; list.forceActiveFocus() }
        onClosed: button.forceActiveFocus()

        enter: Transition { ParallelAnimation {
            NumberAnimation { property: "opacity"; from: 0; to: 1; duration: Ui.normal }
            NumberAnimation { property: "scale"; from: 0.94; to: 1; duration: Ui.normal; easing.type: Easing.OutCubic }
        } }
        exit: Transition { NumberAnimation { property: "opacity"; to: 0; duration: Ui.fast } }

        background: GlassPanel {
            backdrop: picker.backdrop
            radius: Ui.px(22)
            glow: true
            glowStrength: 0.35
        }

        contentItem: Column {
            spacing: Ui.px(6)
            Text {
                text: "Choose a session"
                color: Ui.textDim
                font.family: Ui.fontFamily
                font.pixelSize: Ui.px(12)
                font.weight: Font.DemiBold
                font.letterSpacing: Ui.px(2)
                font.capitalization: Font.AllUppercase
                leftPadding: Ui.px(14)
                topPadding: Ui.px(8)
                bottomPadding: Ui.px(4)
            }
            ListView {
                id: list
                width: parent.width
                height: Math.min(contentHeight, popup.height - Ui.px(60))
                clip: true
                model: picker.model
                keyNavigationEnabled: true
                boundsBehavior: Flickable.StopAtBounds
                Keys.onPressed: (event) => {
                    Ui.noteKey(event.key, false)
                    if (Ui.isActivateKey(event.key)) { picker.currentIndex = currentIndex; popup.close(); event.accepted = true }
                    else if (Ui.isBackKey(event.key)) { popup.close(); event.accepted = true }
                }
                delegate: Rectangle {
                    id: row
                    required property int index
                    required property string name
                    required property string comment
                    readonly property bool selected: index === picker.currentIndex
                    readonly property bool highlighted: ListView.isCurrentItem
                    width: ListView.view.width
                    height: Ui.px(comment ? 60 : 48)
                    radius: Ui.px(14)
                    color: highlighted ? Qt.rgba(Ui.accent.r, Ui.accent.g, Ui.accent.b, Ui.tv ? 0.35 : 0.2) : rowMouse.containsMouse ? Qt.rgba(1, 1, 1, 0.07) : "transparent"
                    border.width: highlighted && (Ui.tv || Ui.keyboardNav) ? 2 : 0
                    border.color: Ui.accent
                    scale: highlighted && Ui.tv ? 1.03 : 1
                    Behavior on scale { NumberAnimation { duration: Ui.fast } }
                    Column {
                        anchors.left: parent.left
                        anchors.leftMargin: Ui.px(14)
                        anchors.right: check.left
                        anchors.verticalCenter: parent.verticalCenter
                        Text { text: row.name; color: Ui.text; font.family: Ui.fontFamily; font.pixelSize: Ui.px(15); font.weight: Font.DemiBold; elide: Text.ElideRight; width: parent.width }
                        Text { visible: row.comment !== ""; text: row.comment; color: Ui.textFaint; font.family: Ui.fontFamily; font.pixelSize: Ui.px(12); elide: Text.ElideRight; width: parent.width }
                    }
                    Icon { id: check; name: "check"; size: Ui.px(18); color: Ui.accent; visible: row.selected; anchors.right: parent.right; anchors.rightMargin: Ui.px(14); anchors.verticalCenter: parent.verticalCenter }
                    MouseArea {
                        id: rowMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Ui.tv ? Qt.BlankCursor : Qt.PointingHandCursor
                        onClicked: { picker.currentIndex = row.index; popup.close() }
                    }
                }
            }
        }
    }
}
