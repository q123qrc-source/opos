/**
 * KWin bridge: exports org.opos.Shell on the session bus, loads opos-wm.js into KWin and keeps the
 * live window list. Commands are delivered to the script through a D-Bus long poll.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { EventEmitter } = require('events');
const { dbus, sessionBus, iface, withTimeout } = require('../dbus.cjs');

const SERVICE = 'org.opos.Shell';
const OBJECT = '/org/opos/Shell';
const SCRIPT_NAME = 'opos-wm';

class KWinBridge extends EventEmitter {
  constructor() {
    super();
    this.available = false;
    this.windows = [];
    this.screen = null;
    this.queue = [];
    this.waiter = null;
    this.kwinVersion = 0;
  }

  async start() {
    try {
      return await this.startInner();
    } catch (e) {
      console.warn('[OPOS] KWin integration failed:', e.message);
      return false;
    }
  }

  async startInner() {
    const bus = sessionBus();
    if (!bus) return false;
    const kwin = await iface(bus, 'org.kde.KWin', '/Scripting', 'org.kde.kwin.Scripting');
    if (!kwin) {
      console.warn('[OPOS] KWin scripting not available — window management disabled');
      return false;
    }

    const bridge = this;
    const { Interface } = dbus.interface;
    class ShellIface extends Interface {
      Event(json) {
        try {
          bridge.onEvent(JSON.parse(json));
        } catch (e) {
          console.warn('[OPOS] bad KWin event', e.message);
        }
      }
      NextCommands() {
        return bridge.nextCommands();
      }
      // Hook for kwinrc [ModifierOnlyShortcuts] Meta=org.opos.Shell,/org/opos/Shell,org.opos.Shell,ToggleStart
      ToggleStart() {
        bridge.emit('shortcut', 'start');
      }
    }
    ShellIface.configureMembers({
      methods: {
        Event: { inSignature: 's', outSignature: '' },
        NextCommands: { inSignature: '', outSignature: 's' },
        ToggleStart: { inSignature: '', outSignature: '' },
      },
    });

    const reply = await withTimeout(bus.requestName(SERVICE, 4 /* DBUS_NAME_FLAG_DO_NOT_QUEUE */));
    if (reply !== 1 && reply !== 4) {
      console.warn('[OPOS] org.opos.Shell already owned (another OPOS instance?)');
      return false;
    }
    bus.export(OBJECT, new ShellIface(SERVICE));

    // The script must live on disk for KWin; copy it out of an asar archive if packaged.
    let scriptPath = path.join(__dirname, 'opos-wm.js');
    if (scriptPath.includes('.asar')) {
      const tmp = path.join(os.tmpdir(), `opos-wm-${process.pid}.js`);
      fs.writeFileSync(tmp, fs.readFileSync(scriptPath));
      scriptPath = tmp;
    }
    try {
      if (await withTimeout(kwin.isScriptLoaded(SCRIPT_NAME), 1500)) await withTimeout(kwin.unloadScript(SCRIPT_NAME), 1500);
    } catch {
      /* isScriptLoaded missing on very old KWin */
    }
    // loadScript is overloaded (s / ss); call the two-argument form explicitly.
    const loaded = await withTimeout(
      bus.call(
        new dbus.Message({ destination: 'org.kde.KWin', path: '/Scripting', interface: 'org.kde.kwin.Scripting', member: 'loadScript', signature: 'ss', body: [scriptPath, SCRIPT_NAME] }),
      ),
    );
    const id = loaded.body[0];
    if (id < 0) {
      console.warn('[OPOS] KWin refused to load', scriptPath);
      return false;
    }
    await withTimeout(kwin.start());
    this.available = true;
    this.watchTabletMode(bus).catch(() => {});
    console.log(`[OPOS] KWin window management active (script id ${id})`);
    return true;
  }

  async watchTabletMode(bus) {
    const obj = await bus.getProxyObject('org.kde.KWin', '/org/kde/KWin');
    const tablet = obj.getInterface('org.kde.KWin.TabletModeManager');
    const propsIface = obj.getInterface('org.freedesktop.DBus.Properties');
    const read = async () => (await propsIface.Get('org.kde.KWin.TabletModeManager', 'tabletMode')).value;
    this.tabletMode = await read();
    tablet.on('tabletModeChanged', (v) => {
      this.tabletMode = v;
      this.emit('tabletMode', v);
    });
  }

  onEvent(e) {
    switch (e.type) {
      case 'windows':
        if (process.env.OPOS_DEBUG) console.log('[OPOS:kwin] windows', JSON.stringify(e.data.windows.map((w) => [w.caption, w.surface, w.x, w.y, w.w, w.h, w.minimized ? 'min' : ''])));
        this.windows = e.data.windows;
        this.screen = e.data.screen;
        this.emit('windows', this.windows, this.screen);
        break;
      case 'hello':
        this.kwinVersion = e.data.kwin;
        this.emit('ready');
        break;
      case 'pointer':
        this.emit('pointer');
        break;
      case 'shortcut':
        this.emit('shortcut', e.data);
        break;
      case 'screens':
        this.emit('screens');
        break;
      case 'error':
        console.warn('[OPOS] KWin script error:', e.data);
        break;
    }
  }

  nextCommands() {
    if (this.queue.length) return Promise.resolve(JSON.stringify(this.queue.splice(0)));
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.waiter && this.waiter.resolve === resolve) this.waiter = null;
        resolve('[]');
      }, 20000); // below Qt's 25 s default D-Bus timeout
      this.waiter = { resolve, timer };
    });
  }

  command(op, args = {}) {
    this.queue.push({ op, ...args });
    if (this.waiter) {
      const { resolve, timer } = this.waiter;
      this.waiter = null;
      clearTimeout(timer);
      resolve(JSON.stringify(this.queue.splice(0)));
    }
  }
}

module.exports = { KWinBridge };
