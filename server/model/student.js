const db = require('../db');
const utilmisc = require('../util/misc');
const passutil = require('../util/password');

const log = require('debug')('ta:mod:stu');

const modelTeacher = require('../model/teacher');
const modelQueue = require('../model/queue');
const modelStudent = require('../model/student');

exports.putStudent = async function (user) {
    if (!user.sid) {
        user.sid = utilmisc.genId();
    }
    if (user.rawpass) {
        user.hashpass = await passutil.hash(user.rawpass);
        delete user.rawpass;
    }
    await db.student.put(user.username, user);
    log('Put student ', user);
};

exports.getInQueue = async function (student) {
    let stu = await db.student_kv.get(`${student.sid}:inqueue`);
    if (stu !== null) {
        stu = modelQueue.get(stu.qid).getStudent(stu.sid);
        if (stu) {
            return stu;
        } else {
            log(req, `WARN stale ${student.sid}:inqueue data: %o`, stu);
        }
    }
    return null;
};

exports.setInQueue = async function (student, iq) {
    const op = (iq === null ? 'del' : 'put');
    log(`setInQueue: ${op} sid=${student.sid}: %o`, iq);
    await db.student_kv[op](`${student.sid}:inqueue`, iq);
};