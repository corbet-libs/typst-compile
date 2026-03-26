FROM node:22-slim

WORKDIR /app

# Copy package files and install
COPY package.json ./
RUN npm install --production

# Copy fonts from main project
COPY fonts/ ./fonts/

# Copy server
COPY server.js ./

# Koyeb exposes PORT env var
EXPOSE 8000

CMD ["node", "server.js"]
