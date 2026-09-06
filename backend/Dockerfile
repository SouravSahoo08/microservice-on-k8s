FROM node:24-alpine3.24

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY server.js .

EXPOSE 3000

ENTRYPOINT ["node"]

CMD ["server.js"]
