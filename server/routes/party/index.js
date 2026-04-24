const express = require('express');
const router = express();

const collectionModel = require('../../models/collection');
const partyModel = require('../../models/party');
const partyCountModel = require('../../models/partyCount');

router
    .get('/exists/:code', async (req, res, next) => {
        // Check if the party with the given code exists
        const partyCode = req.params.code;

        // Find party with the given code
        let party = await partyModel.findOne({code: partyCode});

        // Check if the party exists and return the items if it does exist or return an error if it doesn't
        if (party) {
            res.send({ code: party.code });
        } else {
            res.status(404).send({errorMsg: 'No party found with the given code'});
        }
    })
    .post('/add-member/:code', async (req, res, next) => {
        // Remove a member to the party with the given code
        const partyCode = req.params.code;

        // Find party with the given code
        let party = await partyModel.findOne({code: partyCode});
        party.memberCount++;
        await party.save();
        res.send('Success');
    })
    .post('/remove-member/:code', async (req, res, next) => {
        // Add a member to the party with the given code
        const partyCode = req.params.code;

        // Find party with the given code
        let party = await partyModel.findOne({code: partyCode});
        party.memberCount--;
        await party.save();
        res.send('Success');
    })
    .get('/:code', async (req, res, next) => {
        const partyCode = req.params.code;
        const userId = req.query.userId;

        let party = await partyModel.findOne({code: partyCode});

        if(party === null) {
            return res.status(404).send({ errMsg: 'Party not found' });
        }

        const isOwner = party.owner == userId;
        party.owner = undefined;
        res.send({ party, owner: isOwner });
    })
    .delete('/:code', async (req, res, next) => {
        // Delete the party with the given code
        const partyCode = req.params.code;

        // Find party with the given code
        let party = await partyModel.findOneAndDelete({code: partyCode});
        res.send('Success');
    })
    .post('/', async (req, res, next) => {
        // Create a new collection
        const collectionIDs = req.body.collections;
        const mediaType = req.body.mediaType;
        const secretMode = req.body.secretMode;
        const includeWatched = req.body.includeWatched;
        const superChoice = req.body.superChoice;
        const items = [];
        const owner = req.body.owner;
  
        let partyCode;
        let partyCodeExists = true;

        while(partyCodeExists) {
            // Generate a random 4 digit number
            partyCode = Math.floor(1000 + Math.random() * 9000);

            // Check if the party code already exists in the partyModel database
            // Q: Is there a mongoose method that will return a boolean if the party code exists?
            // A: No, but you can use the .countDocuments() method to return the number of documents that match the query
            let count = await partyModel.countDocuments({code: partyCode.toString()});
            if(count === 0) {
                partyCodeExists = false;
            }
        }

        // Find the collections with the given IDs populate the items field
        let collections = await collectionModel.find({_id: {$in: collectionIDs}}).populate('items');

        collections.forEach(collection => {
            collection.items.forEach(item => {
                items.push(item);
            });
        });

        await new partyModel({
            owner: owner,
            code: partyCode.toString(), 
            mediaType: mediaType, 
            items: items, 
            secretMode: secretMode, 
            includeWatched: includeWatched,
            superChoice: superChoice,
            memberCount: 0
        }).save();
  
        let partyCount = await partyCountModel.findOne();
        partyCount.count++;
        await partyCount.save();
  
        res.send({partyCode: partyCode});
    });


module.exports = router;