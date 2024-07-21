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

# Debugging Update 1

I'm still trying to fix this issue. Here are the steps I took to debug it:

1. I created a `test.js` file with the following content:

    ```javascript
    const main = async () => {
      try {
        const res = await fetch('http://express:8080');
        if (!res.ok) {
          data = 'Network response was not ok.';
        }
        const data = await res.text();
        console.log(data);
      } catch (error) {
        console.log('err', error);
      }
    };

    main();
    ```

2. I built the Next.js project locally and copied the `.next/standalone/server.js` file to the root folder. I then included the content of `test.js` in the `server.js` file that was built using `next build`.

3. In the Next.js Dockerfile, I added the following lines before starting the server to overwrite `server.js`:

    ```Dockerfile
    COPY ./server.js ./
    COPY ./test.js ./

    CMD ["node", "server.js"]
    ```

4. I started the Docker container and used `docker exec -it next sh`. Running `ls` produced the following output:

    ```sh
    /app $ ls
    node_modules  package.json  public  server.js  test.js
    ```

5. I ran `node test.js` to fetch the data:

    ```sh
    /app $ node test.js
    Hello, Express with TypeScript and CORS!
    ```

6. I checked the server logs using `docker-compose logs -f next` and got the following output:

    ```sh
    PS C:\code\test_8> docker-compose logs -f next
    next  |   ▲ Next.js 14.2.5
    next  |   - Local:        http://0c3e47a52dec:3000
    next  |   - Network:      http://172.19.0.2:3000
    next  |
    next  |  ✓ Starting...
    next  | err TypeError: fetch failed
    next  |     at node:internal/deps/undici/undici:13178:13
    next  |     at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    next  |     at async main (/app/server.js:187:17) {
    next  |   [cause]: Error: connect ECONNREFUSED 172.19.0.3:8080
    next  |       at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1605:16) {
    next  |     errno: -111,
    next  |     code: 'ECONNREFUSED',
    next  |     syscall: 'connect',
    next  |     address: '172.19.0.3',
    next  |     port: 8080
    next  |   }
    next  | }
    next  |  ✓ Ready in 161ms
    ```

This error is interesting. It occurs only at runtime in Next.js, but works fine otherwise.

7. To get a clearer idea, I included `console.log('res', res);` in `test.js` to see the full response. Here is what I got:

    ```sh
    /app $ node test.js
    Hello, Express with TypeScript and CORS!
    res Response {
      status: 200,
      statusText: 'OK',
      headers: Headers {
        'x-powered-by': 'Express',
        'access-control-allow-origin': '*',
        'content-type': 'text/html; charset=utf-8',
        'content-length': '40',
        etag: 'W/"28-oyCv47GF8XZOnwEXycdvWVxvI5g"',
        date: 'Sun, 21 Jul 2024 01:56:47 GMT',
        connection: 'keep-alive',
        'keep-alive': 'timeout=5'
      },
      body: ReadableStream { locked: true, state: 'closed', supportsBYOB: true },
      bodyUsed: true,
      ok: true,
      redirected: false,
      type: 'basic',
      url: 'http://express:8080/'
    }
    ```

# Debugging Update 2

1. I ran the backend server locally on port 9000.
2. I changed the `fetch` call in `server.js` from `fetch('http://express:8080');` to `fetch('http://localhost:9000/');`. Then, I ran the Docker container again and added the following lines in the catch block: `catch (error) {console.log(error);console.log(error.cause);}`

    ```sh
    Attaching to express, next
    express  |
    express  | > test_4@1.0.0 start
    express  | > node dist/index.js
    express  |
    next     |   ▲ Next.js 14.2.5
    next     |   - Local:        http://2bc0d47da3bf:3000
    next     |   - Network:      http://172.19.0.3:3000
    next     |
    next     |  ✓ Starting...
    next     | TypeError: fetch failed
    next     |     at node:internal/deps/undici/undici:13178:13
    next     |     at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    express  | Server is running at http://localhost:8080
    next     |     at async main (/app/server.js:187:17) {
    next     |   [cause]: AggregateError [ECONNREFUSED]:
    next     |       at internalConnectMultiple (node:net:1116:18)
    next     |       at afterConnectMultiple (node:net:1683:7) {
    next     |     code: 'ECONNREFUSED',
    next     |     [errors]: [ [Error], [Error] ]
    next     |   }
    next     | }
    next     | AggregateError [ECONNREFUSED]:
    next     |     at internalConnectMultiple (node:net:1116:18)
    next     |     at afterConnectMultiple (node:net:1683:7) {
    next     |   code: 'ECONNREFUSED',
    next     |   [errors]: [
    next     |     Error: connect ECONNREFUSED ::1:9000
    next     |         at createConnectionError (node:net:1646:14)
    next     |         at afterConnectMultiple (node:net:1676:16) {
    next     |       errno: -111,
    next     |       code: 'ECONNREFUSED',
    next     |       syscall: 'connect',
    next     |       address: '::1',
    next     |       port: 9000
    next     |     },
    next     |     Error: connect ECONNREFUSED 127.0.0.1:9000
    next     |         at createConnectionError (node:net:1646:14)
    next     |         at afterConnectMultiple (node:net:1676:16) {
    next     |       errno: -111,
    next     |       code: 'ECONNREFUSED',
    next     |       syscall: 'connect',
    next     |       address: '127.0.0.1',
    next     |       port: 9000
    next     |     }
    next     |   ]
    next     | }
    next     |  ✓ Ready in 242ms
    ```
    ### Link to the code that reproduces this issue

https://github.com/officialCaesardev/next-js-ssr-issue

### To Reproduce

1. Clone the GitHub repository: [https://github.com/officialCaesardev/next-js-ssr-issue](https://github.com/officialCaesardev/next-js-ssr-issue)
2. Navigate to the project directory.
3. Run `docker-compose up --build`:
   - The Next.js server will run at: [http://localhost:3000/](http://localhost:3000/)
   - The Express.js server will run at: [http://localhost:8080/](http://localhost:8080/)
4. To check the issue, visit [http://localhost:3000/](http://localhost:3000/):
   - The root (`'/'`) of the frontend server tries to fetch data using CSR (Client-Side Rendering).
   - The `/ssr` path of the frontend server tries to fetch data using SSR (Server-Side Rendering).
5. When you go to [http://localhost:3000/ssr](http://localhost:3000/ssr), you will see "Network response was not ok. in the Catch Block," indicating that an error occurred and was displayed.
6. To verify that the Next.js container can correctly access the Express server, run this command in another terminal in the same project directory: `docker exec -it next curl http://express:8080`.

### Current vs. Expected behavior

On [http://localhost:3000/ssr](http://localhost:3000/ssr), you should see "Hello, Express with TypeScript and CORS!" However, due to the error, it shows "Network response was not ok. in the Catch Block."

### Provide environment information

```bash
Operating System:
  Platform: win32
  Arch: x64
  Version: Windows 11 Pro
  Available memory (MB): 12229
  Available CPU cores: 4
Binaries:
  Node: 20.15.0
  npm: N/A
  Yarn: N/A
  pnpm: N/A
Relevant Packages:
  next: 14.2.5 // Latest available version is detected (14.2.5).
  eslint-config-next: 14.2.5
  react: 18.3.1
  react-dom: 18.3.1
  typescript: 5.5.3
Next.js Config:
  output: standalone

Extra on there npm version does not showing so
PS C:\> node -v
v20.15.0
PS C:\> npm --v
10.7.0
PS C:\>
```


### Which area(s) are affected? (Select all that apply)

Not sure, create-next-app, Output (export/standalone), Runtime, Script (next/script), TypeScript, SWC, Webpack

### Which stage(s) are affected? (Select all that apply)

next build (local), next start (local), Other (Deployed)

### Additional context

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

# Debugging Update 1

I'm still trying to fix this issue. Here are the steps I took to debug it:

1. I created a `test.js` file with the following content:

    ```javascript
    const main = async () => {
      try {
        const res = await fetch('http://express:8080');
        if (!res.ok) {
          data = 'Network response was not ok.';
        }
        const data = await res.text();
        console.log(data);
      } catch (error) {
        console.log('err', error);
      }
    };

    main();
    ```

2. I built the Next.js project locally and copied the `.next/standalone/server.js` file to the root folder. I then included the content of `test.js` in the `server.js` file that was built using `next build`.

3. In the Next.js Dockerfile, I added the following lines before starting the server to overwrite `server.js`:

    ```Dockerfile
    COPY ./server.js ./
    COPY ./test.js ./

    CMD ["node", "server.js"]
    ```

4. I started the Docker container and used `docker exec -it next sh`. Running `ls` produced the following output:

    ```sh
    /app $ ls
    node_modules  package.json  public  server.js  test.js
    ```

5. I ran `node test.js` to fetch the data:

    ```sh
    /app $ node test.js
    Hello, Express with TypeScript and CORS!
    ```

6. I checked the server logs using `docker-compose logs -f next` and got the following output:

    ```sh
    PS C:\code\test_8> docker-compose logs -f next
    next  |   ▲ Next.js 14.2.5
    next  |   - Local:        http://0c3e47a52dec:3000
    next  |   - Network:      http://172.19.0.2:3000
    next  |
    next  |  ✓ Starting...
    next  | err TypeError: fetch failed
    next  |     at node:internal/deps/undici/undici:13178:13
    next  |     at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    next  |     at async main (/app/server.js:187:17) {
    next  |   [cause]: Error: connect ECONNREFUSED 172.19.0.3:8080
    next  |       at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1605:16) {
    next  |     errno: -111,
    next  |     code: 'ECONNREFUSED',
    next  |     syscall: 'connect',
    next  |     address: '172.19.0.3',
    next  |     port: 8080
    next  |   }
    next  | }
    next  |  ✓ Ready in 161ms
    ```

This error is interesting. It occurs only at runtime in Next.js, but works fine otherwise.

7. To get a clearer idea, I included `console.log('res', res);` in `test.js` to see the full response. Here is what I got:

    ```sh
    /app $ node test.js
    Hello, Express with TypeScript and CORS!
    res Response {
      status: 200,
      statusText: 'OK',
      headers: Headers {
        'x-powered-by': 'Express',
        'access-control-allow-origin': '*',
        'content-type': 'text/html; charset=utf-8',
        'content-length': '40',
        etag: 'W/"28-oyCv47GF8XZOnwEXycdvWVxvI5g"',
        date: 'Sun, 21 Jul 2024 01:56:47 GMT',
        connection: 'keep-alive',
        'keep-alive': 'timeout=5'
      },
      body: ReadableStream { locked: true, state: 'closed', supportsBYOB: true },
      bodyUsed: true,
      ok: true,
      redirected: false,
      type: 'basic',
      url: 'http://express:8080/'
    }
    ```

# Debugging Update 2

1. I ran the backend server locally on port 9000.
2. I changed the `fetch` call in `server.js` from `fetch('http://express:8080');` to `fetch('http://localhost:9000/');`. Then, I ran the Docker container again and added the following lines in the catch block: `catch (error) {console.log(error);console.log(error.cause);}`

    ```sh
    Attaching to express, next
    express  |
    express  | > test_4@1.0.0 start
    express  | > node dist/index.js
    express  |
    next     |   ▲ Next.js 14.2.5
    next     |   - Local:        http://2bc0d47da3bf:3000
    next     |   - Network:      http://172.19.0.3:3000
    next     |
    next     |  ✓ Starting...
    next     | TypeError: fetch failed
    next     |     at node:internal/deps/undici/undici:13178:13
    next     |     at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    express  | Server is running at http://localhost:8080
    next     |     at async main (/app/server.js:187:17) {
    next     |   [cause]: AggregateError [ECONNREFUSED]:
    next     |       at internalConnectMultiple (node:net:1116:18)
    next     |       at afterConnectMultiple (node:net:1683:7) {
    next     |     code: 'ECONNREFUSED',
    next     |     [errors]: [ [Error], [Error] ]
    next     |   }
    next     | }
    next     | AggregateError [ECONNREFUSED]:
    next     |     at internalConnectMultiple (node:net:1116:18)
    next     |     at afterConnectMultiple (node:net:1683:7) {
    next     |   code: 'ECONNREFUSED',
    next     |   [errors]: [
    next     |     Error: connect ECONNREFUSED ::1:9000
    next     |         at createConnectionError (node:net:1646:14)
    next     |         at afterConnectMultiple (node:net:1676:16) {
    next     |       errno: -111,
    next     |       code: 'ECONNREFUSED',
    next     |       syscall: 'connect',
    next     |       address: '::1',
    next     |       port: 9000
    next     |     },
    next     |     Error: connect ECONNREFUSED 127.0.0.1:9000
    next     |         at createConnectionError (node:net:1646:14)
    next     |         at afterConnectMultiple (node:net:1676:16) {
    next     |       errno: -111,
    next     |       code: 'ECONNREFUSED',
    next     |       syscall: 'connect',
    next     |       address: '127.0.0.1',
    next     |       port: 9000
    next     |     }
    next     |   ]
    next     | }
    next     |  ✓ Ready in 242ms
    ```

# Debugging Update 3

1. I changed the `server.js` to include the main function:

    ```javascript
    const main = async () => {
      try {
        const res = await fetch('https://jsonplaceholder.typicode.com/posts/1');
        if (!res.ok) {
          data = 'Network response was not ok.';
        }
        const data = await res.text();
        console.log(data);
      } catch (error) {
        console.log(error);
        console.log(error.cause);
      }
    };

    main();
    ```

2. After I started the Docker container, I checked the logs using `docker-compose logs -f next`:

    ```sh
    PS C:\code\test_8> docker-compose logs -f next
    next  |   ▲ Next.js 14.2.5
    next  |   - Local:        http://f143f7980d0a:3000
    next  |   - Network:      http://172.19.0.3:3000
    next  |
    next  |  ✓ Starting...
    next  |  ✓ Ready in 313ms
    next  | {
    next  |   "userId": 1,
    next  |   "id": 1,
    next  |   "title": "sunt aut facere repellat provident occaecati excepturi optio reprehenderit",
    next  |   "body": "quia et suscipit\nsuscipit recusandae consequuntur expedita et cum\nreprehenderit molestiae ut ut quas totam\nnostrum rerum est autem sunt rem eveniet architecto"
    next

  | }
    ```

# Debugging Update 4

- I ran Next.js after building locally using `node frontend/.next/standalone/server.js`. This is what I got:
    ```sh
    PS C:\code\test_8> node frontend/.next/standalone/server.js
      ▲ Next.js 14.2.5
      - Local:        http://localhost:3000
      - Network:      http://0.0.0.0:3000

     ✓ Starting...
    Hello, Express with TypeScript and CORS!
     ✓ Ready in 158ms
    ```

So it seems this is fully a Docker issue.
