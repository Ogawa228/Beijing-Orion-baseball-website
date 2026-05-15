FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production --registry=https://registry.npmmirror.com

COPY . .

ENV PORT=80
ENV NODE_ENV=production
EXPOSE 80

CMD ["npm", "start"]
