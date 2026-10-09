#!/usr/bin/env python3
"""
Preview the OPOS greeter WITHOUT SDDM, using PySide6 and mocked SDDM context objects.
Useful on non-Fedora dev machines or for iterating on QML.

    python3 -m venv .venv && .venv/bin/pip install PySide6
    QML_XHR_ALLOW_FILE_READ=1 QT_IM_MODULE=qtvirtualkeyboard .venv/bin/python scripts/preview-greeter-mock.py [WxH]

Mock login: password "opos" succeeds, anything else fails.
"""
import os
import sys

from PySide6.QtCore import Property, QByteArray, QObject, Qt, QTimer, QUrl, Signal, Slot
from PySide6.QtGui import QGuiApplication, QStandardItem, QStandardItemModel
from PySide6.QtQml import QQmlPropertyMap
from PySide6.QtQuick import QQuickView

THEME = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "greeter", "opos-greeter")


class Sddm(QObject):
    loginFailed = Signal()
    loginSucceeded = Signal()
    hostName = Property(str, lambda self: os.uname().nodename, constant=True)
    canPowerOff = Property(bool, lambda self: True, constant=True)
    canReboot = Property(bool, lambda self: True, constant=True)
    canSuspend = Property(bool, lambda self: True, constant=True)
    canHibernate = Property(bool, lambda self: False, constant=True)

    @Slot(str, str, int)
    def login(self, user, password, session):
        print(f"login(user={user!r}, session={session})")
        QTimer.singleShot(500, self.loginSucceeded.emit if password == "opos" else self.loginFailed.emit)

    @Slot()
    def powerOff(self): print("powerOff()")

    @Slot()
    def reboot(self): print("reboot()")

    @Slot()
    def suspend(self): print("suspend()")


class Model(QStandardItemModel):
    def __init__(self, roles, rows, last=0):
        super().__init__()
        self._roles = {Qt.UserRole + i + 1: QByteArray(r.encode()) for i, r in enumerate(roles)}
        self._last = last
        for row in rows:
            item = QStandardItem()
            for i, r in enumerate(roles):
                item.setData(row[r], Qt.UserRole + i + 1)
            self.appendRow(item)

    def roleNames(self):
        return self._roles

    count = Property(int, lambda self: self.rowCount(), constant=True)
    lastIndex = Property(int, lambda self: self._last, constant=True)


class Keyboard(QObject):
    changed = Signal()
    capsLock = Property(bool, lambda self: False, notify=changed)
    numLock = Property(bool, lambda self: True, notify=changed)


def main():
    size = (sys.argv[1] if len(sys.argv) > 1 else "1600x900").split("x")
    app = QGuiApplication(sys.argv)
    user_roles = ["name", "realName", "icon", "homeDir", "needsPassword"]
    users = Model(user_roles, [
        {"name": os.environ.get("USER", "guest"), "realName": "OPOS User", "icon": "", "homeDir": os.path.expanduser("~"), "needsPassword": True},
        {"name": "ada", "realName": "Ada Lovelace", "icon": "", "homeDir": "/home/ada", "needsPassword": True},
    ])
    sessions = Model(["name", "comment", "file"], [
        {"name": "OPOS Shell", "comment": "Convergence shell for TV, mobile and desktop", "file": "opos-shell.desktop"},
        {"name": "GNOME", "comment": "This session logs you into GNOME", "file": "gnome.desktop"},
        {"name": "Plasma (Wayland)", "comment": "Plasma by KDE", "file": "plasma.desktop"},
    ])
    config = QQmlPropertyMap()
    for line in open(os.path.join(THEME, "theme.conf"), encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith(("#", "[")) and "=" in line:
            key, value = line.split("=", 1)
            config.insert(key.strip(), value.strip())

    sddm, keyboard = Sddm(), Keyboard()
    view = QQuickView()
    for name, obj in (("sddm", sddm), ("userModel", users), ("sessionModel", sessions), ("keyboard", keyboard), ("config", config)):
        view.rootContext().setContextProperty(name, obj)
    view.setResizeMode(QQuickView.SizeRootObjectToView)
    view.setSource(QUrl.fromLocalFile(os.path.join(THEME, "Main.qml")))
    if view.errors():
        for err in view.errors():
            print(err.toString(), file=sys.stderr)
        return 1
    view.resize(int(size[0]), int(size[1]))
    view.setTitle("OPOS Greeter — mock preview")
    view.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
