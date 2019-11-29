exports.genId = function () {
    // const hrTime = process.hrtime();
    // return Math.floor(hrTime[0] * 1000000 + hrTime[1] / 1000) - 60000000000;
    return Date.now() - 1574553000000;
};

exports.clone = function (o) {
    return JSON.parse(JSON.stringify(o));
};

exports.now = function () {
    return Date.now();
};

exports.removeItemFromArray = function (array, item) {
    for (let i = 0; i < array.length; i++) {
        if (array[i] === item) {
            array.splice(i, 1);
            break;
        }
    }
};