#!/usr/bin/env bash
# Deploy the rules and indexes this app needs — from the one folder that has them.
#
#   bash ~/CloutyKey/SuperMap/Documents/SuperMap/scripts/deploy-firebase.sh
#
# Three things trip the CLI up, so this script handles all of them:
#   - it has to run inside the folder holding firebase.json and .firebaserc;
#   - the project name is read with sed, because that folder is an ES module
#     package and `require('./.firebaserc')` tries to load it as JavaScript;
#   - the deploy targets are one argument, with no spaces after the commas.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$HERE/../SuperMap"
cd "$PROJECT_DIR"

if [ ! -f firebase.json ] || [ ! -f .firebaserc ]; then
  echo "This does not look like the Firebase folder: $PROJECT_DIR" >&2
  exit 1
fi

PROJECT="$(sed -n 's/.*"default"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' .firebaserc | head -1)"
if [ -z "$PROJECT" ]; then
  echo "Could not read the project name from .firebaserc" >&2
  exit 1
fi

if command -v firebase >/dev/null 2>&1; then
  FB=(firebase)
else
  FB=(npx --yes firebase-tools@latest)
fi

echo "Folder:  $PROJECT_DIR"
echo "Project: $PROJECT"
echo "Targets: --only firestore:rules,firestore:indexes,storage"
echo

set -x
"${FB[@]}" deploy --only firestore:rules,firestore:indexes,storage --project "$PROJECT" --non-interactive
set +x

echo
echo "Done. Check Firestore -> Indexes until the 'cases' index reads Enabled,"
echo "and Storage -> Rules for chat_media and secure_drops."
