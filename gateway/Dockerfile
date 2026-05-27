FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY dist/ ./dist/
COPY bin/ ./bin/
EXPOSE 18080 18081
CMD ["node", "dist/index.js"]
