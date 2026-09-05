FROM oven/bun:1-slim

WORKDIR /app

# Copy package files and install (fonts arrive via @corbet-labs/ctypst)
COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile

# Copy server
COPY server.js cache.js ./

# Koyeb exposes PORT env var
EXPOSE 8000

CMD ["bun", "server.js"]
