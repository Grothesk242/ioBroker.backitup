'use strict';
const fs = require('node:fs');
const getDate = require('../tools').getDate;
const path = require('node:path');
const fse = require('fs-extra');
const fs_async = require('node:fs').promises;

let timerLog;

async function sleep(ms) {
    return new Promise(async (resolve) => {
        // @ts-ignore
        timerLog = setTimeout(async () => resolve(), ms);
    });
}

async function command(options, log, callback) {
    let nameSuffix;
    if (options.hostType === 'Slave') {
        nameSuffix = options.slaveSuffix ? options.slaveSuffix : '';
    } else {
        nameSuffix = options.nameSuffix ? options.nameSuffix : '';
    }
    const fileName = path.join(options.backupDir, `javascripts_${getDate()}${nameSuffix ? `_${nameSuffix}` : ''}_backupiobroker.tar.gz`);

    options.context.fileNames.push(fileName);

    let timer = setInterval(async () => {
        if (fs.existsSync(fileName)) {
            const stats = fs.statSync(fileName);
            const fileSize = Math.floor(stats.size / (1024 * 1024));
            log.debug(`Packed ${fileSize}MB so far...`);
        }
    }, 5000);

    const tmpDir = path.join(options.backupDir, 'tmpScripts').replace(/\\/g, '/');
    const desiredMode = '0o2775';
    if (!fs.existsSync(tmpDir)) {
        try {
            fse.ensureDirSync(tmpDir, desiredMode);
            log.debug(`Created javascript_tmp directory: "${tmpDir}"`);
        } catch (err) {
            log.warn(`Javascript tmp directory "${tmpDir}" cannot created ... ${err}`);
        }
    } else {
        try {
            log.debug(`Try deleting the old javascript_tmp directory: "${tmpDir}"`);
            fse.removeSync(tmpDir);
        } catch (err) {
            log.warn(`Javascript tmp directory "${tmpDir}" cannot deleted ... ${err}`);
        }
        if (!fs.existsSync(tmpDir)) {
            try {
                log.debug(`old javascript_tmp directory "${tmpDir}" successfully deleted`);
                fse.ensureDirSync(tmpDir, desiredMode);
                log.debug('Created javascript_tmp directory');
            } catch (err) {
                log.warn(`Javascript tmp directory "${tmpDir}" cannot created ... ${err}`);
            }
        }
    }

    const obj = await options.adapter.getForeignObjectsAsync('script.*', 'script');

    if (obj) {
        try {
            await fs_async.writeFile(path.join(tmpDir, 'script.json'), JSON.stringify(obj, null, 2));
        } catch (e) {
            log.error(`script.json cannot be written: ${e}`);
        }

        for (const i in obj) {
            log.debug(`found Script: ${obj[i]._id.split('.').pop()}`);
            await sleep(150);
        }
    } else {
        log.warn('Scripts not found');
    }

    if (fs.existsSync(tmpDir) && obj) {

        const compress = require('../targz').compress;

        compress({
            src: tmpDir,
            dest: fileName,
            tar: {
                ignore: name => path.extname(name) === '.gz' || path.extname(name) === '.sbk', // ignore .tar.gz and tar.sbk files when packing
            }
        }, async (err, stdout, stderr) => {
            clearInterval(timer);

            try {

                log.debug(`Try deleting the Javascript tmp directory: "${tmpDir}"`);
                fse.removeSync(tmpDir);
                if (!fs.existsSync(tmpDir)) {
                    log.debug(`Javascript tmp directory "${tmpDir}" successfully deleted`);
                }
            } catch (err) {
                log.warn(`Javascript tmp directory "${tmpDir}" cannot deleted ... ${err}`);
            }
            if (err) {
                options.context.errors.javascripts = err.toString();
                stderr && log.error(stderr);
                clearTimeout(timerLog);
                if (callback) {
                    callback(err, stderr);
                    callback = null;
                }
            } else {
                log.debug(`Backup created: ${fileName}`);
                options.context.done.push('javascripts');
                options.context.types.push('javascripts');
                clearTimeout(timerLog);
                if (callback) {
                    callback(null, stdout);
                    callback = null;
                }
            }
        });
    } else {
        log.warn('javascript Backup not created');
        clearTimeout(timerLog);
        callback && callback(null);
        callback = null;
    }
}

module.exports = {
    command,
    ignoreErrors: true
};
