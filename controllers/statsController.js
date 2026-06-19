const express = require("express");
const router = express.Router();
const UserStats = require("../models/Stats");

router.get("/global", async (req, res) => {
  try {
    const result = await UserStats.aggregate([
      {
        $group: {
          _id: null,
          totalScanned: { $sum: "$scannedSizeGb" },
          totalCleaned: { $sum: "$deletedSizeGb" },
          totalCo2: { $sum: "$co2SavedKg" },
          totalUsers: { $sum: 1 },
        },
      },
    ]);

    const stats = result[0] || {
      totalScanned: 0,
      totalCleaned: 0,
      totalCo2: 0,
      totalUsers: 0,
    };

    res.json(stats);
  } catch (err) {
    console.error("Stats aggregation error:", err);
    res.status(500).json({ error: "Failed to fetch global stats" });
  }
});

router.get("/distribution", async (req, res) => {
  try {
    const brackets = await UserStats.aggregate([
      {
        $bucket: {
          groupBy: "$deletedSizeGb",
          boundaries: [0, 1, 3, 5, 7, 9, 11, 13, 15, Infinity],
          default: "15+",
          output: {
            count: { $sum: 1 },
          },
        },
      },
    ]);

    const labelMap = {
      "0": "0-1 GB",
      "1": "1-3 GB",
      "3": "3-5 GB",
      "5": "5-7 GB",
      "7": "7-9 GB",
      "9": "9-11 GB",
      "11": "11-13 GB",
      "13": "13-15 GB",
      "15+": "15+ GB",
    };

    const distribution = brackets.map((b) => ({
      label: labelMap[b._id] || `${b._id} GB`,
      count: b.count,
    }));

    res.json(distribution);
  } catch (err) {
    console.error("Distribution error:", err);
    res.status(500).json({ error: "Failed to fetch distribution" });
  }
});

router.get("/ecological", async (req, res) => {
  try {
    const global = await UserStats.aggregate([
      {
        $group: {
          _id: null,
          totalCleaned: { $sum: "$deletedSizeGb" },
        },
      },
    ]);

    const totalCleaned = global[0]?.totalCleaned || 0;

    res.json({
      cleanedGb: Math.round(totalCleaned * 100) / 100,
      estimatedRemainingWasteGb: Math.max(totalCleaned * 3, 1000),
      cleanedProportion: totalCleaned > 0 ? 25 : 0,
    });
  } catch (err) {
    console.error("Ecological stats error:", err);
    res.status(500).json({ error: "Failed to fetch ecological stats" });
  }
});

module.exports = router;
