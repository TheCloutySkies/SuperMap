#!/bin/bash
# Optional: Install the situational-awareness API to start automatically when you log in (macOS).
# Run once from the project root:   ./scripts/install-api-on-login.sh
# To remove: launchctl unload ~/Library/LaunchAgents/com.supermap.api.plist

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$ROOT/situational-awareness-api"
NODE="$(command -v node 2>/dev/null || true)"

if [ -z "$NODE" ]; then
  echo "Node.js not found. Install Node first (e.g. from nodejs.org)."
  exit 1
fi

PLIST="$HOME/Library/LaunchAgents/com.supermap.api.plist"
mkdir -p "$(dirname "$PLIST")"

cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.supermap.api</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$API_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$API_DIR/log.out</string>
  <key>StandardErrorPath</key>
  <string>$API_DIR/log.err</string>
</dict>
</plist>
EOF

launchctl load "$PLIST"
echo "API will start at login. It's running now on port 3001."
echo "To stop: launchctl unload $PLIST"
echo "To start the app, run from project root: npm run dev   (or double-click Start-SuperMap.command)"
