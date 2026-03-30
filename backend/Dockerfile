FROM golang:1.22-alpine AS build

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./...

FROM alpine:3.20
WORKDIR /app
COPY --from=build /app/server ./server
COPY .env ./.env
EXPOSE 8080
CMD ["./server"]

FROM rust:1.78 as builder

WORKDIR /app

COPY Cargo.toml ./
COPY src ./src
COPY migrations ./migrations

RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/vexis-backend /app/vexis-backend

ENV PORT=8080
EXPOSE 8080

CMD ["/app/vexis-backend"]

