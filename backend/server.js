import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB, { memoryStore } from './config/db.js';

// Route imports
import authRoutes from './routes/authRoutes.js';
import cropRoutes from './routes/cropRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import aiRoutes from './routes/aiRoutes.js';

// Seed demo data helper
import { seedInitialDataIfEmpty } from './seedData.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/crops', cropRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/ai', aiRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'AgriFlow AI - Smart Agricultural Supply Chain SaaS Platform',
    institution: 'DYPCET Kolhapur - CSE (Data Science)'
  });
});

// Start Server & Initialize Database
const startServer = async () => {
  try {
    await connectDB();
    await seedInitialDataIfEmpty();

    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`🌾 AgriFlow AI Server running at http://localhost:${PORT}`);
      console.log(`📡 Endpoints active:`);
      console.log(`   - Auth & Users:      /api/auth`);
      console.log(`   - Crops Marketplace: /api/crops`);
      console.log(`   - Pre-Harvest Books: /api/bookings`);
      console.log(`   - Orders & Delivery: /api/orders`);
      console.log(`   - 6 AI Decision Hub: /api/ai`);
      console.log(`   - Blockchain Ledger: /api/ai/blockchain/ledger`);
      console.log(`=======================================================`);
    });
  } catch (error) {
    console.error(`Failed to launch server: ${error.message}`);
  }
};

startServer();
