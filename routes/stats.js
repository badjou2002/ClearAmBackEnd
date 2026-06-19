const { Router } = require('express');
const Stats = require('../models/Stats');

const router = Router();

router.get('/global', async (_req, res) => {
  try {
    const stats = await Stats.findOne().sort({ timestamp: -1 });
    if (!stats) return res.json({ scannedSizeGb: 0, deletedSizeGb: 0, co2SavedKg: 0, totalScans: 0 });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch global stats' });
  }
});

module.exports = router;
