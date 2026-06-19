const mongoose = require("mongoose");

const statsSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    scannedSizeGb: { type: Number, default: 0 },
    deletedSizeGb: { type: Number, default: 0 },
    co2SavedKg: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserStats", statsSchema);
