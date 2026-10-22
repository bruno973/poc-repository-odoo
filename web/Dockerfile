# ─── Étape 1 : build Vite ────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Les types partagés avec l'API (@api/*) sont des imports « type », effacés par
# le build : le dossier api/ n'est pas nécessaire ici. Le typecheck se fait dans
# le dépôt complet (npm run typecheck).
RUN npm run build

# ─── Étape 2 : fichiers statiques + reverse proxy /api ──────────────────────
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
