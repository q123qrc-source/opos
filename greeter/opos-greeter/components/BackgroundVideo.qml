import QtQuick
import QtMultimedia

/** Aerial video backdrop. Loaded through a Loader so a missing QtMultimedia never breaks the greeter. */
Item {
    id: root
    property url source
    signal failed()

    MediaPlayer {
        id: player
        source: root.source
        loops: MediaPlayer.Infinite
        videoOutput: output
        audioOutput: null
        onErrorOccurred: root.failed()
        Component.onCompleted: play()
    }
    VideoOutput {
        id: output
        anchors.fill: parent
        fillMode: VideoOutput.PreserveAspectCrop
    }
}
