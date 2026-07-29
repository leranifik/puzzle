#!/usr/bin/env bash
#
# PuzzleHub release updater (supports PRIVATE GitHub repositories).
# Downloads a release from GitHub, unpacks it into /opt/puzzlehub/releases,
# migrates the database, flips the `current` symlink and restarts the service.
# Keeps the previous release for instant rollback.
#
# Usage:
#   sudo /opt/puzzlehub/update.sh check         # verify token & release access
#   sudo /opt/puzzlehub/update.sh v1.2.0        # deploy specific release
#   sudo /opt/puzzlehub/update.sh latest        # deploy the latest release
#   sudo /opt/puzzlehub/update.sh rollback      # switch back to the previous release
#
# For a PRIVATE repo, put a GitHub token into /etc/puzzlehub/deploy.env:
#   GITHUB_TOKEN=github_pat_...
# Token needs only: Contents: Read (fine-grained) or `repo` scope (classic).
#
set -euo pipefail

### --- configuration ----------------------------------------------------------
REPO="2hardume/puzzlehub"
APP_DIR="/opt/puzzlehub"
RELEASES_DIR="$APP_DIR/releases"
SERVICE="puzzlehub"
ENV_FILE="/etc/puzzlehub/env"
DEPLOY_ENV_FILE="/etc/puzzlehub/deploy.env"   # holds GITHUB_TOKEN for private repos
KEEP_RELEASES=3                                # how many old releases to keep
### -----------------------------------------------------------------------------

die() { echo "ERROR: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "run with sudo"
command -v curl >/dev/null || die "curl is required"
command -v tar  >/dev/null || die "tar is required"

# --- load the GitHub token (required for private repos) -----------------------
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
if [ -z "$GITHUB_TOKEN" ] && [ -f "$DEPLOY_ENV_FILE" ]; then
  GITHUB_TOKEN=$(grep -E '^GITHUB_TOKEN=' "$DEPLOY_ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")
fi

AUTH_ARGS=()
if [ -n "$GITHUB_TOKEN" ]; then
  AUTH_ARGS=(-H "Authorization: Bearer $GITHUB_TOKEN")
fi

mkdir -p "$RELEASES_DIR"

# --- check mode: verify token & release visibility without deploying ----------
if [ "${1:-}" = "check" ]; then
  echo "Repo:  $REPO"
  echo "Token: $( [ -n "$GITHUB_TOKEN" ] && echo "present (${#GITHUB_TOKEN} chars)" || echo "MISSING" )"
  CODE=$(curl -s -o /tmp/ph-check.json -w "%{http_code}" "${AUTH_ARGS[@]}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/releases/latest")
  case "$CODE" in
    200)
      TAGN=$(grep -o '"tag_name": *"[^"]*"' /tmp/ph-check.json | head -n1 | cut -d'"' -f4)
      ASSETN=$(grep -o '"name": *"puzzlehub-[^"]*"' /tmp/ph-check.json | head -n1 | cut -d'"' -f4)
      echo "OK: latest release $TAGN, asset: ${ASSETN:-<none>}"
      ;;
    401|403) echo "FAIL: token rejected (HTTP $CODE) — recreate it with Contents: Read for $REPO" ;;
    404)     echo "FAIL: HTTP 404 — token missing/expired, no access to $REPO, or no releases yet" ;;
    *)       echo "FAIL: HTTP $CODE" ;;
  esac
  rm -f /tmp/ph-check.json
  exit 0
fi

# --- rollback mode -------------------------------------------------------------
if [ "${1:-}" = "rollback" ]; then
  PREV=$(ls -1t "$RELEASES_DIR" | sed -n '2p')
  [ -n "$PREV" ] || die "no previous release to roll back to"
  ln -sfn "$RELEASES_DIR/$PREV" "$APP_DIR/current"
  systemctl restart "$SERVICE"
  echo "Rolled back to $PREV"
  exit 0
fi

TAG="${1:-latest}"

# --- resolve tag & the asset ----------------------------------------------------
if [ "$TAG" = "latest" ]; then
  API_URL="https://api.github.com/repos/$REPO/releases/latest"
else
  API_URL="https://api.github.com/repos/$REPO/releases/tags/$TAG"
fi

HTTP_CODE=$(curl -s -o /tmp/ph-release.json -w "%{http_code}" "${AUTH_ARGS[@]}" \
  -H "Accept: application/vnd.github+json" "$API_URL")
case "$HTTP_CODE" in
  200) ;;
  401|403) die "GitHub auth failed (HTTP $HTTP_CODE). Check GITHUB_TOKEN in $DEPLOY_ENV_FILE" ;;
  404) die "release '$TAG' not found in $REPO — for a private repo this also means a missing/expired GITHUB_TOKEN" ;;
  *)   die "GitHub API returned HTTP $HTTP_CODE" ;;
esac
JSON=$(cat /tmp/ph-release.json); rm -f /tmp/ph-release.json

TAG=$(echo "$JSON" | grep -o '"tag_name": *"[^"]*"' | head -n1 | cut -d'"' -f4)
# For private repos assets MUST be fetched via the API asset URL
# (browser_download_url only works for public repos).
ASSET_API_URL=$(echo "$JSON" | grep -o 'https://api.github.com/repos/[^"]*/releases/assets/[0-9]*' | head -n1)
[ -n "$ASSET_API_URL" ] || die "no assets in release $TAG"

VERSION="${TAG#v}"
TARGET="$RELEASES_DIR/$TAG"

if [ -d "$TARGET" ]; then
  echo "Release $TAG already downloaded — re-linking."
else
  echo "Downloading release $TAG from $REPO ..."
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
  # Two-step download. GitHub answers the asset API endpoint with a redirect
  # to a pre-signed S3 URL. curl would forward our Authorization header to
  # S3 as well, and S3 rejects requests carrying two auth mechanisms —
  # so we resolve the redirect first, then download WITHOUT the token.
  REDIRECT_URL=$(curl -s -o /dev/null -w '%{redirect_url}' "${AUTH_ARGS[@]}" \
    -H "Accept: application/octet-stream" "$ASSET_API_URL")
  if [ -n "$REDIRECT_URL" ]; then
    curl -fL --retry 3 -o "$TMP/bundle.tar.gz" "$REDIRECT_URL" \
      || die "asset download failed (S3 stage)"
  else
    # no redirect (unusual) — direct download with auth
    curl -fL --retry 3 "${AUTH_ARGS[@]}" \
      -H "Accept: application/octet-stream" \
      -o "$TMP/bundle.tar.gz" "$ASSET_API_URL" \
      || die "asset download failed — check token permissions (Contents: Read)"
  fi
  tar -tzf "$TMP/bundle.tar.gz" >/dev/null 2>&1 \
    || die "downloaded file is not a valid tar.gz (check the token: a JSON error page was likely saved instead)"
  tar -xzf "$TMP/bundle.tar.gz" -C "$TMP"
  # the archive contains a single folder puzzlehub-<version>
  mv "$TMP/puzzlehub-$VERSION" "$TARGET"
  chown -R puzzlehub:puzzlehub "$TARGET"
fi

# --- migrate the database (idempotent DDL) --------------------------------------
DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)
[ -n "$DATABASE_URL" ] || die "DATABASE_URL missing in $ENV_FILE"
echo "Running DB migration..."
sudo -u puzzlehub DATABASE_URL="$DATABASE_URL" node "$TARGET/scripts/init-db.mjs"

# --- flip the symlink & restart ---------------------------------------------------
ln -sfn "$TARGET" "$APP_DIR/current"
systemctl restart "$SERVICE"

# --- health check (roll back automatically on failure) ----------------------------
sleep 3
if curl -fsS -o /dev/null "http://127.0.0.1:3000/api/health"; then
  echo "Deployed $TAG successfully."
else
  echo "Health check FAILED — rolling back..." >&2
  PREV=$(ls -1t "$RELEASES_DIR" | sed -n '2p')
  if [ -n "$PREV" ]; then
    ln -sfn "$RELEASES_DIR/$PREV" "$APP_DIR/current"
    systemctl restart "$SERVICE"
    die "rolled back to $PREV"
  fi
  die "no previous release available"
fi

# --- prune old releases -------------------------------------------------------------
ls -1t "$RELEASES_DIR" | tail -n +$((KEEP_RELEASES + 1)) | while read -r OLD; do
  echo "Pruning old release $OLD"
  rm -rf "${RELEASES_DIR:?}/$OLD"
done
