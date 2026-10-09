import QtQuick

/*
 * Avatar carousel over SDDM's userModel. Mouse: click / arrows. Touch: swipe. D-pad: ◀ ▶.
 * Exposes the current user's login name, display name and avatar.
 */
FocusScope {
    id: selector
    property var model
    property alias currentIndex: list.currentIndex
    readonly property string userName: list.currentItem ? list.currentItem.userName : ""
    readonly property string displayName: list.currentItem ? (list.currentItem.displayName || list.currentItem.userName) : ""
    readonly property bool needsPassword: list.currentItem ? list.currentItem.needsPass : true
    readonly property int count: list.count
    property int lastIndex: -1

    property Item navUp: null
    property Item navDown: null
    property Item navLeft: null
    property Item navRight: null
    signal activated()
    function activate() { activated() }

    activeFocusOnTab: true
    implicitHeight: Ui.px(170)
    implicitWidth: Ui.px(420)

    Keys.onPressed: (event) => {
        if (event.key === Qt.Key_Left && list.currentIndex > 0) {
            Ui.noteKey(event.key, false)
            list.decrementCurrentIndex(); event.accepted = true; return
        }
        if (event.key === Qt.Key_Right && list.currentIndex < list.count - 1) {
            Ui.noteKey(event.key, false)
            list.incrementCurrentIndex(); event.accepted = true; return
        }
        Ui.handleKey(event, selector, false)
    }

    ListView {
        id: list
        anchors.fill: parent
        orientation: ListView.Horizontal
        model: selector.model
        clip: false
        interactive: count > 1
        spacing: Ui.px(14)
        highlightRangeMode: ListView.StrictlyEnforceRange
        preferredHighlightBegin: width / 2 - Ui.px(70)
        preferredHighlightEnd: width / 2 + Ui.px(70)
        highlightMoveDuration: Ui.normal
        boundsBehavior: Flickable.StopAtBounds
        keyNavigationEnabled: false

        delegate: Item {
            id: cell
            required property int index
            required property string name
            required property string realName
            required property string icon
            required property bool needsPassword
            readonly property string userName: name
            readonly property string displayName: realName
            readonly property bool needsPass: needsPassword
            readonly property bool current: ListView.isCurrentItem
            width: Ui.px(140)
            height: list.height

            Avatar {
                anchors.centerIn: parent
                anchors.verticalCenterOffset: -Ui.px(4)
                size: cell.current ? Ui.px(128) : Ui.px(84)
                name: cell.realName || cell.name
                source: cell.icon
                active: cell.current
                opacity: cell.current ? 1 : 0.45
                scale: cell.current && selector.activeFocus && Ui.tv ? 1.08 : 1
                Behavior on size { NumberAnimation { duration: Ui.normal; easing.type: Easing.OutCubic } }
                Behavior on opacity { NumberAnimation { duration: Ui.normal } }
                Behavior on scale { NumberAnimation { duration: Ui.fast; easing.type: Easing.OutBack } }
            }
            MouseArea {
                anchors.fill: parent
                cursorShape: Ui.tv ? Qt.BlankCursor : Qt.PointingHandCursor
                onClicked: {
                    list.currentIndex = cell.index
                    selector.forceActiveFocus(Qt.MouseFocusReason)
                }
            }
        }
    }

    // carousel arrows (desktop/touch)
    OposButton {
        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        iconName: "chevron-left"
        variant: "ghost"
        implicitHeight: Ui.px(40)
        activeFocusOnTab: false
        takesFocus: false
        visible: list.count > 1 && !Ui.tv
        enabled: list.currentIndex > 0
        onClicked: list.decrementCurrentIndex()
    }
    OposButton {
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        iconName: "chevron-right"
        variant: "ghost"
        implicitHeight: Ui.px(40)
        activeFocusOnTab: false
        takesFocus: false
        visible: list.count > 1 && !Ui.tv
        enabled: list.currentIndex < list.count - 1
        onClicked: list.incrementCurrentIndex()
    }

    // TV focus indicator around the current avatar
    Rectangle {
        anchors.centerIn: parent
        anchors.verticalCenterOffset: -Ui.px(4)
        width: Ui.px(156)
        height: width
        radius: width / 2
        color: "transparent"
        border.width: Ui.px(3)
        border.color: Ui.accent3
        opacity: selector.activeFocus && (Ui.tv || Ui.keyboardNav) ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: Ui.fast } }
    }

    Component.onCompleted: if (lastIndex >= 0 && lastIndex < list.count) list.currentIndex = lastIndex
}
