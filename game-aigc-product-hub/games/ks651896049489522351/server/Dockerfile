# 斗地主游戏服务端（阿里云 ACK / ACR）
FROM node:20-alpine

# 构建时注入版本 tag（一般用 git commit hash），/healthz 会返回它用于识别线上版本
ARG IMAGE_TAG=unknown
ENV DDZ_IMAGE_TAG=${IMAGE_TAG}

RUN apk add --no-cache tini

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . ./
RUN chown -R node:node /app && chmod +x start.sh

USER node
EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./start.sh"]
