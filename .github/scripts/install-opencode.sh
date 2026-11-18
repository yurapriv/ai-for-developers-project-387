set -euo pipefail

archive="$RUNNER_TEMP/opencode.tar.gz"
bin="$RUNNER_TEMP/opencode-bin"
mkdir -p "$bin"
curl --fail --location --retry 3 \
  https://github.com/anomalyco/opencode/releases/download/v1.19.5/opencode-linux-x64-baseline.tar.gz \
  --output "$archive"
echo "17c200fd4b2289954cc01552559f9b6d03ec157b2ddfb5eb54144f491656333d  $archive" | sha256sum --check
tar -xzf "$archive" -C "$bin" opencode
"$bin/opencode" --version
echo "$bin" >> "$GITHUB_PATH"
