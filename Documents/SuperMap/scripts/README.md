# SuperMap scripts

## Start API at login (macOS, optional)

If you want the situational-awareness API to start automatically when you log in (so search/feeds work as soon as you open the app):

```bash
# From the project root (folder that contains SuperMap and situational-awareness-api)
chmod +x scripts/install-api-on-login.sh
./scripts/install-api-on-login.sh
```

After this, the API runs in the background at login. You only need to start the app (e.g. double-click **Start-SuperMap.command** or run `npm run dev`).

To remove: `launchctl unload ~/Library/LaunchAgents/com.supermap.api.plist`
