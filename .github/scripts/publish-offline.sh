#!/usr/bin/env bash
# Only publish trusted main-branch builds. Never use this in pull_request_target.
set -euo pipefail
: "${GH_TOKEN:?GitHub Actions token is required}"
: "${GITHUB_REPOSITORY:?}"
: "${GITHUB_REF:?}"
: "${GITHUB_SHA:?}"
: "${VERSION:?}"
: "${GITHUB_EVENT_NAME:?}"
if [[ "$GITHUB_REPOSITORY" != HUMDRFGRY/unlock-music || "$GITHUB_REF" != refs/heads/main ]]; then
  echo 'Refusing to publish from a fork or non-main ref' >&2; exit 1
fi
if [[ "$GITHUB_EVENT_NAME" != push && "$GITHUB_EVENT_NAME" != workflow_dispatch ]]; then
  echo 'Refusing to publish from this event' >&2; exit 1
fi
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ ]] || exit 1
REPO="$GITHUB_REPOSITORY"
TAG="offline-v$VERSION"
ASSETS="$(cd "${1:-artifacts}" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
(cd "$ASSETS" && sha256sum --check SHA256SUMS.txt)
python3 - "$ASSETS/BUILD-INFO.json" "$GITHUB_SHA" "$VERSION" <<'PY'
import json, sys
info=json.load(open(sys.argv[1], encoding='utf-8'))
assert info['source_commit']==sys.argv[2] and info['version']==sys.argv[3]
assert info['android_variant']=='debug' and info['production_signing'] is False
PY
# Exact existing lightweight tags must resolve to this build. Never move a tag.
gh api "repos/$REPO/git/matching-refs/tags/$TAG" > "$TMP/refs.json"
python3 - "$TMP/refs.json" "$TAG" "$GITHUB_SHA" <<'PY'
import json, sys
for ref in json.load(open(sys.argv[1])):
    if ref['ref']=='refs/tags/'+sys.argv[2]:
        if ref['object']['type']!='commit' or ref['object']['sha']!=sys.argv[3]:
            raise SystemExit('Tag already targets another commit; bump offline/VERSION. No tag moved.')
PY
cat > "$TMP/notes.md" <<EOF
## Unlock Music 离线 Demo $VERSION

- Android：下载 \`unlock-music-offline-$VERSION-debug.apk\`。
- 网页：下载单文件 HTML，或解压 \`unlock-music-offline-$VERSION-web.zip\` 后打开 index.html。
- \`SHA256SUMS.txt\` 校验全部附件；\`TEST-EVIDENCE.zip\` 为本次构建测试证据。

这是 **debug 签名的预览版**，不是 Google Play 正式签名版本。不同构建的 debug 签名可能不同；升级前请导出数据。网页/JVM 测试与 APK 编译不等于 Android 真机验证。

仅处理你拥有或有权转换的文件。格式范围以离线包 README 为准。

Source commit: $GITHUB_SHA
Build: https://github.com/$REPO/actions/runs/${GITHUB_RUN_ID:-unknown}
EOF
if gh release view "$TAG" --repo "$REPO" --json isDraft,targetCommitish,body,url > "$TMP/release.json" 2> "$TMP/view-error.txt"; then
  STATE=$(python3 - "$TMP/release.json" "$GITHUB_SHA" <<'PY'
import json, sys
r=json.load(open(sys.argv[1]))
if r.get('targetCommitish')!=sys.argv[2] or 'Source commit: '+sys.argv[2] not in (r.get('body') or ''):
    raise SystemExit('Existing release is not from this exact commit; refusing to overwrite it.')
print('draft' if r['isDraft'] else 'published')
PY
)
  if [[ "$STATE" == published ]]; then
    echo 'This exact commit is already published; no assets overwritten.'
    gh release view "$TAG" --repo "$REPO" --json url --jq .url
    exit 0
  fi
else
  # If lookup failed for any reason other than absence, create also fails safely.
  gh release create "$TAG" --repo "$REPO" --target "$GITHUB_SHA" \
    --title "Unlock Music Offline $VERSION (Android preview)" \
    --notes-file "$TMP/notes.md" --draft --prerelease --latest=false
fi
# Clobber is limited to our still-unpublished, same-source draft.
gh release upload "$TAG" "$ASSETS"/* --repo "$REPO" --clobber
mkdir "$TMP/download"
gh release download "$TAG" --repo "$REPO" --dir "$TMP/download" --pattern '*'
cmp "$ASSETS/SHA256SUMS.txt" "$TMP/download/SHA256SUMS.txt"
(cd "$TMP/download" && sha256sum --check SHA256SUMS.txt)
gh release edit "$TAG" --repo "$REPO" --draft=false --prerelease --latest=false
URL=$(gh release view "$TAG" --repo "$REPO" --json url --jq .url)
echo "$URL"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  printf '## Published offline demo\n\n%s\n\nDebug-signed APK, HTML, web ZIP, build identity, test evidence and SHA-256 checksums.\n' "$URL" >> "$GITHUB_STEP_SUMMARY"
fi
