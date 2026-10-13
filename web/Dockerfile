# ─── Étape 1 : build Astro (SSR, adapter Node standalone) ────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Les types partagés avec l'API (@api/*) sont des imports « type » : effacés au
# build, donc le dossier api/ n'a pas besoin d'être dans ce contexte Docker.
RUN npm run build

# ─── Étape 2 : exécution ─────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node
EXPOSE 4321

# VIEWER_ROLE, VIEWER_ID… et API_BASE_URL sont lus à l'exécution (process.env)
CMD ["node", "./dist/server/entry.mjs"]
