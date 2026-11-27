#!/usr/bin/env bash
# Deploy the rules and indexes this app needs — from the one folder that has them.
#
#   bash ~/CloutyKey/SuperMap/Documents/SuperMap/scripts/deploy-firebase.sh
#
# The CLI has to run inside the folder that holds firebase.json and .firebaserc;
# from anywhere else `firebase use` says "must be run from a Firebase project
# directory" and a deploy cannot find the rules.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$HERE/../SuperMap"
cd "$PROJECT_DIR"

if [ ! -f firebase.json ] || [ ! -f .firebaserc ]; then
  echo "This does not look like the Firebase folder: $PROJECT_DIR" >&2
  exit 1
fi

PROJECT="$(node -e "process.stdout.write(require('./.firebaserc').projects.default)")"
echo "Folder:  $PROJECT_DIR"
echo "Project: $PROJECT"

# A global CLI when one is installed, otherwise the pinned latest through npx.
if command -v firebase >/dev/null 2>&1; then
  FB=(firebase)
else
  FB=(npx --yes firebase-tools@latest)
fi

"${FB[@]}" use "$PROJECT"
# One --only argument: rules, indexes and Storage, and nothing else.
"${FB[@]}" deploy --only firestore:rules,firestore:indexes,storage --project "$PROJECT"

echo
echo "Done. Check Firestore -> Indexes until the 'cases' index reads Enabled,"
echo "and Storage -> Rules for chat_media and secure_drops."
