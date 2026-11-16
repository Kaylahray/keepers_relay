# The Crown Rally relay as a container, for any host that runs one (Railway, Render, Fly, a VPS).
# Build from the repo root:  docker build -f rally-relay/Dockerfile -t crown-rally-relay .
# The host sets the env: RALLY_RELAY_KEY (secret), plus the app's NEXT_PUBLIC_* chain lines.
# Nothing secret is baked in; .dockerignore keeps every .env file out.
FROM node:22-slim

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# Only what the relay runs: its own file, the shared rules and chain code, and the game it replays.
COPY tsconfig.json ./
COPY rally-relay ./rally-relay
COPY lib ./lib
COPY types ./types
COPY public/games/rally.wasm ./public/games/rally.wasm

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# Hosts that check health can use GET /health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "exec", "tsx", "rally-relay/server.mts"]
