// scripts/db-ping.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set in environment');
    process.exit(1);
  }
  const client = new MongoClient(uri);
  try {
    await client.connect();
    await client.db().admin().ping();
    console.log('MongoDB connection successful!');
    process.exit(0);
  } catch (e) {
    console.error('MongoDB connection failed:', e.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();