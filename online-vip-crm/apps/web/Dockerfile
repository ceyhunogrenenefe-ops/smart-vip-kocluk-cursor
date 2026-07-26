# Online VIP CRM — Web (placeholder until Next.js UI lands)
FROM node:20-bookworm-slim
WORKDIR /app
COPY apps/web/package.json apps/web/server.js ./
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
