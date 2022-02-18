FROM node:12-alpine
RUN apk --no-cache add curl

# Create app directory
WORKDIR /app/fed-agent

# Install app dependencies
COPY package*.json ./

RUN npm ci

# Copy app
COPY . .

EXPOSE 3000
CMD [ "node", "app.js" ]