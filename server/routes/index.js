const express = require('express');
const router = express();

const partyRoutes = require('./party');
const collectionsRoutes = require('./collections');
const mediaRoutes = require('./media');
const userRoutes = require('./user');
// const controller = require('../controller/controller');

router
    .use('/party', partyRoutes)
    .use('/collections', collectionsRoutes)
    .use('/media', mediaRoutes)
    .use('/user', userRoutes);

module.exports = router;