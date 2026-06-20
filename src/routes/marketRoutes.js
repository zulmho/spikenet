const express = require('express');
const { protect } = require('../middleware/auth');
const overviewRoutes = require('./market/overviewRoutes');
const listingRoutes = require('./market/listingRoutes');
const disputeRoutes = require('./market/disputeRoutes');
const marketAdminRoutes = require('./market/adminRoutes');
const sellerRoutes = require('./market/sellerRoutes');
const walletRoutes = require('./market/walletRoutes');
const tradeRoutes = require('./market/tradeRoutes');

const router = express.Router();

router.use(protect);
router.use(overviewRoutes);
router.use(listingRoutes);
router.use(marketAdminRoutes);
router.use(sellerRoutes);
router.use(walletRoutes);
router.use(tradeRoutes);
router.use(disputeRoutes);

module.exports = router;
