import mongoose from 'mongoose';

// Fallback in-memory state if MONGODB_URI is not configured yet
export const memoryStore = {
  users: [],
  crops: [],
  bookings: [],
  orders: [],
  blocks: [],
  initialized: false
};

const connectDB = async () => {
  const uri = process.env.MONGODB_URI?.trim();

  if (!uri) {
    console.log('ℹ️ No MONGODB_URI found in backend/.env yet.');
    console.log('⚡ Running in Hybrid/Dual Mode: In-memory store active so you can test all features right now.');
    console.log('💡 Once you add your MongoDB Atlas URL to backend/.env, restart the server to use persistent Atlas DB.');
    return;
  }

  try {
    const conn = await mongoose.connect(uri);
    console.log(`✅ MongoDB Atlas Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    console.log('⚡ Fallback: In-memory store available for ongoing sessions.');
  }
};

export default connectDB;
