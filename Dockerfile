FROM oven/bun:1.0.5
WORKDIR /usr/src/app
COPY . /usr/src/app
RUN bun install
CMD bun start
