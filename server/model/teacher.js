const db = require('../db');
const utilmisc = require('../util/misc');
const passutil = require('../util/password');

const log = require('debug')('ta:mod:tea');

const modelQueue = require('../model/queue');

exports.putTeacher = async function (user) {
    if (!user.tid) {
        user.tid = utilmisc.genId();
    }
    if (user.rawpass) {
        user.hashpass = await passutil.hash(user.rawpass);
        delete user.rawpass;
    }
    await db.teacher.put(user.username, user);
    log('Put teacher ', user);
};

exports.getHelping = async function (teacher) {
    let stu = await db.teacher_kv.get(`${teacher.tid}:helping`);
    if (stu !== null) {
        stu = modelQueue.get(stu.qid).getStudent(stu.sid);
        if (stu) {
            return stu;
        } else {
            log(req, `WARN stale ${teacher.tid}:helping data: %o`, stu);
        }
    }
    return null;
};

exports.setHelping = async function (teacher, helping) {
    if (helping !== null) {
        await db.teacher_kv.put(`${teacher.tid}:helping`, helping);
    } else {
        await db.teacher_kv.del(`${teacher.tid}:helping`, helping);
    }
};