const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const userSchema = new Schema({
    username: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    movieCollections: [
        { type: Schema.Types.ObjectId, ref: "Collection" }
    ],
    tvCollections: [
        { type: Schema.Types.ObjectId, ref: "Collection" }
    ],
    videoGameCollections: [
        { type: Schema.Types.ObjectId, ref: "Collection" }
    ],
    boardGameCollections: [
        { type: Schema.Types.ObjectId, ref: "Collection" }
    ]
});

module.exports = mongoose.model("User", userSchema);