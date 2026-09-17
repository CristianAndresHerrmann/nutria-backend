FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm install

COPY src ./src
COPY scripts ./scripts
COPY vitest.config.js ./

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
