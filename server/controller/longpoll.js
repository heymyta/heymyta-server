const express = require('express');
const ash = require('express-async-handler');
const log = require('debug')('ta:ctrl:lp');
const {Validator} = require('node-input-validator');
const utilmisc = require('../util/misc');

const respQueue = {};
const timeout = 60000;

module.exports.addConn = function (qid, fn) {
    let a = respQueue[qid];
    if (!a) {
        a = [];
        respQueue[qid] = a;
    }
    a.push({fn, expireAt: utilmisc.now() + timeout});
};

module.exports.triggerAll = function (forced) {
    for (let k in Object.keys(respQueue)) {
        exports.trigger(k, forced);
    }
};

module.exports.trigger = function (qid, forced) {
    // if (forced)
    //     log('trig ' + qid + ' ' + forced);
    const now = utilmisc.now();
    const a = respQueue[qid];
    if (!a) return;
    let i = 0;
    for (; i < a.length; i++) {
        if (forced || now >= a[i].expireAt) {
            //log('trigger ' + forced + `   ${now}  ${a[i].expireAt}`);
            a[i].fn();
        } else {
            break;
        }
    }
    a.splice(0, i);
};

setInterval(() => exports.triggerAll(), 1000);