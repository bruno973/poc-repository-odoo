# Contexte de build : la RACINE du dépôt (monorepo npm workspaces).

# ─── Étape 1 : build Vite (package partagé compris) ──────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ui-schema/package.json packages/ui-schema/
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --ignore-scripts
COPY packages/ui-schema packages/ui-schema
COPY web web
# Les types métier partagés avec l'API (@api/*) sont des imports « type »,
# effacés par le build : le code de l'API n'est pas nécessaire ici.
RUN npm run build -w @leila/ui-schema && npm run build -w leila-one-web

# ─── Étape 2 : fichiers statiques + reverse proxy /api ──────────────────────
FROM nginx:1.27-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
