const express = require('express');
const ash = require('express-async-handler');
const router = module.exports = express.Router();
const log = require('../util/req-log')('ta:ctrl:queue');
const {Validator} = require('node-input-validator');

const db = require('../db');
const passutil = require('../util/password');

const modelTeacher = require('../model/teacher');
const modelQueue = require('../model/queue');
const modelStudent = require('../model/student');

const longpollController = require('./longpoll');

router.get('/get_all', ash(async (req, res, next) => {
    const data = Object.values(modelQueue.queues).map(q => q.summary(req.query.full === 'true'));
    return res.json({code: 0, msg: 'Ok', queues: data, reqid: req.reqid});
}));

router.get('/get/:qid', ash(async (req, res, next) => {
    let q = modelQueue.get(req.params.qid);
    if (!q) {
        return res.json({code: 300, msg: 'Queue not exist', reqid: req.reqid});
    }
    if (req.session.teacher) {
        await q.touchTeacher(req.session.teacher, true);
    }
    if (req.session.student) {
        await q.touchStudent(req.session.student, true);
    }

    const respFn = () => {
        res.json({
            code: 0, msg: 'Ok',
            queue: q.summary(req.query.full === 'true'),
            reqid: req.reqid
        });
    };
    if (req.query.longpoll === 'true') {
        longpollController.addConn(q.qid, respFn);
    } else {
        respFn();
    }
}));

router.use('/teacher', ash(async (req, res, next) => {
    if (!req.session.teacher) {
        return res.json({code: 403, msg: 'Unauthorized', reqid: req.reqid});
    } else {
        next();
    }
}));
router.use('/student', ash(async (req, res, next) => {
    if (!req.session.student) {
        return res.json({code: 403, msg: 'Unauthorized', reqid: req.reqid});
    } else {
        next();
    }
}));

router.post('/teacher/:qid/join', ash(async (req, res, next) => {
    let q = modelQueue.get(req.params.qid);
    if (!q) {
        return res.json({code: 300, msg: 'Queue not exist', reqid: req.reqid});
    }

    const stu = await modelTeacher.getHelping(req.session.teacher);
    if (stu !== null && stu.qid !== parseInt(req.params.qid)) {
        return res.json({code: 316, msg: 'You are helping a student in another queue', helping: stu, reqid: req.reqid});
    } else {
        const joinStatus = await q.touchTeacher(req.session.teacher);
        return res.json({code: 0, msg: 'Ok', joinStatus, reqid: req.reqid});
    }
}));

router.post('/teacher/:qid/leave', ash(async (req, res, next) => {
    let q = modelQueue.get(req.params.qid);
    if (!q) {
        return res.json({code: 300, msg: 'Queue not exist', reqid: req.reqid});
    }

    const stu = await modelTeacher.getHelping(req.session.teacher);
    if (stu !== null && stu.qid !== parseInt(req.params.qid)) {
        return res.json({code: 326, msg: 'You are helping a student in another queue', helping: stu, reqid: req.reqid});
    } else if (stu !== null) {
        return res.json({code: 327, msg: 'You are helping a student in this queue', helping: stu, reqid: req.reqid});
    } else {
        const ok = await q.removeTeacher(req.session.teacher);
        if (!ok) {
            return res.json({code: 328, msg: 'You are not in this queue', reqid: req.reqid});
        } else {
            return res.json({code: 0, msg: 'Ok', reqid: req.reqid});
        }
    }
}));
router.post('/teacher/:qid/pop', ash(async (req, res, next) => {
    const q = modelQueue.get(req.params.qid);
    if (!q) {
        return res.json({code: 407, msg: 'Queue not exist', reqid: req.reqid});
    }

    let stu = await modelTeacher.getHelping(req.session.teacher);
    if (stu !== null) {
        return res.json({
            code: 405, msg: 'You are helping another student',
            student: stu,
            reqid: req.reqid
        });
    }

    const joinStatus = await q.touchTeacher(req.session.teacher);
    stu = await q.popStudent(req.session.teacher);
    if (stu) {
        await modelTeacher.setHelping(req.session.teacher, stu);
        return res.json({
            code: 0, msg: 'Ok',
            student: stu,
            joinStatus,
            reqid: req.reqid
        });
    } else {
        return res.json({
            code: 406, msg: 'No eligible student available',
            joinStatus,
            reqid: req.reqid
        });
    }
}));
router.post('/teacher/:qid/pop/:sid', ash(async (req, res, next) => {
    const q = modelQueue.get(req.params.qid);
    if (!q) {
        return res.json({code: 407, msg: 'Queue not exist', reqid: req.reqid});
    }

    let stu = await modelTeacher.getHelping(req.session.teacher);
    if (stu !== null) {
        return res.json({
            code: 405, msg: 'You are helping another student',
            student: stu,
            reqid: req.reqid
        });
    }

    const joinStatus = await q.touchTeacher(req.session.teacher);
    stu = await q.popStudent(req.session.teacher, req.params.sid);
    if (stu) {
        await modelTeacher.setHelping(req.session.teacher, stu);
        return res.json({
            code: 0, msg: 'Ok',
            student: stu,
            joinStatus,
            reqid: req.reqid
        });
    } else {
        return res.json({
            code: 406, msg: 'Student not found',
            joinStatus,
            reqid: req.reqid
        });
    }
}));
router.post('/teacher/:qid/mark_done', ash(async (req, res, next) => {
    const stu = await modelTeacher.getHelping(req.session.teacher);

    if (stu !== null && stu.qid !== parseInt(req.params.qid)) {
        return res.json({code: 306, msg: 'Teacher is not currently in this queue', helping: stu, reqid: req.reqid});
    } else if (stu === null) {
        return res.json({code: 308, msg: 'Teacher is not helping anyone', reqid: req.reqid});
    } else if (stu.status !== 'resolving') {
        return res.json({code: 309, msg: 'Cannot mark done now', helping: stu, reqid: req.reqid});
    } else {
        // if (req.params.sid !== stu.sid) {
        //     log(req, `WARN params.sid ${req.params.sid} != stu.sid ${stu.sid}`)
        // }
        log(req, 'markdone stu = %o', stu);
        await Promise.all([
            modelQueue.get(stu.qid).markDone(stu),
            modelStudent.setInQueue(stu, null),
            modelTeacher.setHelping(req.session.teacher, null)]);
        return res.json({
            code: 0, msg: 'Ok',
            reqid: req.reqid
        });
    }
}));
router.post('/teacher/:qid/kick/:sid', ash(async (req, res, next) => {
    req.params.sid = parseInt(req.params.sid);
    let q = modelQueue.get(req.params.qid);
    if (!q) {
        return res.json({code: 300, msg: 'Queue not exist', reqid: req.reqid});
    }

    const stu = q.getStudent(req.params.sid);
    if (stu === null) {
        return res.json({code: 310, msg: 'Student not found in queue', reqid: req.reqid});
    } else if (stu.status !== 'waiting') {
        return res.json({code: 308, msg: 'Cannot kick student now', student: stu, reqid: req.reqid});
    } else {
        log(req, 'kick stu = %o', stu);
        await Promise.all([
            modelQueue.get(stu.qid).markDone(stu),
            modelStudent.setInQueue(stu, null),
            stu.assignedTeacher && modelTeacher.setHelping(stu.assignedTeacher, null)]);
        return res.json({
            code: 0, msg: 'Ok',
            reqid: req.reqid
        });
    }
}));


router.post('/student/:qid/join', ash(async (req, res, next) => {
    let q = modelQueue.get(req.params.qid);
    if (!q) {
        return res.json({code: 300, msg: 'Queue not exist', reqid: req.reqid});
    }

    const stuiq = await modelStudent.getInQueue(req.session.student);
    if (stuiq !== null && stuiq.qid !== parseInt(req.params.qid)) {
        return res.json({code: 306, msg: 'Student already in another queue', student: stuiq, reqid: req.reqid});
    } else {
        const joinStatus = await q.touchStudent(req.session.student);
        await modelStudent.setInQueue(req.session.student, q.getStudent(req.session.student.sid));
        return res.json({code: 0, msg: 'Ok', joinStatus, reqid: req.reqid});
    }
}));

router.post('/student/:qid/leave', ash(async (req, res, next) => {
    let q = modelQueue.get(req.params.qid);
    if (!q) {
        return res.json({code: 300, msg: 'Queue not exist', reqid: req.reqid});
    }

    const stuiq = await modelStudent.getInQueue(req.session.student);
    if (stuiq !== null && stuiq.qid !== parseInt(req.params.qid)) {
        return res.json({code: 306, msg: 'Student is not currently in this queue', student: stuiq, reqid: req.reqid});
    } else if (stuiq === null) {
        return res.json({code: 307, msg: 'Student is not in any queue', reqid: req.reqid});
    } else if (stuiq.status !== 'waiting') {
        return res.json({code: 308, msg: 'Cannot leave now', student: stuiq, reqid: req.reqid});
    } else {
        await Promise.all([
            q.markDone(req.session.student),
            modelStudent.setInQueue(req.session.student, null),
            stuiq.assignedTeacher && modelTeacher.setHelping(stuiq.assignedTeacher, null)]);
        return res.json({code: 0, msg: 'Ok', reqid: req.reqid});
    }
}));

router.post('/student/:qid/mark_done', ash(async (req, res, next) => {
    const stuiq = await modelStudent.getInQueue(req.session.student);
    if (stuiq !== null && stuiq.qid !== parseInt(req.params.qid)) {
        return res.json({code: 306, msg: 'Student is not currently in this queue', student: stuiq, reqid: req.reqid});
    } else if (stuiq === null) {
        return res.json({code: 308, msg: 'Student is not in any queue', reqid: req.reqid});
    } else if (stuiq.status !== 'resolving') {
        return res.json({code: 309, msg: 'Cannot mark done now', student: stuiq, reqid: req.reqid});
    } else {
        log(req, 'markdone stu = %o', stuiq);
        modelQueue.get(stuiq.qid).markDone(stuiq);
        await Promise.all([
            modelStudent.setInQueue(req.session.student, null),
            modelTeacher.setHelping(stuiq.assignedTeacher, null)]);
        return res.json({
            code: 0, msg: 'Ok',
            reqid: req.reqid
        });
    }
}));