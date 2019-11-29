const db = require('../db');
const utilmisc = require('../util/misc');
const passutil = require('../util/password');

const log = require('debug')('ta:mod:que');
const modelDataJson = require('./data-json');

const longpollController = require('../controller/longpoll');

const Queue = exports.Queue = function (conf) {
    this.qid = conf.qid;
    this.name = conf.name;
    this.desc = conf.desc;
    this.waitingStudents = [];
    this.activeTeachers = {};
    this.activeStudents = {};
};

Queue.prototype.summary = function (full) {
    if (full) {
        return this;
    } else {
        return {
            qid: this.qid,
            waitingStudents: this.waitingStudents,
            activeTeachers: this.activeTeachers,
            activeStudents: this.activeStudents
        };
    }
};

Queue.prototype.touchTeacher = async function (tea, noCreate) {
    let entry = this.activeTeachers[tea.tid], stt = null;
    if (!entry) {
        if (noCreate) {
            return 'no_create';
        }
        entry = utilmisc.clone(tea);
        entry.qid = this.qid;
        entry.lastTouchAt = entry.joinedAt = utilmisc.now();
        entry.status = 'ready';
        this.activeTeachers[tea.tid] = entry;
        log(`Teacher ${tea.tid} joined queue ${this.qid}`);
        stt = 'new';
        longpollController.trigger(this.qid, true);
    } else {
        entry.lastTouchAt = utilmisc.now();
        stt = 'touched';
    }
    await this.persistTeacher(entry);
    return stt;
};

Queue.prototype.touchStudent = async function (stu, noCreate) {
    let entry = this.activeStudents[stu.sid], stt = null;
    if (!entry) {
        if (noCreate) {
            return 'no_create';
        }
        entry = utilmisc.clone(stu);
        entry.qid = this.qid;
        entry.lastTouchAt = entry.joinedAt = utilmisc.now();
        entry.status = 'waiting';
        this.activeStudents[stu.sid] = entry;
        this.waitingStudents.push(stu.sid);
        log(`Student ${stu.sid} joined queue ${this.qid} at pos ${this.waitingStudents.length}`);
        stt = 'new';
        longpollController.trigger(this.qid, true);
    } else {
        entry.lastTouchAt = utilmisc.now();
        stt = 'touched';
    }
    await this.persistStudent(entry);
    return stt;
};

// Queue.prototype.leaveStudent = async function (stu, noCreate) {
//     let entry = this.activeStudents[stu.sid], stt = null;
//     if(!entry) {
//
//     } else {
//
//     }
//     await this.persistStudent(entry);
//     return stt;
// };

Queue.prototype.getStudent = function (sid) {
    return this.activeStudents[sid] || null;
};
Queue.prototype.getTeacher = function (tid) {
    return this.activeTeachers[tid] || null;
};

Queue.prototype.persistStudent = async function (entry, opt) {
    await db.queue_entry[opt || 'put'](`${this.qid}:s:${entry.sid}`, entry);
};
Queue.prototype.persistTeacher = async function (entry, opt) {
    await db.queue_entry[opt || 'put'](`${this.qid}:t:${entry.tid}`, entry);
};


Queue.prototype.popStudent = async function (tea, sid) {
    const resovleStudent = (v) => {
        v.status = 'resolving';
        v.assignedTeacher = tea;
        this.persistStudent(v);
        longpollController.trigger(this.qid, true);
    };
    if (sid) {
        const v = this.activeStudents[sid];
        if (v && v.status === 'waiting') {
            resovleStudent(v);
            return v;
        } else {
            return null;
        }
    }

    const tid = tea.tid;
    for (let i = 0; i < this.waitingStudents.length; i++) {
        const v = this.activeStudents[this.waitingStudents[i]];
        if (v.status === 'waiting') {
            resovleStudent(v);
            return v;
        }
    }
    return null;
};

Queue.prototype.removeTeacher = async function (tea, force) {
    if(this.activeTeachers[tea.tid]) {
        await this.persistTeacher(tea, 'del');
        delete this.activeTeachers[tea.tid];
        longpollController.trigger(this.qid, true);
        return true;
    } else {
        return false;
    }
};

Queue.prototype.markDone = async function (stu) {
    utilmisc.removeItemFromArray(this.waitingStudents, stu.sid);
    await this.persistStudent(stu, 'del');
    delete this.activeStudents[stu.sid];
    longpollController.trigger(this.qid, true);
};

Queue.prototype.sortWaitingStudents = function () {
    this.waitingStudents.sort((a, b) => this.activeStudents[a].joinedAt - this.activeStudents[b].joinedAt);
};

const queues = exports.queues = {};
exports.get = (key) => {
    return queues[key] || null;
};

function addQueue(conf) {
    queues[conf.qid] = new Queue(conf);
}

exports.init = async () => {
    for (let k in Object.keys(queues)) {
        if (queues.hasOwnProperty(k))
            delete queues[k];
    }
    modelDataJson.queue.queues.forEach(conf => addQueue(conf));
    log(`Loaded ${Object.keys(queues).length} queue entry`);

    let cnt_s = 0, cnt_t = 0;
    await db.queue_entry.iterate((key, entry) => {
        const part = key.split(':');
        const q = queues[part[0]];
        if (part[1] === 't') {
            cnt_t++;
            q.activeTeachers[entry.tid] = entry;
        } else {
            cnt_s++;
            q.activeStudents[entry.sid] = entry;
            q.waitingStudents.push(entry.sid);
        }
    });
    for (let k in Object.keys(queues)) {
        if (queues.hasOwnProperty(k))
            queues[k].sortWaitingStudents();
    }
    log(`Loaded ${cnt_t} teachers, ${cnt_s} students to queues`);
};

exports.init();