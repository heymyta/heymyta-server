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

router.get('/logout', ash(async (req, res, next) => {
  clearAuth(req);
  return res.json({code: 0, msg: 'Ok', reqid: req.reqid});
}));

router.get('/ping', ash(async (req, res, next) => {
    return res.json({code: 0, msg: 'Ok', reqid: req.reqid});
}));

router.get('/me', ash(async (req, res, next) => {
    if (req.session.teacher) {
        return res.json({code: 0, msg: 'Ok', type: 'teacher', teacher: req.session.teacher, reqid: req.reqid});
    }
    if (req.session.student) {
        return res.json({code: 0, msg: 'Ok', type: 'student', student: req.session.student, reqid: req.reqid});
    }
    return res.json({code: 350, msg: 'Not logged in', reqid: req.reqid});
}));