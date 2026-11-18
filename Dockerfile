# [INPUT]: 依赖 Node.js 24、锁定依赖及完整 Web 构建输入。
# [OUTPUT]: 提供 linux/amd64 与 linux/arm64 静态站点镜像。
# [POS]: 容器构建入口；运行层仅包含 Nginx 和生产 Web 产物。
# [PROTOCOL]: Update this header on change, then check AGENTS.md
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
ARG NGINX_IMAGE=ghcr.io/nginx/nginx-unprivileged:stable-alpine@sha256:ea4fd7ab5a8dc6348c18240bd3546f355f8373cd8f112580f7d8bd8ff5a74772

FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build

FROM ${NGINX_IMAGE} AS runtime
LABEL org.opencontainers.image.title="MappingOut" \
      org.opencontainers.image.description="Guild Wars atlas and personal exploration journal" \
      org.opencontainers.image.source="https://github.com/zhubby/mappingout"
COPY container/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist/ /srv/mappingout/
USER 101:101
EXPOSE 8080
STOPSIGNAL SIGQUIT
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -T 2 -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
