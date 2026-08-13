FROM node:20-alpine AS builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
ENV VITE_BASE_PATH=/watchpear2/
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install --production
COPY server/ ./server/
COPY --from=builder /app/client/dist ./client/dist

ENV PORT=8181
EXPOSE 8181
CMD ["node", "server/index.js"]
