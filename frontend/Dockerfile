FROM node:20-alpine
WORKDIR /app
COPY package.json .
COPY package-lock.json .
RUN npm install --frozen-lockfile
COPY . .
CMD ["npm", "run", "dev"]
