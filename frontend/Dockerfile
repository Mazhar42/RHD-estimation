# Builds the SPA and serves it with an unprivileged nginx, which also proxies
# /api to the backend container (nginx.conf) -- so the default
# VITE_API_URL=/api is same-origin. In production the VPS's edge nginx sits
# in front of it (deploy/).
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
# Lets deploy.sh prune only this app's images on the shared VPS.
LABEL com.rhdbridge.app=rhd-ces
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --start-interval=2s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
