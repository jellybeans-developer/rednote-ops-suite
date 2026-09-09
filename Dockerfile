FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production \
    REDNOTE_HOST=0.0.0.0 \
    REDNOTE_PORT=3210 \
    REDNOTE_DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN addgroup -S rednote && adduser -S -G rednote -u 10001 rednote && mkdir /data && chown rednote:rednote /data
USER rednote
EXPOSE 3210
VOLUME ["/data"]
CMD ["node", "dist/cli.js", "--http"]
