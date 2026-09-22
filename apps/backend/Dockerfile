FROM oven/bun:1.4.2
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun run build --filter=@chitchat/backend
WORKDIR /app/apps/backend
ENV NODE_ENV=production
CMD ["bun", "run", "start"]
