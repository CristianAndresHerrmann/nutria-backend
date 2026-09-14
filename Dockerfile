FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm install

COPY src ./src
COPY scripts ./scripts

EXPOSE 3000

CMD ["node", "src/server.js"]
