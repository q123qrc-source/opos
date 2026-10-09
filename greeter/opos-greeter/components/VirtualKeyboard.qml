import QtQuick
import QtQuick.VirtualKeyboard

/*
 * On-screen keyboard (Qt Virtual Keyboard). Loaded through a Loader: if the module is missing,
 * the greeter still works and the keyboard toggle hides itself. Requires SDDM's
 * InputMethod=qtvirtualkeyboard (set by install-greeter.sh).
 */
InputPanel {
    id: panel
    property bool shown: false
    width: parent ? parent.width : 0
    y: shown && active ? (parent ? parent.height - height : 0) : (parent ? parent.height : 0)
    visible: y < (parent ? parent.height : 0)
    Behavior on y { NumberAnimation { duration: 260; easing.type: Easing.OutCubic } }
}
