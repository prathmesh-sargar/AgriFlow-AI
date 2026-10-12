import express from 'express';
import Order from '../models/Order.js';
import Crop from '../models/Crop.js';
import Booking from '../models/Booking.js';
import BlockchainService from '../services/blockchainService.js';
import { runTransportOptimizationAgent } from '../services/aiAgentsService.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import { memoryStore } from '../config/db.js';

const router = express.Router();

// 1. Get Orders based on Role
router.get('/', protect, async (req, res) => {
  try {
    let orders = [];
    try {
      if (req.user.role === 'farmer') {
        orders = await Order.find({ farmerId: req.user.id }).sort({ createdAt: -1 });
      } else if (req.user.role === 'buyer') {
        orders = await Order.find({ buyerId: req.user.id }).sort({ createdAt: -1 });
      } else if (req.user.role === 'transporter') {
        // Transporters see assigned orders or open for pickup
        orders = await Order.find({
          $or: [
            { transporterId: req.user.id },
            { orderStatus: { $in: ['harvest_ready', 'placed', 'transporter_assigned', 'in_transit'] } }
          ]
        }).sort({ createdAt: -1 });
      } else {
        orders = await Order.find().sort({ createdAt: -1 });
      }
    } catch {
      orders = memoryStore.orders.filter(o => {
        if (req.user.role === 'farmer') return o.farmerId === req.user.id;
        if (req.user.role === 'buyer') return o.buyerId === req.user.id;
        if (req.user.role === 'transporter') return o.transporterId === req.user.id || ['harvest_ready', 'placed'].includes(o.orderStatus);
        return true;
      });
    }

    res.json({ success: true, count: orders.length, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Direct Buy / Instant Order Placement
router.post('/instant-buy', protect, authorizeRoles('buyer', 'admin'), async (req, res) => {
  try {
    const { cropId, quantityKg, deliveryLocation } = req.body;
    const qty = Number(quantityKg);

    let crop = null;
    try {
      crop = await Crop.findById(cropId);
    } catch {
      crop = memoryStore.crops.find(c => c._id === cropId);
    }

    if (!crop) return res.status(404).json({ success: false, message: 'Crop not found' });
    if (crop.availableQuantityKg < qty) {
      return res.status(400).json({ success: false, message: 'Requested quantity exceeds stock' });
    }

    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
    const effectivePrice = crop.isUrgentSale && crop.discountPercentage
      ? Math.round(crop.pricePerKg * (1 - crop.discountPercentage / 100))
      : crop.pricePerKg;
    const totalPrice = effectivePrice * qty;

    const orderPayload = {
      orderNumber,
      cropId: crop._id,
      buyerId: req.user.id,
      farmerId: crop.farmerId,
      cropName: crop.cropName,
      quantityKg: qty,
      unitPrice: effectivePrice,
      totalPrice,
      orderStatus: crop.status === 'harvested' ? 'harvest_ready' : 'placed',
      paymentStatus: 'escrow_locked',
      pickupLocation: {
        address: `${crop.location?.village || 'Karveer'}, ${crop.location?.district || 'Kolhapur'}`,
        city: crop.location?.district || 'Kolhapur',
        lat: crop.location?.lat || 16.705,
        lng: crop.location?.lng || 74.2433
      },
      deliveryLocation: deliveryLocation || {
        address: 'APMC Market Yard, Pune',
        city: 'Pune',
        lat: 18.5204,
        lng: 73.8567
      },
      digitalInvoice: {
        invoiceNumber: `INV-${orderNumber}`,
        issuedAt: new Date(),
        taxAmount: Math.round(totalPrice * 0.05),
        netAmount: Math.round(totalPrice * 1.05)
      },
      blockchainTracking: {
        eventsRecorded: ['PRODUCE_HANDOVER'],
        latestTxHash: ''
      }
    };

    let newOrder;
    try {
      newOrder = await Order.create(orderPayload);
      crop.availableQuantityKg -= qty;
      await crop.save();
    } catch {
      newOrder = { _id: `mem_ord_${Date.now()}`, ...orderPayload, createdAt: new Date() };
      memoryStore.orders.unshift(newOrder);
      crop.availableQuantityKg -= qty;
    }

    const block = await BlockchainService.recordEvent('PRODUCE_HANDOVER', {
      orderId: newOrder._id.toString(),
      orderNumber: newOrder.orderNumber,
      cropName: crop.cropName,
      buyerId: req.user.id,
      farmerId: crop.farmerId.toString(),
      quantityKg: qty,
      amountPaid: totalPrice,
      customNotes: `Order placed. Escrow locked at INR ${totalPrice}.`
    });

    if (newOrder.save) {
      newOrder.blockchainTracking.latestTxHash = block.hash;
      await newOrder.save();
    } else {
      newOrder.blockchainTracking.latestTxHash = block.hash;
    }

    res.status(201).json({ success: true, order: newOrder, blockchainTxHash: block.hash });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Update Order Status (Transporter accepts, in-transit, delivered)
router.patch('/:id/status', protect, async (req, res) => {
  try {
    const { orderStatus, proofOfDeliveryNotes } = req.body;
    let order = null;
    try {
      order = await Order.findById(req.params.id);
      if (order) {
        order.orderStatus = orderStatus || order.orderStatus;
        if (req.user.role === 'transporter') order.transporterId = req.user.id;
        if (proofOfDeliveryNotes) order.proofOfDeliveryNotes = proofOfDeliveryNotes;
        if (orderStatus === 'delivered') order.paymentStatus = 'released_to_farmer';
        await order.save();
      }
    } catch {
      const idx = memoryStore.orders.findIndex(o => o._id === req.params.id);
      if (idx !== -1) {
        memoryStore.orders[idx].orderStatus = orderStatus;
        if (req.user.role === 'transporter') memoryStore.orders[idx].transporterId = req.user.id;
        if (proofOfDeliveryNotes) memoryStore.orders[idx].proofOfDeliveryNotes = proofOfDeliveryNotes;
        if (orderStatus === 'delivered') memoryStore.orders[idx].paymentStatus = 'released_to_farmer';
        order = memoryStore.orders[idx];
      }
    }

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Blockchain Event on Delivery
    if (orderStatus === 'delivered') {
      const block = await BlockchainService.recordEvent('DELIVERY_CONFIRMATION', {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        buyerId: order.buyerId.toString(),
        farmerId: order.farmerId.toString(),
        transporterId: req.user.id,
        quantityKg: order.quantityKg,
        customNotes: `Produce successfully delivered to destination. Escrow payout unlocked to farmer.`
      });

      await BlockchainService.recordEvent('PAYMENT_VERIFICATION', {
        orderId: order._id.toString(),
        amountPaid: order.totalPrice,
        status: 'released_to_farmer',
        customNotes: `Full transaction amount INR ${order.totalPrice} settled to farmer.`
      });

      if (order.save) {
        order.blockchainTracking.eventsRecorded.push('DELIVERY_CONFIRMATION', 'PAYMENT_VERIFICATION');
        order.blockchainTracking.latestTxHash = block.hash;
        await order.save();
      }
    }

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Logistics Optimization Route Engine (Transporter Pickup Consolidator)
router.get('/transport-optimization', protect, async (req, res) => {
  try {
    let pendingOrders = [];
    try {
      pendingOrders = await Order.find({
        orderStatus: { $in: ['placed', 'harvest_ready', 'transporter_assigned'] }
      });
    } catch {
      pendingOrders = memoryStore.orders.filter(o => ['placed', 'harvest_ready', 'transporter_assigned'].includes(o.orderStatus));
    }

    const pickups = pendingOrders.map(o => ({
      orderId: o._id,
      orderNumber: o.orderNumber,
      cropName: o.cropName,
      quantityKg: o.quantityKg,
      city: o.pickupLocation?.city || 'Kolhapur',
      lat: o.pickupLocation?.lat || 16.705,
      lng: o.pickupLocation?.lng || 74.2433,
      destinationCity: o.deliveryLocation?.city || 'Pune'
    }));

    const plan = runTransportOptimizationAgent(pickups, 10000);
    res.json({ success: true, plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
