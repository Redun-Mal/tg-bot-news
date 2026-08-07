# Build context is the repo root (see docker-compose.yml) because
# services/helper-api/tsconfig.json extends the root tsconfig.base.json.

FROM node:22-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY services/helper-api/package.json services/helper-api/package-lock.json* services/helper-api/
WORKDIR /app/services/helper-api
RUN npm install
COPY services/helper-api/tsconfig.json ./
COPY services/helper-api/src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app/services/helper-api
ENV NODE_ENV=production
COPY services/helper-api/package.json services/helper-api/package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/services/helper-api/dist ./dist

RUN apk add --no-cache curl

EXPOSE 3000
CMD ["node", "dist/index.js"]
