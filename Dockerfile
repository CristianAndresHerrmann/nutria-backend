FROM node:22-alpine

WORKDIR /app
RUN chown node:node /app
USER node

# Dependencias antes que prisma/: así un cambio de schema o una migración nueva no
# invalida la capa de npm ci, que solo se repite cuando cambian package.json o
# package-lock.json. El postinstall de @prisma/client no encuentra el schema
# todavía y solo avisa; el cliente se genera en el paso siguiente.
COPY --chown=node:node package*.json ./
RUN npm ci

COPY --chown=node:node prisma ./prisma
RUN npx prisma generate

COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node vitest*.config.js ./

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
