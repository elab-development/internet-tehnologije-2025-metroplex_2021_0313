# ---------- BUILD STAGE ----------
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

# ---------- PRODUCTION STAGE ----------
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

COPY package*.json ./
RUN npm install --omit=dev

# copy prisma client engine + generated client
COPY --from=builder /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma /app/node_modules/@prisma

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3001
CMD ["node", "dist/src/index.js"]
