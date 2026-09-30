#!/bin/bash
# Vercel's "ignored build step" (vercel.json ignoreCommand): exit 0 skips the
# build, exit 1 builds.
#
# Every push to a preview branch used to build (about 45 s of build time each,
# 50 builds in two days, most of them dev). Production (main) always builds;
# a preview builds only when its commit message asks with [preview].
# Otherwise preview locally: `bun run dev`, or `vercel build && vercel deploy
# --prebuilt`, which builds on this machine and uses no Vercel build time.
if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then
  echo "Production: building."
  exit 1
fi
case "$VERCEL_GIT_COMMIT_MESSAGE" in
  *"[preview]"*) echo "Preview asked for: building."; exit 1 ;;
esac
echo "Skipping this preview build. Put [preview] in the commit message to build one."
exit 0
