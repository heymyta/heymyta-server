const express = require('express');
const ash = require('express-async-handler');
const router = express.Router();
const log = require('../util/req-log')('ta:ctrl:admin');

const db = require('../db');
const passutil = require('../util/password');

const modelQueue = require('../model/queue');

router.use(ash(async (req, res, next) => {
    if (req.query.key !== 'gg') {
        log(req, `Unauthorized admin api access`);
        return res.json({code: 403, msg: 'Deo!'});
    }
    next();
}));

router.get('/init_db', ash(async (req, res, next) => {
    await db.init();
    await modelQueue.init();
    return res.json({code: 0, msg: 'Ok'});
}));

router.get('/get_db', ash(async (req, res, next) => {
    const d = db[req.query.db], ret = {};
    await d.iterate((k, v) => ret[k] = v);
    res.json(ret);
}));

module.exports = router;