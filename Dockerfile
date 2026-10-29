FROM node:22-alpine

WORKDIR /app

# Dependencias antes que prisma/: así un cambio de schema o una migración nueva no
# invalida la capa de npm install, que solo se repite cuando cambian package.json o
# package-lock.json. El postinstall de @prisma/client no encuentra el schema
# todavía y solo avisa; el cliente se genera en el paso siguiente.
COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY scripts ./scripts
COPY vitest*.config.js ./

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
