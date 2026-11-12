# Build context: ./frontend
FROM node:22-alpine AS build
WORKDIR /app
# npm 10 (bundled with Node 22) crashes on this dependency tree; see CLAUDE.md.
RUN npm install -g npm@11
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/taskflow/browser /usr/share/nginx/html
EXPOSE 8080
