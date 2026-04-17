import "server-only";

import { MongoClient, type Collection, type Db, type Document } from "mongodb";

declare global {
  var __mongodbClientPromise: Promise<MongoClient> | undefined;
  var __mongodbDatabasePromise: Promise<Db> | undefined;
}

function getMongoClientPromise() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }

  if (!globalThis.__mongodbClientPromise) {
    const client = new MongoClient(uri);
    globalThis.__mongodbClientPromise = client.connect().then((connectedClient) => {
      console.log("MongoDB connected");
      return connectedClient;
    });
  }

  return globalThis.__mongodbClientPromise;
}

async function getDatabasePromise() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }

  if (!globalThis.__mongodbDatabasePromise) {
    globalThis.__mongodbDatabasePromise = getMongoClientPromise().then(async (client) => {
      const database = client.db();
      const existingCollection = await database
        .listCollections({ name: "logs" }, { nameOnly: true })
        .toArray();

      if (existingCollection.length === 0) {
        await database.createCollection("logs");
      }

      return database;
    });
  }

  return globalThis.__mongodbDatabasePromise;
}

export async function getLogsCollection<TSchema extends Document = Document>(): Promise<Collection<TSchema>> {
  const database = await getDatabasePromise();
  return database.collection<TSchema>("logs");
}
