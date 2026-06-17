import "dotenv/config";

export type MongoConfig = {
  uri: string;
  dbName: string;
  serverSelectionTimeoutMS: number;
  connectTimeoutMS: number;
  socketTimeoutMS: number;
};

export function getMongoConfig(): MongoConfig {
  return {
    uri: process.env.MONGODB_URI ?? "mongodb://localhost:27017",
    dbName: process.env.MONGODB_DB_NAME ?? "task_web",
    serverSelectionTimeoutMS: Number(
      process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS ?? 10000
    ),
    connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS ?? 10000),
    socketTimeoutMS: Number(process.env.MONGODB_SOCKET_TIMEOUT_MS ?? 10000),
  };
}
