#!/usr/bin/env bash
# Install the built APK and a separate instrumentation APK; do not inject HTML.
set -euo pipefail
app=io.github.humdrfgry.unlockmusic.offline
out=android/tests/device-output
mkdir -p "$out"
logcat_pid=''
collect() {
  # Keep logs emitted before an emulator disconnect instead of replacing them
  # with an unhelpful post-crash "waiting for device" message.
  if [[ -n "$logcat_pid" ]]; then
    kill "$logcat_pid" 2>/dev/null || true
    wait "$logcat_pid" 2>/dev/null || true
    logcat_pid=''
  fi
  timeout 15s adb logcat -d > android/tests/device-logcat-final-ci.log 2>&1 || true
  { date -u; free -m; df -h .; ps -eo pid,ppid,rss,comm --sort=-rss | head -n 20; } > android/tests/host-runtime-ci.log 2>&1 || true
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
adb logcat -v threadtime > android/tests/device-logcat-ci.log 2>&1 &
logcat_pid=$!
# Bound device/runner hangs; pipefail makes timeout block packaging.
timeout --signal=TERM --kill-after=15s 240s adb shell am instrument -w -r "$app.test/androidx.test.runner.AndroidJUnitRunner" | tee android/tests/instrumentation-ci.log
collect
python .github/scripts/record-android-tests.py
