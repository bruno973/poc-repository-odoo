# On part d'une image Linux Alpine (ultra légère, environ 5 Mo)
FROM alpine:latest

# On installe curl
RUN apk add --no-cache curl

# Par défaut, on lance un curl en mode verbose (-v) sur l'URL fournie
CMD curl -v $ODOO_URL
