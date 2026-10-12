import express from 'express';
import Booking from '../models/Booking.js';
import Crop from '../models/Crop.js';
import BlockchainService from '../services/blockchainService.js';
import { runHarvestBookingAgent } from '../services/aiAgentsService.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import { memoryStore } from '../config/db.js';

const router = express.Router();

// 1. Get all bookings (Farmer sees their received bookings, Buyer sees their made bookings)
router.get('/', protect, async (req, res) => {
  try {
    let bookings = [];
    try {
      if (req.user.role === 'farmer') {
        bookings = await Booking.find({ farmerId: req.user.id }).sort({ createdAt: -1 });
      } else if (req.user.role === 'buyer') {
        bookings = await Booking.find({ buyerId: req.user.id }).sort({ createdAt: -1 });
      } else {
        bookings = await Booking.find().sort({ createdAt: -1 });
      }
    } catch {
      bookings = memoryStore.bookings.filter(b => {
        if (req.user.role === 'farmer') return b.farmerId === req.user.id;
        if (req.user.role === 'buyer') return b.buyerId === req.user.id;
        return true;
      });
    }

    res.json({ success: true, count: bookings.length, bookings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Create Pre-Harvest Booking with AI Feasibility & Blockchain Hash
router.post('/', protect, authorizeRoles('buyer', 'admin'), async (req, res) => {
  try {
    const { cropId, bookedQuantityKg, desiredFulfillmentDate, notes } = req.body;
    const qty = Number(bookedQuantityKg);

    if (!cropId || !qty || qty <= 0) {
      return res.status(400).json({ success: false, message: 'Valid cropId and bookedQuantityKg required' });
    }

    // Retrieve crop
    let crop = null;
    try {
      crop = await Crop.findById(cropId);
    } catch {
      crop = memoryStore.crops.find(c => c._id === cropId);
    }

    if (!crop) {
      return res.status(404).json({ success: false, message: 'Crop listing not found' });
    }

    if (crop.availableQuantityKg < qty) {
      return res.status(400).json({
        success: false,
        message: `Requested quantity exceeds available stock (${crop.availableQuantityKg} kg available)`
      });
    }

    // Run AI Harvest / Booking Agent
    const aiAnalysis = runHarvestBookingAgent(crop, qty, desiredFulfillmentDate);

    const unitPrice = crop.pricePerKg;
    const totalAmount = unitPrice * qty;

    const bookingPayload = {
      cropId: crop._id,
      farmerId: crop.farmerId,
      buyerId: req.user.id,
      buyerName: req.user.name,
      cropName: crop.cropName,
      bookedQuantityKg: qty,
      agreedPricePerKg: unitPrice,
      totalAmount,
      status: 'confirmed',
      advancePaymentAmount: Math.round(totalAmount * 0.2), // 20% commitment advance
      expectedFulfillmentDate: desiredFulfillmentDate ? new Date(desiredFulfillmentDate) : crop.expectedHarvestDate,
      notes: notes || 'Pre-harvest contract binding supply guarantee.'
    };

    let newBooking;
    try {
      newBooking = await Booking.create(bookingPayload);
      crop.availableQuantityKg -= qty;
      await crop.save();
    } catch {
      newBooking = {
        _id: `mem_bk_${Date.now()}`,
        ...bookingPayload,
        createdAt: new Date()
      };
      memoryStore.bookings.unshift(newBooking);
      crop.availableQuantityKg -= qty;
    }

    // Blockchain Event: Pre-Harvest Supply Contract Handover Guarantee
    const block = await BlockchainService.recordEvent('PRODUCE_HANDOVER', {
      bookingId: newBooking._id.toString(),
      cropId: crop._id.toString(),
      cropName: crop.cropName,
      farmerId: crop.farmerId.toString(),
      buyerId: req.user.id,
      quantityKg: qty,
      amountPaid: newBooking.advancePaymentAmount,
      customNotes: `Pre-harvest reservation confirmed. 20% advance locked in smart contract escrow.`
    });

    if (newBooking.save) {
      newBooking.blockchainHash = block.hash;
      await newBooking.save();
    } else {
      newBooking.blockchainHash = block.hash;
    }

    res.status(201).json({
      success: true,
      booking: newBooking,
      aiAnalysis,
      blockchainTxHash: block.hash
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
