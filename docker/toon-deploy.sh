#!/usr/bin/env bash
#
# Server-side deploy command for toon-finance.
#
# THIS IS A FORCED COMMAND, AND THAT IS THE WHOLE POINT. It is installed on the
# server as /usr/local/bin/toon-finance-deploy and pinned to the GitHub Actions key
# in ~/.ssh/authorized_keys:
#
#   restrict,command="/usr/local/bin/toon-finance-deploy" ssh-ed25519 AAAA… finance-deploy
#
# NOTE THE NAME. toon-recipe ships the same script as /usr/local/bin/toon-deploy on
# the same machine, and the two must NOT be merged into one command taking an app
# argument. A forced command hangs off the KEY, so one key can only ever drive one
# app — and that is the property worth having: the key in toon-finance's secret
# store cannot touch the recipe stack, and vice versa. Two scripts, two keys, two
# authorized_keys lines.
#
# sshd then ignores whatever the client asked to run and executes this instead,
# putting the client's request in $SSH_ORIGINAL_COMMAND. So the private key that
# lives in GitHub's secret store does not buy a shell on the box: it buys exactly
# the three verbs below, on exactly one image repository, and `restrict` also
# takes away port forwarding, agent forwarding, X11 and a pty.
#
# Two consequences worth knowing:
#
#   * THE IMAGE REPOSITORY IS PINNED HERE, not sent by the client. The caller may
#     choose a digest or `latest`; it may not choose a registry. Otherwise a stolen
#     key could point the server at any image on the internet, which is a root
#     shell in a trench coat.
#   * The workflow does not scp docker-compose.yml over. `sync-config` below fetches it from the
#     repository instead, and it is deliberately a SEPARATE verb: a compose change
#     is a configuration change and deserves a human, not a silent side effect of
#     every push to main.
#   * IT NO LONGER FETCHES A CADDYFILE. TLS terminates in the shared `toon-edge`
#     stack (/opt/toon-edge) now, so this app has no proxy config of its own. The
#     edge Caddyfile is maintained by hand — it changes only when an app is added,
#     and a bad one takes EVERY app on the host offline, so it does not belong
#     behind an automated fetch.
#
# Run it by hand exactly as CI does — the arguments work either way:
#
#   toon-finance-deploy deploy latest
#   toon-finance-deploy deploy sha256:<64 hex>
#   toon-finance-deploy sync-config
#
set -euo pipefail

# Both overridable from the environment for a non-standard install, but note that
# `restrict` means the SSH client cannot set them — they are the server's call.
APP_DIR="${TOON_APP_DIR:-/opt/toon-finance}"
IMAGE_REPO="${TOON_IMAGE_REPO:-ghcr.io/toonvish/toon-finance}"
RAW_BASE="${TOON_RAW_BASE:-https://raw.githubusercontent.com/Toonvish/toon-finance/main}"

# How long to wait for the container's own HEALTHCHECK (Dockerfile: it calls
# /api/health, so healthy means Hono answers AND the env validated). The image's
# start-period is 40s, so this has to comfortably exceed it.
HEALTH_TRIES=40
HEALTH_SLEEP=3

log() { printf '%s  %s\n' "$(date -Is)" "$*"; }
die() { printf '%s  FEHLER: %s\n' "$(date -Is)" "$*" >&2; exit 1; }

# Under a forced command the request arrives in SSH_ORIGINAL_COMMAND; a human
# running this directly passes it as normal arguments.
request="${SSH_ORIGINAL_COMMAND:-$*}"
# shellcheck disable=SC2206  # deliberate word splitting: the request is validated below
parts=($request)
verb="${parts[0]:-}"
ref="${parts[1]:-}"

[ "${#parts[@]}" -le 2 ] || die "Zu viele Argumente: $request"

resolve_image() {
  # ALLOW-LIST, never a pattern match on what is forbidden. Anything that is not
  # `latest` or a well-formed digest is refused outright rather than being passed
  # to docker, which is what keeps a shell metacharacter from ever reaching one.
  case "$ref" in
    latest | "")
      echo "${IMAGE_REPO}:latest"
      ;;
    sha256:*)
      [[ "$ref" =~ ^sha256:[0-9a-f]{64}$ ]] || die "Kein gültiger Digest: $ref"
      echo "${IMAGE_REPO}@${ref}"
      ;;
    *)
      die "Kein gültiger Image-Verweis: $ref (erlaubt: latest oder sha256:<64 hex>)"
      ;;
  esac
}

pin_image_in_env() {
  # Pin the deployed image so a later manual `docker compose up -d` brings up the
  # SAME version instead of drifting back to whatever `latest` points at.
  # Idempotent, and every other line — SESSION_SECRET included — is untouched.
  local image="$1"
  if grep -q '^TOON_IMAGE=' .env; then
    sed -i "s|^TOON_IMAGE=.*|TOON_IMAGE=${image}|" .env
  else
    printf 'TOON_IMAGE=%s\n' "$image" >> .env
  fi
}

wait_for_healthy() {
  local cid status i
  log "Warte auf healthy …"
  for i in $(seq 1 "$HEALTH_TRIES"); do
    cid="$(docker compose ps -q app 2>/dev/null || true)"
    if [ -n "$cid" ]; then
      status="$(docker inspect --format \
        '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
        "$cid" 2>/dev/null || echo missing)"
    else
      status=missing
    fi
    case "$status" in
      healthy) log "app ist healthy"; return 0 ;;
      unhealthy) return 1 ;;
    esac
    [ "$i" -lt "$HEALTH_TRIES" ] || { log "Zeitüberschreitung, Status=$status"; return 1; }
    sleep "$HEALTH_SLEEP"
  done
}

cmd_deploy() {
  local image
  image="$(resolve_image)"
  cd "$APP_DIR" 2>/dev/null || die "$APP_DIR gibt es nicht"
  [ -f .env ] || die "$APP_DIR/.env fehlt. Vorlage: docker/env.example (SESSION_SECRET + TOON_HOSTNAME)."

  log "Deploye $image"

  # TOON_IMAGE is passed in the ENVIRONMENT rather than written to .env first,
  # because compose reads the environment ahead of the .env file. That ordering is
  # what makes a failed deploy recoverable: .env still names the last version that
  # actually came up healthy, so the operator's fix is one `docker compose up -d`
  # with no editing. The pin below happens only after the health check passes.
  TOON_IMAGE="$image" docker compose pull
  TOON_IMAGE="$image" docker compose up -d --remove-orphans

  # No TOON_IMAGE prefix on this one: it inspects the running container and needs
  # no interpolation, and `VAR=x some_function` leaks VAR into the rest of the
  # script in bash — which would defeat the .env ordering explained above.
  if ! wait_for_healthy; then
    docker compose logs --tail=60 app >&2 || true
    printf '%s\n' \
      "" \
      "Die .env zeigt noch auf die letzte gesunde Version. Zurück auf diese:" \
      "    cd $APP_DIR && docker compose up -d" >&2
    die "Container wurde nicht healthy — $image ist NICHT übernommen"
  fi

  pin_image_in_env "$image"

  # Old layers add up fast on a 30 GB VPS disk. Images only — never
  # `system prune --volumes`, which would delete the database.
  docker image prune -af --filter "until=168h" >/dev/null 2>&1 || true

  docker compose ps
}

cmd_sync_config() {
  cd "$APP_DIR" 2>/dev/null || die "$APP_DIR gibt es nicht"
  # `docker compose config` below interpolates the .env, so a missing one would
  # fail the validation for a reason that has nothing to do with the download.
  [ -f .env ] || die "$APP_DIR/.env fehlt. Vorlage: docker/env.example (SESSION_SECRET + TOON_HOSTNAME)."
  log "Hole docker-compose.yml aus dem Repo"
  # To a temp file first: a half-written compose file on a truncated download
  # would leave the next `up -d` with no way to describe the running stack.
  curl -fsSL "$RAW_BASE/docker-compose.yml" -o docker-compose.yml.new
  mv docker-compose.yml.new docker-compose.yml
  # This also catches the upgrade's one prerequisite: the compose file now
  # references the EXTERNAL network `toon-edge`, and `config` fails loudly if it
  # does not exist yet instead of leaving the next deploy to discover it.
  docker compose config >/dev/null || die "Die neue docker-compose.yml ist ungültig (existiert das Netz toon-edge? 'docker network create toon-edge')"
  log "Fertig. Übernommen wird sie beim nächsten Deploy."
}

case "$verb" in
  deploy)
    cmd_deploy
    ;;
  sync-config | status)
    # Neither takes an argument. Refusing one rather than ignoring it keeps a
    # typo'd `sync-config latest` from looking like it did something.
    [ "${#parts[@]}" -eq 1 ] || die "$verb nimmt keine Argumente"
    if [ "$verb" = status ]; then
      cd "$APP_DIR" 2>/dev/null || die "$APP_DIR gibt es nicht"
      docker compose ps
    else
      cmd_sync_config
    fi
    ;;
  *)
    die "Unbekannter Befehl: ${verb:-<leer>} (erlaubt: deploy, sync-config, status)"
    ;;
esac
