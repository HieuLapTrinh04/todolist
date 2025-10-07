package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gorilla/mux"
	"github.com/rs/cors"
)

func main() {
	loadEnv()
	r := mux.NewRouter()

	api := r.PathPrefix("/api").Subrouter()
	api.HandleFunc("/tasks", GetTasks).Methods("GET")
	api.HandleFunc("/tasks", CreateTask).Methods("POST")
	api.HandleFunc("/tasks/{id}", DeleteTask).Methods("DELETE")
	api.HandleFunc("/tasks/{id}", UpdateTask).Methods("PUT", "PATCH")

	// CORS - allow localhost:3000 (React dev)
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://127.0.0.1:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	})

	handler := c.Handler(r)

	port := os.Getenv("PORT")
	if port == "" {
		port = "5000"
	}
	log.Printf("Server running on :%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, handler))
}
