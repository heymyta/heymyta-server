const express = require('express');
const ash = require('express-async-handler');
const router = module.exports = express.Router();
const log = require('../util/req-log')('ta:ctrl:tea');
const {Validator} = require('node-input-validator');

const db = require('../db');
const passutil = require('../util/password');
const utilmisc = require('../util/misc');

const modelTeacher = require('../model/teacher');
const modelQueue = require('../model/queue');

function clearAuth(req) {
    delete req.session.teacher;
    delete req.session.student;
}

router.post('/login', ash(async (req, res, next) => {
    clearAuth(req);
    const user = await db.teacher.get(req.body.username);
    log(req, 'Got from db[%o], %o', req.body.username, user);
    if (!user) {
        return res.json({code: 401, msg: 'Username is wrong', reqid: req.reqid});
    }
    if (await passutil.check(req.body.password, user.hashpass)) {
        req.session.teacher = JSON.parse(JSON.stringify(user));
        delete req.session.teacher.hashpass;
        log(req, 'Login ok');
        return res.json({code: 0, msg: 'Ok', reqid: req.reqid});
    } else {
        log(req, 'Wrong password');
        return res.json({code: 402, msg: 'Password is wrong', reqid: req.reqid});
    }
}));

router.post('/register', ash(async (req, res, next) => {
    clearAuth(req);
    const valid = await new Validator(req.body, {
        username: 'required|alphaDash|maxLength:128|minLength:1',
        password: 'required|ascii|maxLength:128|minLength:1',
        email: 'required|email',
        invite_code: 'required|ascii|maxLength:128|minLength:1',
        name: 'required|ascii|maxLength:128|minLength:1'
    }).check();
    if (!valid) {
        return res.json({code: 404, msg: 'Invalid data', reqid: req.reqid});
    }
    if (req.body.invite_code !== 'fall2019ta') {
        return res.json({code: 409, msg: 'Invalid invite code', reqid: req.reqid});
    }
    const curUser = await db.teacher.get(req.body.username);
    if (curUser) {
        return res.json({code: 405, msg: 'Duplicated username', reqid: req.reqid});
    }
    await modelTeacher.putTeacher({
        username: req.body.username,
        rawpass: req.body.password,
        email: req.body.email,
        name: req.body.name
    });
    return res.json({code: 0, msg: 'Ok', reqid: req.reqid});
}));

router.use(ash(async (req, res, next) => {
    if (!req.session.teacher) {
        return res.json({code: 403, msg: 'Unauthorized', reqid: req.reqid});
    } else {
        next();
    }
}));

router.get('/me', ash(async (req, res, next) => {
    const ret = utilmisc.clone(req.session.teacher);
    ret.status = {
        helping: modelTeacher.getHelping(req.session.teacher)
    };
    return res.json({code: 0, msg: 'Ok', teacher: ret, reqid: req.reqid});
}));