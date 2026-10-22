# Contexte de build : la RACINE du dépôt (monorepo npm workspaces).
#   docker compose build api   (cf. docker-compose.yml)

# ─── Étape 1 : compilation (package partagé puis API) ────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ui-schema/package.json packages/ui-schema/
COPY api/package.json api/
COPY web/package.json web/
# --ignore-scripts : le postinstall racine (build du package) est fait explicitement ci-dessous
RUN npm ci --ignore-scripts
COPY packages/ui-schema packages/ui-schema
COPY api/tsconfig.json api/
COPY api/src api/src
RUN npm run build -w @leila/ui-schema && npm run build -w poc-odoo-repository-api

# ─── Étape 2 : exécution, sans TypeScript ni outils de dev ───────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/ui-schema/package.json packages/ui-schema/
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --omit=dev --ignore-scripts -w poc-odoo-repository-api -w @leila/ui-schema && npm cache clean --force
COPY --from=build /app/packages/ui-schema/dist packages/ui-schema/dist
COPY --from=build /app/api/dist api/dist

# Pas de root dans le conteneur ; configuration par variables d'environnement
USER node
WORKDIR /app/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
