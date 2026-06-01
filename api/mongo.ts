import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.warn('MONGODB_URI is not configured. MongoDB endpoints will be unavailable.');
}

let clientPromise: Promise<MongoClient> | null = null;

export async function getMongoDb() {
  if (!uri) {
    throw new Error('MONGODB_URI is not configured');
  }

  if (!clientPromise) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000,
    });
    clientPromise = client.connect();
  }

  const client = await clientPromise;
  return client.db('mpca_app');
}
