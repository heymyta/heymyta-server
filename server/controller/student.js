const express = require('express');
const ash = require('express-async-handler');
const router = module.exports = express.Router();
const log = require('../util/req-log')('ta:ctrl:stu');
const {Validator} = require('node-input-validator');

const db = require('../db');
const passutil = require('../util/password');
const utilmisc = require('../util/misc');

const modelTeacher = require('../model/teacher');
const modelStudent = require('../model/student');

function clearAuth(req) {
    delete req.session.teacher;
    delete req.session.student;
}

router.post('/login', ash(async (req, res, next) => {
    clearAuth(req);
    const valid = await new Validator(req.body, {
        name: 'required|ascii|maxLength:128|minLength:1',
        email: 'email',
    }).check();
    if (!valid) {
        return res.json({code: 404, msg: 'Invalid data', reqid: req.reqid});
    }

    let user = await db.student.get(req.body.name);
    log(req, 'Got from db[%o], %o', req.body.name, user);
    if (!user) {
        user = {
            username: req.body.name,
            email: req.body.email
        };
        modelStudent.putStudent(user);
        req.session.student = utilmisc.clone(user);
        return res.json({code: 0, msg: 'Ok', newStudent: true, student: user, reqid: req.reqid});
    } else {
        req.session.student = utilmisc.clone(user);
        return res.json({code: 0, msg: 'Ok', newStudent: false, student: user, reqid: req.reqid});
    }
}));

router.use(ash(async (req, res, next) => {
    if (!req.session.student) {
        return res.json({code: 403, msg: 'Unauthorized', reqid: req.reqid});
    } else {
        next();
    }
}));

router.get('/me', ash(async (req, res, next) => {
    const ret = utilmisc.clone(req.session.student);
    ret.status = {
        inQueue: await modelStudent.getInQueue(req.session.student)
    };
    return res.json({code: 0, msg: 'Ok', student: ret, reqid: req.reqid});
    //return res.json({code: 0, msg: 'Ok', student: req.session.student, reqid: req.reqid});
}));