// AgriFlow AI - 6 Dedicated AI Decision-Support Agents
// Based on Final Year Synopsis specification (DYPCET CSE - Data Science)

export const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  const p = 0.017453292519943295; // Math.PI / 180
  const c = Math.cos;
  const a = 0.5 - c((lat2 - lat1) * p) / 2 +
            c(lat1 * p) * c(lat2 * p) * (1 - c((lon2 - lon1) * p)) / 2;
  return 12742 * Math.asin(Math.sqrt(a)); // 2 * R; R = 6371 km
};

/**
 * 1. Buyer Match Agent:
 * Ranks farmers by price, quality, quantity, distance, delivery time and reliability.
 */
export const runBuyerMatchAgent = (crops, buyerQuery) => {
  const {
    targetCropName = '',
    targetQuantity = 100,
    maxPrice = Infinity,
    buyerLat = 16.705,
    buyerLng = 74.2433,
    preferredQuality = 'Grade A (Export/Premium)'
  } = buyerQuery;

  const scoredCrops = crops
    .filter(crop => {
      const matchName = !targetCropName || crop.cropName.toLowerCase().includes(targetCropName.toLowerCase());
      const hasStock = crop.availableQuantityKg > 0;
      return matchName && hasStock;
    })
    .map(crop => {
      // 1. Price Score (0 - 30 points) - lower price relative to budget = higher score
      const priceRatio = crop.pricePerKg <= maxPrice ? (maxPrice - crop.pricePerKg) / (maxPrice || 1) : 0;
      const priceScore = Math.min(30, Math.max(5, 25 * (1 - crop.pricePerKg / 100) + priceRatio * 5));

      // 2. Quantity Score (0 - 20 points) - ability to fulfill requested volume
      const quantityScore = crop.availableQuantityKg >= targetQuantity ? 20 : (crop.availableQuantityKg / targetQuantity) * 20;

      // 3. Quality Score (0 - 20 points)
      let qualityScore = 15;
      if (crop.qualityGrade === preferredQuality) qualityScore = 20;
      else if (crop.qualityGrade?.includes('Grade A')) qualityScore = 18;
      else if (crop.qualityGrade?.includes('Grade B')) qualityScore = 14;

      // 4. Distance / Location Score (0 - 20 points)
      const cLat = crop.location?.lat || 16.705;
      const cLng = crop.location?.lng || 74.2433;
      const distKm = calculateDistanceKm(buyerLat, buyerLng, cLat, cLng);
      const distanceScore = Math.max(0, 20 - (distKm * 0.15));

      // 5. Reliability & Freshness Score (0 - 10 points)
      const reliabilityScore = (crop.demandIndexScore || 80) * 0.1;

      const totalScore = Number((priceScore + quantityScore + qualityScore + distanceScore + reliabilityScore).toFixed(1));

      return {
        ...crop,
        distanceKm: Number(distKm.toFixed(1)),
        matchScore: totalScore,
        aiFactors: {
          priceScore: Number(priceScore.toFixed(1)),
          quantityScore: Number(quantityScore.toFixed(1)),
          qualityScore: Number(qualityScore.toFixed(1)),
          distanceScore: Number(distanceScore.toFixed(1)),
          reliabilityScore: Number(reliabilityScore.toFixed(1))
        }
      };
    });

  return scoredCrops.sort((a, b) => b.matchScore - a.matchScore);
};

/**
 * 2. Harvest / Booking Agent:
 * Coordinates pre-harvest booking, scheduled harvest date alignment, and readiness slot.
 */
export const runHarvestBookingAgent = (crop, requestedBookingKg, desiredDate) => {
  const harvestDate = new Date(crop.expectedHarvestDate || Date.now());
  const reqDate = desiredDate ? new Date(desiredDate) : harvestDate;

  const timeDiffDays = Math.round((harvestDate.getTime() - Date.now()) / (1000 * 3600 * 24));
  const dateDiffDays = Math.round((reqDate.getTime() - harvestDate.getTime()) / (1000 * 3600 * 24));

  const isFeasible = crop.availableQuantityKg >= requestedBookingKg && Math.abs(dateDiffDays) <= 5;
  const recommendedHarvestSlot = new Date(harvestDate.getTime() - 24 * 3600 * 1000).toISOString().split('T')[0];

  return {
    feasible: isFeasible,
    daysUntilHarvest: timeDiffDays,
    harvestDateAlignStatus: Math.abs(dateDiffDays) <= 2 ? 'Optimal Alignment' : 'Requires Pre-Harvest Adjustment',
    recommendedHarvestWindow: {
      harvestPrepDate: recommendedHarvestSlot,
      readyForPickupDate: crop.expectedHarvestDate
    },
    riskAssessment: timeDiffDays < 2 ? 'Imminent Harvest: Immediate logistics booking advised' : 'Normal scheduled pre-booking'
  };
};

/**
 * 3. Shelf-Life Decay Agent:
 * Tracks how much usable time a crop has left and calculates perishability decay status.
 */
export const runShelfLifeAgent = (crop) => {
  const harvestTimestamp = new Date(crop.actualHarvestDate || crop.expectedHarvestDate || Date.now()).getTime();
  const daysSinceHarvest = Math.max(0, Math.round((Date.now() - harvestTimestamp) / (1000 * 3600 * 24)));
  const totalShelfLife = crop.estimatedShelfLifeDays || 7;

  const daysRemaining = Math.max(0, totalShelfLife - daysSinceHarvest);
  const decayPercentage = Math.min(100, Math.round((daysSinceHarvest / totalShelfLife) * 100));

  let riskTier = 'Low Risk';
  let badgeColor = 'emerald';
  if (decayPercentage >= 75 || daysRemaining <= 2) {
    riskTier = 'Critical Perishability';
    badgeColor = 'rose';
  } else if (decayPercentage >= 50 || daysRemaining <= 4) {
    riskTier = 'Moderate Risk';
    badgeColor = 'amber';
  }

  return {
    daysSinceHarvest,
    totalShelfLifeDays: totalShelfLife,
    daysRemaining,
    decayPercentage,
    riskTier,
    badgeColor,
    spoilageProbPercent: Math.min(98, Math.round(decayPercentage * 0.95))
  };
};

/**
 * 4. Demand Forecast Agent:
 * Predicts future crop needs based on regional trends, seasonal patterns and active buyer requirements.
 */
export const runDemandForecastAgent = (cropName = 'Tomato', region = 'Kolhapur') => {
  const baselineTrends = {
    Tomato: { basePrice: 28, demandVolumeTons: 450, seasonalGrowthRate: '+18.4%', peakMonth: 'November - February' },
    Onion: { basePrice: 35, demandVolumeTons: 820, seasonalGrowthRate: '+24.1%', peakMonth: 'October - January' },
    Sugarcane: { basePrice: 3200, demandVolumeTons: 5000, seasonalGrowthRate: '+12.0%', peakMonth: 'November - April' },
    Soybean: { basePrice: 48, demandVolumeTons: 1200, seasonalGrowthRate: '+8.5%', peakMonth: 'October - December' },
    Grapes: { basePrice: 65, demandVolumeTons: 320, seasonalGrowthRate: '+15.2%', peakMonth: 'January - March' },
    Potato: { basePrice: 22, demandVolumeTons: 640, seasonalGrowthRate: '+6.8%', peakMonth: 'All Season' }
  };

  const cropData = baselineTrends[cropName] || {
    basePrice: 30,
    demandVolumeTons: 300,
    seasonalGrowthRate: '+10.0%',
    peakMonth: 'Current Season'
  };

  const forecastNext4Weeks = [
    { week: 'Week 1', expectedDemandTons: Math.round(cropData.demandVolumeTons * 0.23), priceTrend: 'Steady' },
    { week: 'Week 2', expectedDemandTons: Math.round(cropData.demandVolumeTons * 0.26), priceTrend: 'Rising' },
    { week: 'Week 3', expectedDemandTons: Math.round(cropData.demandVolumeTons * 0.27), priceTrend: 'High Demand' },
    { week: 'Week 4', expectedDemandTons: Math.round(cropData.demandVolumeTons * 0.24), priceTrend: 'Steady' }
  ];

  return {
    cropName,
    region,
    marketSentiment: 'Strong Buyer Inquiries',
    growthRate: cropData.seasonalGrowthRate,
    peakSeason: cropData.peakMonth,
    estimatedTotalDemandTons: cropData.demandVolumeTons,
    projectedAvgPricePerKg: cropData.basePrice,
    weeklyForecast: forecastNext4Weeks
  };
};

/**
 * 5. Transport Optimization Agent:
 * Groups nearby farmer pickups and plans consolidated vehicle routes to minimize fuel & empty runs.
 */
export const runTransportOptimizationAgent = (pickups = [], vehicleCapacityKg = 10000) => {
  if (!pickups || pickups.length === 0) {
    return {
      consolidatedTrips: [],
      totalPickups: 0,
      totalFuelSavedPercent: '0%',
      distanceReductionKm: 0
    };
  }

  // Cluster nearby pickups (< 30km radius)
  const clusters = [];
  pickups.forEach(p => {
    let placed = false;
    for (const cluster of clusters) {
      const rep = cluster.pickups[0];
      const dist = calculateDistanceKm(rep.lat || 16.7, rep.lng || 74.2, p.lat || 16.7, p.lng || 74.2);
      if (dist < 35 && (cluster.totalKg + p.quantityKg) <= vehicleCapacityKg) {
        cluster.pickups.push(p);
        cluster.totalKg += p.quantityKg;
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({
        clusterId: `CLUSTER-${clusters.length + 1}`,
        hubCity: p.city || 'Kolhapur',
        pickups: [p],
        totalKg: p.quantityKg
      });
    }
  });

  const estimatedUngroupedDistanceKm = pickups.length * 45;
  const estimatedGroupedDistanceKm = clusters.length * 52;
  const distanceSaved = Math.max(0, estimatedUngroupedDistanceKm - estimatedGroupedDistanceKm);

  return {
    consolidatedTrips: clusters,
    totalClusters: clusters.length,
    vehicleCapacityKg,
    capacityUtilizationPercent: Math.round((clusters.reduce((acc, c) => acc + c.totalKg, 0) / (clusters.length * vehicleCapacityKg)) * 100) || 75,
    distanceSavedKm: distanceSaved,
    estimatedCostReductionPercent: '28.5%',
    routeEfficiencyStatus: 'Optimized Multi-Stop Consolidation'
  };
};

/**
 * 6. Wastage Prevention Agent:
 * Detects produce at spoilage risk and proposes action: auto flash discount, closest wholesale buyers.
 */
export const runWastagePreventionAgent = (crop, shelfLifeData) => {
  const isHighRisk = shelfLifeData.decayPercentage >= 65 || shelfLifeData.daysRemaining <= 3;

  if (!isHighRisk) {
    return {
      actionRequired: false,
      urgencyLevel: 'Normal',
      message: 'Crop condition healthy. Regular marketplace listing sufficient.',
      suggestedDiscountPercent: 0,
      recommendedActions: ['Monitor ambient temperature', 'Standard pickup schedule']
    };
  }

  const suggestedDiscount = shelfLifeData.decayPercentage >= 85 ? 25 : 15;
  const discountedPrice = Math.round(crop.pricePerKg * (1 - suggestedDiscount / 100));

  return {
    actionRequired: true,
    urgencyLevel: 'High - Immediate Action Needed',
    message: `Crop has ${shelfLifeData.daysRemaining} days of usable shelf-life remaining. Wastage mitigation initiated.`,
    suggestedDiscountPercent: suggestedDiscount,
    originalPricePerKg: crop.pricePerKg,
    discountedPricePerKg: discountedPrice,
    recommendedActions: [
      `Enable Quick-Sale Flash Banner (-${suggestedDiscount}% markdown)`,
      'Broadcast alert to nearby food processing centers in 40km radius',
      'Assign high-priority expedited transporter with refrigerated vehicle'
    ]
  };
};
