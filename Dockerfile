FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
# Honour HTTPS_PROXY/NO_PROXY if the host network needs an egress proxy.
ENV NODE_USE_ENV_PROXY=1

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

RUN mkdir -p /data && chown node:node /data
USER node
ENV DATA_DIR=/data
ENV PORT=3000
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "src/server.js"]
