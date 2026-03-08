#!/bin/bash
# Double-click this file to start SuperMap (app + API). Window stays open until you close it or press Ctrl+C.

cd "$(dirname "$0")"

echo "SuperMap: starting app and API..."
echo "Open http://localhost:5173 in your browser when ready."
echo ""

npm run dev
