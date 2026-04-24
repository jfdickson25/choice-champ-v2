const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const collectionSchema = new Schema({
    owner: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    shareCode: {
        type: Number,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    type: {
        type: String,
        required: true
    },
    items: [
        {
            title: {type: String, required: true},
            poster: {type: String, required: false},
            watched: {type: Boolean, required: true},
            timestamp: {type: Number, required: false},
            itemId: {type: Schema.Types.Mixed, required: true},
        }
    ]
});

module.exports = mongoose.model("Collection", collectionSchema);