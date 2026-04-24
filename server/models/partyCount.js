const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const partyCountSchema = new Schema({
    count: {
        type: Number,
        required: true
    }
});

module.exports = mongoose.model("PartyCount", partyCountSchema);