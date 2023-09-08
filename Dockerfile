# From: https://github.com/mattreid1/baojs-railway/blob/main/Dockerfile
FROM jarredsumner/bun:edge
WORKDIR /usr/src/app
COPY . /usr/src/app
RUN bun install
CMD bun start
