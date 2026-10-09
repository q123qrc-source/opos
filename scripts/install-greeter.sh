#!/usr/bin/env bash
# =============================================================================
# OPOS Greeter — SDDM theme installer (Fedora / any systemd Linux with SDDM)
#
#   sudo ./scripts/install-greeter.sh                 install theme + set it as current
#   sudo ./scripts/install-greeter.sh --install-deps  also dnf-install SDDM + Qt 6 modules
#   sudo ./scripts/install-greeter.sh --with-session  also register an "OPOS Shell" session
#   sudo ./scripts/install-greeter.sh --enable-sddm   also make SDDM the display manager
#        ./scripts/install-greeter.sh --test          preview in a window (no root, no install)
#   sudo ./scripts/install-greeter.sh --uninstall     remove theme + config
# =============================================================================
set -euo pipefail

THEME_NAME="opos-greeter"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="${REPO_ROOT}/greeter/${THEME_NAME}"
THEMES_DIR="${SDDM_THEMES_DIR:-/usr/share/sddm/themes}"
DEST_DIR="${THEMES_DIR}/${THEME_NAME}"
CONF_DIR="/etc/sddm.conf.d"
THEME_CONF="${CONF_DIR}/theme.conf"
EXTRA_CONF="${CONF_DIR}/zz-opos-greeter.conf"   # read last: input method + greeter environment
SESSION_FILE="/usr/share/wayland-sessions/opos-shell.desktop"
SESSION_BIN="/usr/local/bin/opos-session"

DNF_PACKAGES=(sddm qt6-qtdeclarative qt6-qtsvg qt6-qtvirtualkeyboard qt6-qtmultimedia rsms-inter-fonts)
GREETER_ENV="QML_XHR_ALLOW_FILE_READ=1"

INSTALL_DEPS=0 WITH_SESSION=0 ENABLE_SDDM=0 DO_TEST=0 UNINSTALL=0 SET_DEFAULT=1

# ----------------------------------------------------------------------------- ui
if [[ -t 1 ]]; then
  C_ACC=$'\e[38;5;111m' C_OK=$'\e[32m' C_WARN=$'\e[33m' C_ERR=$'\e[31m' C_DIM=$'\e[2m' C_B=$'\e[1m' C_0=$'\e[0m'
else
  C_ACC='' C_OK='' C_WARN='' C_ERR='' C_DIM='' C_B='' C_0=''
fi
step() { printf '%s==>%s %s%s%s\n' "$C_ACC" "$C_0" "$C_B" "$*" "$C_0"; }
ok()   { printf '  %s✔%s %s\n' "$C_OK" "$C_0" "$*"; }
warn() { printf '  %s!%s %s\n' "$C_WARN" "$C_0" "$*" >&2; }
die()  { printf '%s✖ %s%s\n' "$C_ERR" "$*" "$C_0" >&2; exit 1; }
info() { printf '  %s%s%s\n' "$C_DIM" "$*" "$C_0"; }

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

for arg in "$@"; do
  case "$arg" in
    --install-deps) INSTALL_DEPS=1 ;;
    --with-session) WITH_SESSION=1 ;;
    --enable-sddm) ENABLE_SDDM=1 ;;
    --no-set-default) SET_DEFAULT=0 ;;
    --test|--preview) DO_TEST=1 ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help) usage ;;
    *) die "Unknown option: $arg (see --help)" ;;
  esac
done

# ----------------------------------------------------------------------------- helpers
greeter_bin() {
  # SDDM ≥ 0.21 built against Qt 6 ships sddm-greeter-qt6; older builds only sddm-greeter (Qt 5).
  if command -v sddm-greeter-qt6 >/dev/null 2>&1; then echo sddm-greeter-qt6
  elif command -v sddm-greeter >/dev/null 2>&1; then echo sddm-greeter
  else echo ""; fi
}

qml_module_present() {
  # $1 = module path fragment, e.g. QtQuick/Effects
  local d
  for d in /usr/lib64/qt6/qml /usr/lib/qt6/qml /usr/lib/x86_64-linux-gnu/qt6/qml /usr/lib/aarch64-linux-gnu/qt6/qml; do
    [[ -d "$d/$1" ]] && return 0
  done
  return 1
}

preview_cmd() {
  local bin theme_path="$1"
  bin="$(greeter_bin)"
  [[ -n "$bin" ]] || bin="sddm-greeter-qt6"
  printf '%s QT_IM_MODULE=qtvirtualkeyboard %s --test-mode --theme %s' "$GREETER_ENV" "$bin" "$theme_path"
}

need_root() {
  if [[ $EUID -ne 0 ]]; then
    step "Root privileges required — re-running with sudo"
    exec sudo -E bash "$0" "$@"
  fi
}

backup() {
  local f="$1"
  [[ -e "$f" ]] || return 0
  cp -a "$f" "${f}.bak.$(date +%Y%m%d-%H%M%S)"
  info "backed up $f"
}

# ----------------------------------------------------------------------------- preview only
if [[ $DO_TEST -eq 1 ]]; then
  [[ -f "$SRC_DIR/Main.qml" ]] || die "Theme sources not found at $SRC_DIR"
  bin="$(greeter_bin)"
  [[ -n "$bin" ]] || die "sddm-greeter not found. Install SDDM first:  sudo dnf install ${DNF_PACKAGES[*]}"
  [[ "$bin" == "sddm-greeter" ]] && warn "Only the Qt 5 greeter was found; this theme requires Qt 6 (sddm-greeter-qt6, SDDM ≥ 0.21)."
  step "Previewing ${THEME_NAME} in a window (close it or press Ctrl+C to exit)"
  info "$(preview_cmd "$SRC_DIR")"
  QML_XHR_ALLOW_FILE_READ=1 QT_IM_MODULE=qtvirtualkeyboard exec "$bin" --test-mode --theme "$SRC_DIR"
fi

need_root "$@"

# ----------------------------------------------------------------------------- uninstall
if [[ $UNINSTALL -eq 1 ]]; then
  step "Uninstalling ${THEME_NAME}"
  rm -rf "$DEST_DIR" && ok "removed $DEST_DIR"
  if [[ -f "$THEME_CONF" ]] && grep -q "^Current=${THEME_NAME}$" "$THEME_CONF"; then
    backup "$THEME_CONF"
    sed -i "/^Current=${THEME_NAME}$/d" "$THEME_CONF"
    ok "cleared Current=${THEME_NAME} from $THEME_CONF (SDDM falls back to its default theme)"
  fi
  rm -f "$EXTRA_CONF" && ok "removed $EXTRA_CONF"
  if [[ -f "$SESSION_FILE" ]]; then rm -f "$SESSION_FILE" "$SESSION_BIN"; ok "removed OPOS Shell session"; fi
  exit 0
fi

# ----------------------------------------------------------------------------- 1. SDDM present?
step "Checking for SDDM"
if ! command -v sddm >/dev/null 2>&1 && ! rpm -q sddm >/dev/null 2>&1; then
  if [[ $INSTALL_DEPS -eq 1 ]]; then
    command -v dnf >/dev/null 2>&1 || die "dnf not found — install SDDM with your distribution's package manager."
    dnf install -y "${DNF_PACKAGES[@]}"
  else
    warn "SDDM is not installed."
    printf '\n    %ssudo dnf install %s%s\n\n' "$C_B" "${DNF_PACKAGES[*]}" "$C_0"
    info "Then make it the active display manager:"
    printf '    %ssudo systemctl disable gdm.service%s   %s# or lightdm/whatever is enabled%s\n' "$C_B" "$C_0" "$C_DIM" "$C_0"
    printf '    %ssudo systemctl enable sddm.service%s\n\n' "$C_B" "$C_0"
    info "Or re-run this script with --install-deps --enable-sddm to do it for you."
    if [[ -t 0 ]]; then
      read -r -p "  Install SDDM and the Qt 6 modules now with dnf? [y/N] " reply
      [[ "$reply" =~ ^[Yy]$ ]] || die "Aborted: SDDM is required."
      dnf install -y "${DNF_PACKAGES[@]}"
    else
      exit 1
    fi
  fi
fi
ok "SDDM $(sddm --version 2>/dev/null | head -n1 | awk '{print $NF}' || echo installed)"

bin="$(greeter_bin)"
if [[ "$bin" == "sddm-greeter-qt6" ]]; then
  ok "Qt 6 greeter available ($bin)"
else
  warn "sddm-greeter-qt6 not found. This theme declares QtVersion=6 and needs SDDM ≥ 0.21 built with Qt 6."
fi

# Optional runtime modules (the theme degrades gracefully without the optional ones)
missing=()
qml_module_present "QtQuick/Effects" || missing+=("qt6-qtdeclarative (QtQuick.Effects, Qt ≥ 6.5) — REQUIRED for glass blur")
qml_module_present "QtQuick/VirtualKeyboard" || missing+=("qt6-qtvirtualkeyboard — on-screen keyboard")
qml_module_present "QtMultimedia" || missing+=("qt6-qtmultimedia — aerial video backgrounds")
fc-list 2>/dev/null | grep -qi "Inter" || missing+=("rsms-inter-fonts — Inter typeface (falls back to system sans)")
if ((${#missing[@]})); then
  if [[ $INSTALL_DEPS -eq 1 ]] && command -v dnf >/dev/null 2>&1; then
    step "Installing optional Qt modules and fonts"
    dnf install -y qt6-qtdeclarative qt6-qtsvg qt6-qtvirtualkeyboard qt6-qtmultimedia rsms-inter-fonts || warn "Some packages failed to install"
  else
    for m in "${missing[@]}"; do warn "missing: $m"; done
    info "Install with: sudo dnf install qt6-qtdeclarative qt6-qtsvg qt6-qtvirtualkeyboard qt6-qtmultimedia rsms-inter-fonts"
  fi
fi

# ----------------------------------------------------------------------------- 2. copy theme
step "Installing theme to ${DEST_DIR}"
[[ -f "$SRC_DIR/Main.qml" && -f "$SRC_DIR/metadata.desktop" ]] || die "Theme sources not found at $SRC_DIR"
install -d -m 0755 "$THEMES_DIR"
rm -rf "${DEST_DIR}.new"
cp -r "$SRC_DIR" "${DEST_DIR}.new"
# Keep a user-edited theme.conf.user (SDDM's per-install override file) across upgrades.
[[ -f "$DEST_DIR/theme.conf.user" ]] && cp -a "$DEST_DIR/theme.conf.user" "${DEST_DIR}.new/"
rm -rf "$DEST_DIR"
mv "${DEST_DIR}.new" "$DEST_DIR"
find "$DEST_DIR" -type d -exec chmod 0755 {} +
find "$DEST_DIR" -type f -exec chmod 0644 {} +
chown -R root:root "$DEST_DIR"
command -v restorecon >/dev/null 2>&1 && restorecon -R "$DEST_DIR" || true   # SELinux labels on Fedora
ok "copied $(find "$DEST_DIR" -type f | wc -l) files"

# ----------------------------------------------------------------------------- 3. sddm config
step "Configuring SDDM"
install -d -m 0755 "$CONF_DIR"
if [[ $SET_DEFAULT -eq 1 ]]; then
  if [[ -f "$THEME_CONF" ]]; then
    backup "$THEME_CONF"
    if grep -q '^\[Theme\]' "$THEME_CONF"; then
      if awk '/^\[/{s=($0=="[Theme]")} s && /^Current=/{f=1} END{exit !f}' "$THEME_CONF"; then
        # Replace Current= inside the [Theme] section only.
        awk -v t="$THEME_NAME" '/^\[/{s=($0=="[Theme]")} s && /^Current=/{$0="Current=" t} {print}' "$THEME_CONF" >"${THEME_CONF}.tmp"
      else
        awk -v t="$THEME_NAME" '{print} /^\[Theme\]$/{print "Current=" t}' "$THEME_CONF" >"${THEME_CONF}.tmp"
      fi
      mv "${THEME_CONF}.tmp" "$THEME_CONF"
    else
      printf '\n[Theme]\nCurrent=%s\n' "$THEME_NAME" >>"$THEME_CONF"
    fi
  else
    printf '[Theme]\nCurrent=%s\n' "$THEME_NAME" >"$THEME_CONF"
  fi
  chmod 0644 "$THEME_CONF"
  ok "$THEME_CONF → Current=${THEME_NAME}"

  # Warn about later-read files that would override us (/etc/sddm.conf is read last).
  for f in "$CONF_DIR"/*.conf /etc/sddm.conf; do
    [[ -f "$f" && "$f" != "$THEME_CONF" ]] || continue
    if awk '/^\[/{s=($0=="[Theme]")} s && /^Current=/{print; exit}' "$f" | grep -qv "Current=${THEME_NAME}$"; then
      if [[ "$f" == /etc/sddm.conf || "$(basename "$f")" > "theme.conf" ]]; then
        warn "$f also sets [Theme] Current= and is read after theme.conf — it will win. Edit or remove that line."
      fi
    fi
  done
fi

# Input method (on-screen keyboard) + greeter environment for real battery/Wi-Fi status.
existing_env=""
for f in /etc/sddm.conf "$CONF_DIR"/*.conf; do
  [[ -f "$f" && "$f" != "$EXTRA_CONF" ]] || continue
  v="$(awk -F= '/^GreeterEnvironment=/{sub(/^GreeterEnvironment=/,""); print}' "$f" | tail -n1)"
  [[ -n "$v" ]] && existing_env="$v"
done
merged_env="$GREETER_ENV"
if [[ -n "$existing_env" ]]; then
  IFS=',' read -r -a parts <<<"$existing_env"
  for p in "${parts[@]}"; do [[ "$p" == QML_XHR_ALLOW_FILE_READ=* || -z "$p" ]] || merged_env+=",$p"; done
fi
backup "$EXTRA_CONF"
cat >"$EXTRA_CONF" <<EOF
# Managed by opos install-greeter.sh
[General]
# Qt Virtual Keyboard powers the greeter's on-screen keyboard toggle.
InputMethod=qtvirtualkeyboard
# Lets the theme read /sys/class/power_supply and /proc/net/wireless for the status pills.
GreeterEnvironment=${merged_env}
EOF
chmod 0644 "$EXTRA_CONF"
ok "$EXTRA_CONF → InputMethod=qtvirtualkeyboard, GreeterEnvironment=${merged_env}"

# ----------------------------------------------------------------------------- 4. optional session
if [[ $WITH_SESSION -eq 1 ]]; then
  step "Registering the 'OPOS Shell' Wayland session"
  install -m 0755 "$REPO_ROOT/greeter/session/opos-session" "$SESSION_BIN"
  install -d -m 0755 "$(dirname "$SESSION_FILE")"
  install -m 0644 "$REPO_ROOT/greeter/session/opos-shell.desktop" "$SESSION_FILE"
  command -v restorecon >/dev/null 2>&1 && restorecon "$SESSION_BIN" "$SESSION_FILE" || true
  ok "$SESSION_FILE (launches $SESSION_BIN)"
  command -v cage >/dev/null 2>&1 || warn "The session uses the 'cage' kiosk compositor: sudo dnf install cage"
  info "Point OPOS_DIR in $SESSION_BIN at your OPOS Shell build (default /opt/opos-shell)."
fi

# ----------------------------------------------------------------------------- 5. display manager
active_dm=""
if [[ -L /etc/systemd/system/display-manager.service ]]; then
  active_dm="$(basename "$(readlink -f /etc/systemd/system/display-manager.service)")"
fi
if [[ $ENABLE_SDDM -eq 1 && "$active_dm" != "sddm.service" ]]; then
  step "Switching the display manager to SDDM"
  if [[ -n "$active_dm" ]]; then systemctl disable "$active_dm" || true; fi
  systemctl enable sddm.service
  ok "sddm.service enabled (takes effect on next boot)"
elif [[ "$active_dm" != "sddm.service" ]]; then
  if [[ -n "$active_dm" ]]; then
    warn "Active display manager is ${active_dm}. Switch with: sudo systemctl disable ${active_dm} && sudo systemctl enable sddm.service"
  else
    warn "No display manager is enabled. Enable SDDM with: sudo systemctl enable sddm.service"
  fi
fi

# ----------------------------------------------------------------------------- done
step "Done"
printf '\n  Preview without logging out:\n\n    %s%s%s\n\n' "$C_B" "$(preview_cmd "$DEST_DIR")" "$C_0"
info "Or from the repo, without installing:  ./scripts/install-greeter.sh --test"
info "Apply for real: reboot, or 'sudo systemctl restart sddm' (this ends graphical sessions)."
