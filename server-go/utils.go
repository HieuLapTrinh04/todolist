package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func loadEnv() {
    _ = godotenv.Load() // ignore error if .env not present
}

func connectMongo() *mongo.Client {
    uri := os.Getenv("MONGO_URI")
    if uri == "" {
        log.Fatal("MONGO_URI not set")
    }
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
    if err != nil {
        log.Fatalf("mongo connect error: %v", err)
    }
    // ping
    if err := client.Ping(ctx, nil); err != nil {
        log.Fatalf("mongo ping error: %v", err)
    }
    return client
}
