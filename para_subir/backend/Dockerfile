# Usar imagen oficial de Node.js (Alpine = menos tamaño y build más rápido)
FROM node:18-alpine

WORKDIR /app

ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV LANGUAGE=C.UTF-8

# Solo dependencias primero (mejor caché de capas)
COPY package.json package-lock.json* ./

# Instalar dependencias
RUN npm ci

# Copiar solo el código del backend ( .dockerignore excluye Sistema/, scripts/, etc.)
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
