import { Db, MongoClient } from "mongodb";
import { getMongoConfig } from "./config";

// Server-only MongoDB connection module. Do not import this from client UI code.
let client: MongoClient | undefined;
let db: Db | undefined;

export async function getMongoDb(): Promise<Db> {
  if (db) {
    return db;
  }

  const config = getMongoConfig();
  client = new MongoClient(config.uri, {
    serverSelectionTimeoutMS: config.serverSelectionTimeoutMS,
    connectTimeoutMS: config.connectTimeoutMS,
    socketTimeoutMS: config.socketTimeoutMS,
  });
  await client.connect();
  db = client.db(config.dbName);
  return db;
}

export async function closeMongoDb(): Promise<void> {
  if (client) {
    await client.close();
  }
  client = undefined;
  db = undefined;
}
