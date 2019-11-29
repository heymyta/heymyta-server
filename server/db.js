const config = require('./config');
const log = require('debug')('ta:db');
const levelup = require('levelup');
const leveldown = require('leveldown');
const LRU = require('lru-cache');

function JsonDbWrapper(db, lrusize) {
    this.db = db;
    this.lru = new LRU(lrusize);
}

JsonDbWrapper.prototype.get = async function (key) {
    let value = this.lru.get(key);
    if (value !== undefined) {
        return value;
    }
    try {
        value = JSON.parse(await this.db.get(key));
        this.lru.set(key, value);
        return value;
    } catch (err) {
        if (err.notFound) {
            return null;
        } else {
            throw err;
        }
    }
};

JsonDbWrapper.prototype.put = async function (key, value) {
    this.lru.set(key, value);
    await this.db.put(key, JSON.stringify(value));
};

JsonDbWrapper.prototype.del = async function (key) {
    this.lru.del(key);
    await this.db.del(key);
};

JsonDbWrapper.prototype.clear = async function () {
    this.lru.reset();
    await this.db.clear();
};

JsonDbWrapper.prototype.iterate = async function (eachcb) {
    return new Promise((resolve, reject) => {
        this.db.createReadStream()
            .on('data', function (data) {
                if (eachcb) eachcb(data.key.toString('utf8'), JSON.parse(data.value));
            })
            .on('error', function (err) {
                log('Db iterate error: ', err);
                reject(err);
            })
            .on('end', function () {
                resolve();
            });
    });
};

const listDb = module.exports.listDb = [];

function createDb(name, lrusize) {
    const db = levelup(leveldown(`${config.datadir}/${name}_db`));
    const jsonDb = new JsonDbWrapper(db, lrusize || 100);
    this[name] = exports[name] = jsonDb;
    listDb.push(jsonDb);
}

createDb('teacher');
createDb('teacher_kv');
createDb('student');
createDb('student_kv');
createDb('queue');
createDb('queue_entry');

const modelTeacher = require('./model/teacher');
exports.init = async function () {
    listDb.forEach(d => d.clear());

    await modelTeacher.putTeacher({username: 'kh', rawpass: '123456'});
    await modelTeacher.putTeacher({username: 'a', rawpass: '123'});
    await modelTeacher.putTeacher({username: 'test1', rawpass: 'asd'});

};