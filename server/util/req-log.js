const debug = require('debug');

module.exports = function(name) {
    const log = debug(name);
    return function(req, msg, ...args) {
        const tid = req.session.teacher ? req.session.teacher.tid : '-';
        const sid = req.session.student ? req.session.student.sid : '-';
        log(`[${req.reqid} ${tid} ${sid}] `+msg, ...args);
    }
};