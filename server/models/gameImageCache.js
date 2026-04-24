const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const gameImageCacheSchema = new Schema({
    rawgId: { type: Number, required: true, unique: true, index: true },
    title: String,
    posterUrl: String,
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GameImageCache', gameImageCacheSchema);
