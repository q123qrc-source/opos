import QtQuick

/** Backdrop selector: OPOS aurora (default), still image, or aerial video loop. */
Item {
    id: bg
    property string source: "aurora"
    property real dim: 0.35
    property bool animate: true

    readonly property url resolved: (source === "" || source === "aurora") ? "" :
        (source.startsWith("/") ? "file://" + source : (source.indexOf("://") > 0 ? source : Qt.resolvedUrl("../" + source)))
    readonly property bool isVideo: /\.(mp4|webm|mov|mkv|m4v)$/i.test(source)
    property bool mediaFailed: false
    readonly property bool useAurora: resolved === "" || mediaFailed

    AuroraBackground {
        anchors.fill: parent
        visible: bg.useAurora || image.status !== Image.Ready && !bg.isVideo
        animate: bg.animate && visible
    }

    Image {
        id: image
        anchors.fill: parent
        visible: !bg.useAurora && !bg.isVideo
        source: !bg.useAurora && !bg.isVideo ? bg.resolved : ""
        fillMode: Image.PreserveAspectCrop
        asynchronous: true
        cache: false
        onStatusChanged: if (status === Image.Error) bg.mediaFailed = true
    }

    Loader {
        anchors.fill: parent
        active: !bg.useAurora && bg.isVideo
        source: "BackgroundVideo.qml"
        onLoaded: {
            item.source = bg.resolved
            item.failed.connect(() => bg.mediaFailed = true)
        }
        onStatusChanged: if (status === Loader.Error) bg.mediaFailed = true
    }

    Rectangle {
        anchors.fill: parent
        visible: !bg.useAurora
        color: Ui.base
        opacity: bg.dim
    }
}
