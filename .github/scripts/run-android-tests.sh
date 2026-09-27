#!/usr/bin/env bash
# Install the built APK and a separate instrumentation APK; do not inject HTML.
set -euo pipefail
app=io.github.humdrfgry.unlockmusic.offline
out=android/tests/device-output
mkdir -p "$out"
collect() {
  timeout 15s adb logcat -d > android/tests/device-logcat-ci.log 2>&1 || true
  for name in startup.png decoded-samples.png device.json; do
    if timeout 15s adb exec-out run-as "$app" cat "files/instrumentation/$name" > "$out/$name.tmp" 2>/dev/null; then
      mv "$out/$name.tmp" "$out/$name"
    else
      rm -f "$out/$name.tmp"
    fi
  done
}
trap collect EXIT
timeout 15s adb shell svc wifi disable
timeout 15s adb shell svc data disable
timeout 120s adb install -r android/app/build/outputs/apk/debug/app-debug.apk
timeout 120s adb install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
timeout 15s adb logcat -c
# Bound device/runner hangs; pipefail makes timeout block packaging.
timeout --signal=TERM --kill-after=15s 240s adb shell am instrument -w -r "$app.test/androidx.test.runner.AndroidJUnitRunner" | tee android/tests/instrumentation-ci.log
collect
python .github/scripts/record-android-tests.py
