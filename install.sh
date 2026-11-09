#!/bin/bash
# Installs the native helper for the Profile Switcher extension.
# Copies host.py out of ~/Documents (Chrome may not be allowed to run files
# there) and registers it with Chrome. Re-run after editing host/host.py.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_ID="aklnhhcndpmbcflhafohkcocepmdepao"   # fixed by the "key" in extension/manifest.json
HOST_NAME="com.valentin.profile_switcher"
INSTALL_DIR="$HOME/.chrome-profile-switcher"
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

# Use a system-wide python, never whatever virtualenv happens to be active.
PY=""
for c in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
  if [ -x "$c" ]; then PY="$c"; break; fi
done
if [ -z "$PY" ]; then echo "python3 not found" >&2; exit 1; fi

mkdir -p "$INSTALL_DIR" "$MANIFEST_DIR"
cp "$DIR/host/host.py" "$INSTALL_DIR/host.py"

cat > "$INSTALL_DIR/run-host.sh" <<EOF
#!/bin/bash
exec "$PY" "$INSTALL_DIR/host.py" "\$@"
EOF
chmod +x "$INSTALL_DIR/run-host.sh"

cat > "$MANIFEST_DIR/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Profile Switcher helper",
  "path": "$INSTALL_DIR/run-host.sh",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF

echo "Installed helper to $INSTALL_DIR"
echo "Registered $MANIFEST_DIR/$HOST_NAME.json"
echo "Extension ID: $EXT_ID"
