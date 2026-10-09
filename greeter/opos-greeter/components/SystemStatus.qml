import QtQuick

/*
 * Reads real battery and Wi-Fi state from sysfs/procfs. SDDM exposes no such API, so this uses
 * synchronous file:// XMLHttpRequests, which Qt only permits when the greeter runs with
 * QML_XHR_ALLOW_FILE_READ=1 (install-greeter.sh adds it to GreeterEnvironment). Without it the
 * pills degrade gracefully to "unknown".
 */
QtObject {
    id: status

    property bool batteryPresent: false
    property int batteryLevel: -1
    property bool charging: false
    property string network: "unknown"   // wifi | wired | offline | unknown
    property int wifiQuality: 0           // 0–100
    property string wifiInterface: ""

    readonly property var batteryNames: ["BAT0", "BAT1", "BAT2", "BATT", "CMB0", "CMB1"]
    readonly property var wiredNames: ["eth0", "eth1", "eno1", "enp0s3", "enp0s25", "enp1s0", "enp2s0", "enp3s0", "end0"]

    function read(path) {
        try {
            const xhr = new XMLHttpRequest()
            xhr.open("GET", "file://" + path, false)
            xhr.send()
            if ((xhr.status === 200 || xhr.status === 0) && xhr.responseText !== undefined)
                return xhr.responseText.trim()
        } catch (e) {
        }
        return ""
    }

    /** false when file reads are blocked (QML_XHR_ALLOW_FILE_READ unset): stop polling quietly. */
    property bool available: true

    function refresh() {
        if (read("/proc/uptime") === "") {
            available = false
            network = "unknown"
            batteryPresent = false
            poll.stop()
            return
        }
        // Battery
        let found = false
        for (const name of batteryNames) {
            const cap = read("/sys/class/power_supply/" + name + "/capacity")
            if (cap !== "" && !isNaN(parseInt(cap))) {
                batteryLevel = parseInt(cap)
                const st = read("/sys/class/power_supply/" + name + "/status")
                charging = st === "Charging" || st === "Full"
                found = true
                break
            }
        }
        batteryPresent = found

        // Wi-Fi via /proc/net/wireless (one line per wireless interface)
        const wl = read("/proc/net/wireless")
        let wifiUp = false
        if (wl !== "") {
            const lines = wl.split("\n").slice(2)
            for (const line of lines) {
                const cols = line.trim().split(/\s+/)
                if (cols.length < 3)
                    continue
                const iface = cols[0].replace(":", "")
                const oper = read("/sys/class/net/" + iface + "/operstate")
                const link = parseFloat(cols[2])   // link quality, usually out of 70
                wifiInterface = iface
                if (oper === "up" || link > 0) {
                    wifiUp = true
                    wifiQuality = Math.max(0, Math.min(100, Math.round(link / 70 * 100)))
                }
            }
        }
        if (wifiUp) {
            network = "wifi"
            return
        }
        for (const name of wiredNames) {
            if (read("/sys/class/net/" + name + "/operstate") === "up") {
                network = "wired"
                return
            }
        }
        // We could read the files but found no link: offline. If nothing was readable at all, unknown.
        network = (wl !== "" || read("/proc/net/dev") !== "") ? "offline" : "unknown"
    }

    property Timer poll: Timer {
        id: poll
        interval: 15000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: status.refresh()
    }
}
