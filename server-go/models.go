package main

import "go.mongodb.org/mongo-driver/bson/primitive"

type Task struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	Text      string             `bson:"text" json:"text"`
	Completed bool               `bson:"completed" json:"completed"`
}
