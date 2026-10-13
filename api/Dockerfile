# ─── Étape 1 : compilation TypeScript ─────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Dépendances d'abord (cache Docker) ; npm ci = versions exactes du package-lock
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Étape 2 : image d'exécution, sans TypeScript ni outils de dev ───────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Pas de root dans le conteneur
USER node

# Port de l'API (Fastify) ; la configuration arrive par variables d'environnement
# (docker compose : env_file api/.env), jamais par un .env copié dans l'image.
EXPOSE 3001
CMD ["node", "dist/main.js"]
