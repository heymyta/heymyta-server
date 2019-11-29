require('dotenv').config();

const config = require('./config');
const express = require('express');
const morgan = require('morgan');
const debug = require('debug');
const session = require('express-session');
const bodyParser = require('body-parser');
const cors = require('cors');
const LevelStore = require('level-session-store')(session);

const log = debug('ta:server');
const req_log = debug('ta:req:static');
const req_api = debug('ta:req:api');

const db = require('./db');
const utilmisc = require('./util/misc');

const app = express();
// For now enable request from anywhere.
// TODO: fix me later.
// app.use(function (req, res, next) {
//     res.header("Access-Control-Allow-Origin", req.header('Origin') || "*");
//     res.header("Access-Control-Allow-Methods", "DELETE, POST, GET, OPTIONS");
//     res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Set-Cookie");
//     res.header("Access-Control-Allow-Credentials", "true");
//     next();
// });
app.use(cors({credentials: true, origin: true, maxAge: 7200}));

app.use(function (req, res, next) {
    req.reqid = utilmisc.genId();
    next();
});
app.use(session({
    cookie: {maxAge: 31556952000, sameSite: false},
    secret: process.env.TOKEN_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new LevelStore(config.datadir + '/session_db')
}));

morgan.token('reqid', function (req, res) {
    return req.reqid;
});
morgan.token('tid', function (req, res) {
    return req.session.teacher ? req.session.teacher.tid : '-';
});
morgan.token('sid', function (req, res) {
    return req.session.student ? req.session.student.sid : '-';
});
morgan.token('raddr', function (req, res) {
    const addr = req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].split(',');
    return (addr && addr[0]) || req.connection.remoteAddress;
});
const morgan_format = '[:reqid :tid :sid] :method :url :status :response-time ms - :res[content-length] [:raddr]';
//app.use('/api', bodyParser.urlencoded({extended: true}));
app.use('/api', bodyParser.json());
app.use('/api', morgan(morgan_format, {stream: {write: msg => req_api(msg.trimEnd())}}));
app.use('/api/teacher', require('./controller/teacher'));
app.use('/api/student', require('./controller/student'));
app.use('/api/admin', require('./controller/admin'));
app.use('/api/queue', require('./controller/queue'));
app.use('/api', require('./controller/generic'));
app.use('/api', (err, req, res, next) => {
    log('Uncaught Error: ', err);
    return res.json({reqid: req.reqid, code: 500, msg: 'Unknown error', err: err.message});
});

const unless = function (prefix, middleware) {
    return function (req, res, next) {
        if (req.path.startsWith(prefix)) {
            return next();
        } else {
            return middleware(req, res, next);
        }
    };
};
app.use(unless('/api', morgan(morgan_format, {stream: {write: msg => req_log(msg.trimEnd())}})));
app.use(unless('/api', express.static('public')));

exports.start = function () {
    const listener = app.listen(process.env.PORT, function () {
        log("Your app is listening on port " + listener.address().port);
    });
};
