# Usar imagen oficial de Node.js (Alpine = menos tamaño y build más rápido)
FROM node:18-alpine

WORKDIR /app

# Solo dependencias primero (mejor caché de capas)
COPY package.json package-lock.json* ./

# Instalar dependencias
RUN npm ci

# Copiar solo el código del backend ( .dockerignore excluye Sistema/, scripts/, etc.)
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
