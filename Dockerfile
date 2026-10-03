FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=7777
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY public ./public
USER node
EXPOSE 7777
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:7777/health || exit 1
CMD ["node", "server/index.js"]
