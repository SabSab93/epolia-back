# Step 1: compile with every dependency (TypeScript, build tools).
FROM node:26-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# Step 2: the image that runs, with production dependencies only.
FROM node:26-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
# --ignore-scripts: skips the dev-only "prepare" hook (husky).
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Schema and migrations, so the host can run `npx prisma migrate deploy`.
COPY prisma ./prisma
RUN npx prisma generate

COPY --from=build /app/dist ./dist

# The API does not need root rights.
USER node

EXPOSE 3000

CMD ["node", "dist/server.js"]
