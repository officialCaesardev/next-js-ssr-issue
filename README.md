# Issue

- **Frontend:** Next.js
- **Backend:** Express.js

While using Docker and running a Next.js server, I'm unable to fetch data from the backend server during Next SSR (Server-Side Rendering) in production. This issue does not occur during SR (Server-Side Rendering) in development or when using CSR (Client-Side Rendering).

- **CSR:**
  - Development: Fetch works
  - Production: Fetch works
- **SSR:**
  - Development: Fetch works
  - Production: Fetch fails

I initially encountered errors with SSR in development when using 'http://localhost:8080/' to fetch data from the backend. Using the command `docker exec -it next curl http://localhost:8080/` resulted in an error. Switching to `docker exec -it next curl http://express:8080` worked, so I updated the link to 'http://express:8080'. However, this solution does not resolve the SSR issue in production. Fetching from '172.88.0.3:8080', the backend container IP, also fails in SSR production.

Both the server and frontend work fine when accessed via a local browser at "http://localhost:3000" and "http://localhost:8080". Inside the Next.js container, `curl http://express:8080` receives a response from the Express server.

- **Error occurs only during SSR in production.**

# Code

## Next.js Dockerfile

```Dockerfile
FROM node:lts-alpine3.20 AS base

RUN apk add --no-cache curl

FROM base AS builder

WORKDIR /app

COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i; \
  else echo "Warning: Lockfile not found. It is recommended to commit lockfiles to version control." && yarn install; \
  fi

COPY src ./src
COPY public ./public
COPY next.config.mjs .
COPY tsconfig.json .

ARG ENV_VARIABLE
ENV ENV_VARIABLE=${ENV_VARIABLE}
ARG NEXT_PUBLIC_ENV_VARIABLE
ENV NEXT_PUBLIC_ENV_VARIABLE=${NEXT_PUBLIC_ENV_VARIABLE}

ENV NEXT_TELEMETRY_DISABLED 1

RUN \
  if [ -f yarn.lock ]; then yarn build; \
  elif [ -f package-lock.json ]; then npm run build; \
  elif [ -f pnpm-lock.yaml ]; then pnpm build; \
  else npm run build; \
  fi

FROM base AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=builder /app/public ./public

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

ARG ENV_VARIABLE
ENV ENV_VARIABLE=${ENV_VARIABLE}
ARG NEXT_PUBLIC_ENV_VARIABLE
ENV NEXT_PUBLIC_ENV_VARIABLE=${NEXT_PUBLIC_ENV_VARIABLE}

ENV NEXT_TELEMETRY_DISABLED 1

CMD ["node", "server.js"]
```

## Express.js Dockerfile

```Dockerfile
FROM node:lts-alpine3.20

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

CMD ["npm", "run", "start"]
```

## Docker Compose

```yaml
services:
  next:
    container_name: next
    build:
      context: ./frontend
      dockerfile: ./Dockerfile
    restart: always
    ports:
      - 3000:3000
    networks:
      - fullStackNet
  express:
    container_name: express
    build:
      context: ./backend
      dockerfile: ./Dockerfile
    ports:
      - 8080:8080
    networks:
      - fullStackNet

networks:
  fullStackNet:
    external: true
```

## Next.js SSR Code

```javascript
import React from 'react';

const Home = async () => {
  let data = '';
  try {
    const response = await fetch('http://express:8080');
    if (!response.ok) {
      data = 'Network response was not ok.';
    }
    const textData = await response.text();
    data = textData;
  } catch (error) {
    console.log(error);
    data = 'Network response was not ok. in the Catch Block';
  }

  return (
    <>
      <div className="p-6">ok</div>
      <div>
        {data ? (
          <h1 style={{ fontSize: '50px' }}>{data}</h1>
        ) : (
          <h1>We did Not Got The Data</h1>
        )}
      </div>
      <div>
        {process.env.NODE_ENV ? (
          <h1 style={{ fontSize: '50px' }}>{process.env.NODE_ENV}</h1>
        ) : (
          <h1>We did Not Got The NODE_ENV</h1>
        )}
      </div>
    </>
  );
};

export default Home;
```

- The error looks like this. This is from development with 'http://localhost:8080/'. I know, but on SSR console log not working, so the error likely be like this, but I am not sure.

```plaintext
TypeError: fetch failed
    at node:internal/deps/undici/undici:12502:13
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async Home (webpack-internal:///(rsc)/./src/app/ssr/page.tsx:14:26) {
  [cause]: AggregateError [ECONNREFUSED]:
      at internalConnectMultiple (node:net:1117:18)
      at afterConnectMultiple (node:net:1684:7)
      at TCPConnectWrap.callbackTrampoline (node:internal/async_hooks:130:17) {
    code: 'ECONNREFUSED',
    [errors]: [ [Error], [Error] ]
  }
}
```

- next.config.mjs
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
};

export default nextConfig;
```
