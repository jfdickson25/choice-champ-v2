const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const partySchema = new Schema({
    owner: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    code: {
        type: String,
        required: true
    },
    mediaType: {
        type: String,
        required: true
    },
    secretMode: {
        type: Boolean,
        required: true
    },
    includeWatched: {
        type: Boolean,
        required: true
    },
    superChoice: {
        type: Boolean,
        required: true
    },
    memberCount: {
        type: Number,
        required: true
    },
    items: [
        {
            title: {type: String, required: true},
            poster: {type: String, required: true},
            itemId: {type: Schema.Types.Mixed, required: true},
            watched: {type: Boolean, required: true}
        }
    ]
});

module.exports = mongoose.model("Party", partySchema);