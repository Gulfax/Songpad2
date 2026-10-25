#!/usr/bin/env bash
# Run after "npx cap add android": adds microphone permission and the Songpad icon.
set -euo pipefail
MANIFEST=android/app/src/main/AndroidManifest.xml
if ! grep -q RECORD_AUDIO "$MANIFEST"; then
  sed -i 's#</manifest>#    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />\n</manifest>#' "$MANIFEST"
fi
RES=android/app/src/main/res
rm -rf "$RES"/mipmap-anydpi-v26
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  mkdir -p "$RES/mipmap-$d"
  cp android-icons/mipmap-$d/ic_launcher.png "$RES/mipmap-$d/ic_launcher.png"
  cp android-icons/mipmap-$d/ic_launcher_round.png "$RES/mipmap-$d/ic_launcher_round.png"
done
echo "Android project patched."
