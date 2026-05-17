FROM node:22-alpine AS build

WORKDIR /app

ARG SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_SITE_URL=$SITE_URL
ENV SITE_URL=$SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN npm ci

COPY . .

RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV API_PORT=4000
ENV WEB_PORT=3000
ENV API_INTERNAL_URL=http://127.0.0.1:4000
ARG SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_SITE_URL=$SITE_URL
ENV SITE_URL=$SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV DATA_DIR=/data
ENV REPO_CACHE_TTL_HOURS=24
ENV REPO_REFRESH_CONCURRENCY=6
ENV APP_STORE_COUNTRY=us
ENV APP_STORE_LOOKUP_DELAY_MS=3500
ENV APP_STORE_CACHE_TTL_DAYS=30
ENV APP_STORE_NEGATIVE_CACHE_TTL_DAYS=7

COPY --from=build /app ./

RUN mkdir -p /data

EXPOSE 3000
VOLUME ["/data"]

CMD ["npm", "run", "start"]
