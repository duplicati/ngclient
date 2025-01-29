FROM node:22-bullseye-slim AS base

# Create app directory
WORKDIR /app

RUN apt-get update && \
  apt-get install -y curl unzip gettext-base && \
  rm -rf /var/lib/apt/lists/*

RUN npm install -g @angular/cli@19
# RUN npm install -g bun@canary
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN bun --version
RUN ng version

# Copy lock files
COPY package.json package-lock.json ./

# Define the build-time variable with a default value
ARG BUILD_ENV=dev
ARG WS_URL=wss://localhost:8080

# Set the build-time variable as an environment variable
ENV BUILD_ENV=${BUILD_ENV}
ENV WS_URL=${WS_URL}

# Install app dependencies
RUN bun i

# Bundle app source
COPY . /app
COPY src/environments/environment.prod.ts environment.prod.ts
COPY src/environments/environment.ts environment.ts

# Replace environment variables in the environment file
RUN export WS_URL="${WS_URL}" && envsubst < environment.prod.ts > src/environments/environment.prod.ts && rm environment.prod.ts
RUN export WS_URL="${WS_URL}" && envsubst < environment.ts > src/environments/environment.ts && rm environment.ts

# Use the environment variable to conditionally run the build command
RUN if [ "$BUILD_ENV" = "prod" ]; then \
  bun run build:prod; \
  else \
  bun run build:dev; \
  fi
