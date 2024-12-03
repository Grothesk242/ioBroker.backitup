'use strict';

const tools = require('../tools');
const path = require('node:path');
const fs = require('node:fs');
const backupDir = path.join(tools.getIobDir(), 'backups').replace(/\\/g, '/');

function list(restoreSource, options, types, log, callback) {
    if (options.enabled && (!restoreSource || restoreSource === 'cifs')) {
        if (options.mountType === 'CIFS' || options.mountType === 'NFS' || options.mountType === 'Expert') {
            mount(options, log, error => {
                error && log.error(error);
                nasList(restoreSource, options, types, log, callback);
            });
        } else {
            nasList(restoreSource, options, types, log, callback);
        }
    } else {
        setImmediate(callback);
    }
}

function nasList(restoreSource, options, types, log, callback) {
    if (options.enabled && (!restoreSource || restoreSource === 'cifs')) {
        let dir = backupDir.replace(/\\/g, '/');

        if (options.mountType === 'Copy') {
            if (options.ownDir === true) {
                dir = options.dirMinimal.replace(/\\/g, '/');
            } else
                if (options.ownDir === false) {
                    dir = options.dir.replace(/\\/g, '/');
                }
            if (dir[0] !== '/' && !dir.match(/\w:/)) {
                dir = `/${dir || ''}`;
            }
        } else {
            if (dir[0] !== '/' && !dir.match(/\w:/)) {
                dir = `/${dir || ''}`;
            }
        }

        const files = {};
        if (fs.existsSync(dir)) {
            try {
                let result = fs.readdirSync(dir).sort().map(file => path.join(dir, file).replace(/\\/g, '/'));

                if (result && result.length) {
                    result = result.map(file => {
                        const stat = fs.statSync(file);
                        return { path: file, name: file.split('/').pop(), size: stat.size };
                    }).filter(file => (types.indexOf(file.name.split('_')[0]) !== -1 || types.indexOf(file.name.split('.')[0]) !== -1) && file.name.split('.').pop() == 'gz');

                    result.forEach(file => {
                        const type = file.name.split('_')[0];
                        files[type] = files[type] || [];
                        files[type].push(file);
                    });
                }
            } catch (e) {
                log.warn(`Source cannot be reached: ${e}`);
            }
        }
        callback && callback(null, files, 'nas / copy');
    } else {
        setImmediate(callback);
    }
}

function copyFileCifs(options, fileName, toStoreName, log, callback) {
    try {
        log.debug(`Get file ${fileName}`);
        log.debug(`Mount type: ${options.mountType != undefined ? options.mountType : 'Copy'}`);

        if (options.mountType === 'CIFS' || options.mountType === 'NFS' || options.mountType === 'Expert') {
            callback && callback(null);
        } else {
            const fse = require('fs-extra');

            fse.copy(fileName, toStoreName, err => {
                err && log.error(err);
                callback && callback(null);
            });
        }
    } catch (e) {
        log.error(e);

        if (options.mountType === 'CIFS' || options.mountType === 'NFS' || options.mountType === 'Expert') {
            umount(options, log, error => callback(error));
        } else {
            callback && callback(e);
        }
    }
}

function getFile(options, fileName, toStoreName, log, callback) {
    if (options && options.enabled) {
        if (options.mountType === 'CIFS' || options.mountType === 'NFS' || options.mountType === 'Expert') {
            callback && callback(null);
        } else {
            copyFileCifs(options, fileName, toStoreName, log, callback);
        }
    } else {
        setImmediate(callback, 'Not configured');
    }
}

function mount(options, log, callback) {
    let child_process = require('node:child_process');

    let dir = options.dir;

    if (options.ownDir === true) {
        dir = options.dirMinimal;
    }

    if (fs.existsSync(`${options.fileDir}/.mount`)) {

        child_process.exec(`mount | grep -o "${backupDir}"`, (error, stdout, stderr) => {
            if (stdout.includes(backupDir)) {
                child_process.exec(`${options.sudo ? 'sudo umount' : 'umount'} ${backupDir}`, (error, stdout, stderr) => {
                    if (error) {
                        log.debug('device is busy... wait 2 Minutes!!');
                        setTimeout(function () {
                            child_process.exec(`${options.sudo ? 'sudo umount' : 'umount'} -l ${backupDir}`, (error, stdout, stderr) => {
                                if (error) {
                                    log.error(stderr);
                                } else {
                                    try {
                                        fs.existsSync(`${options.fileDir}/.mount`) && fs.unlinkSync(`${options.fileDir}.mount`);
                                    } catch (e) {
                                        log.debug(`file ".mount" cannot deleted: ${e}`);
                                    }
                                }
                            });
                        }, 120000);
                    } else {
                        try {
                            fs.existsSync(`${options.fileDir}/.mount`) && fs.unlinkSync(`${options.fileDir}/.mount`);
                        } catch (e) {
                            log.debug(`file ".mount" cannot deleted: ${e}`);
                        }
                    }
                });
            }
        });
    }

    if (options.mountType === 'CIFS') {
        if (!options.mount.startsWith('//')) {
            options.mount = `//${options.mount}`;
        }

        if (!dir.startsWith('/')) {
            dir = `/${dir}`;
        }

        if ((!options.pass.startsWith(`"`) || !options.pass.endsWith(`"`)) &&
            (!options.pass.startsWith(`'`) || !options.pass.endsWith(`'`))
        ) {
            options.pass = `"${options.pass}"`;
        }

        log.debug(`cifs-mount command: "${options.sudo ? 'sudo mount' : 'mount'} -t cifs -o ${options.user ? `username=${options.user},password=****` : ''}${options.cifsDomain ? `,domain=${options.cifsDomain}` : ''}${options.clientInodes ? ',noserverino' : ''}${options.cacheLoose ? ',cache=loose' : ''},rw,forceuid,uid=iobroker,forcegid,gid=iobroker,file_mode=0777,dir_mode=0777,${options.smb} ${options.mount}${dir} ${backupDir}"`);
        child_process.exec(`${options.sudo ? 'sudo mount' : 'mount'} -t cifs -o ${options.user ? `username=${options.user},password=${options.pass}` : ''}${options.cifsDomain ? `,domain=${options.cifsDomain}` : ''}${options.clientInodes ? ',noserverino' : ''}${options.cacheLoose ? ',cache=loose' : ''},rw,forceuid,uid=iobroker,forcegid,gid=iobroker,file_mode=0777,dir_mode=0777,${options.smb} ${options.mount}${dir} ${backupDir}`, (error, stdout, stderr) => {
            if (error) {
                log.debug('first mount attempt with smb option failed. try next mount attempt without smb option ...');
                log.debug(`cifs-mount command: "${options.sudo ? 'sudo mount' : 'mount'} -t cifs -o ${options.user ? `username=${options.user},password=****` : ''}${options.cifsDomain ? `,domain=${options.cifsDomain}` : ''}${options.clientInodes ? ',noserverino' : ''}${options.cacheLoose ? ',cache=loose' : ''},rw,forceuid,uid=iobroker,forcegid,gid=iobroker,file_mode=0777,dir_mode=0777 ${options.mount}${dir} ${backupDir}"`);
                child_process.exec(`${options.sudo ? 'sudo mount' : 'mount'} -t cifs -o ${options.user ? `username=${options.user},password=${options.pass}` : ''}${options.cifsDomain ? `,domain=${options.cifsDomain}` : ''}${options.clientInodes ? ',noserverino' : ''}${options.cacheLoose ? ',cache=loose' : ''},rw,forceuid,uid=iobroker,forcegid,gid=iobroker,file_mode=0777,dir_mode=0777 ${options.mount}${dir} ${backupDir}`, (error, stdout, stderr) => {
                    if (error) {
                        let errLog = `${error}`;
                        try {
                            const formatPass = options.pass.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                            errLog = errLog.replace(new RegExp(formatPass, 'g'), "****");
                        } catch (e) {
                            // ignore
                        }
                        callback && callback(errLog);
                    } else {
                        log.debug('mount successfully completed');
                        try {
                            fs.writeFileSync(`${options.fileDir}/.mount`, options.mountType);
                        } catch (e) {
                            log.debug(`file ".mount" cannot created: ${e}`);
                        }
                        callback && callback(null, stdout);
                    }
                });
            } else {
                log.debug('mount successfully completed');
                try {
                    fs.writeFileSync(`${options.fileDir}/.mount`, options.mountType);
                } catch (e) {
                    log.debug(`file ".mount" cannot created: ${e}`);
                }
                callback && callback(null, stdout);
            }
        });
    } else if (options.mountType === 'NFS') {
        if (!dir.startsWith('/')) {
            dir = `/${dir}`;
        }
        log.debug(`nfs-mount command: "${options.sudo ? 'sudo mount' : 'mount'} ${options.mount}:${dir} ${backupDir}"`);
        child_process.exec(`${options.sudo ? 'sudo mount' : 'mount'} ${options.mount}:${dir} ${backupDir}`, (error, stdout, stderr) => {
            if (error) {
                callback && callback(error);
            } else {
                log.debug('mount successfully completed');
                try {
                    fs.writeFileSync(`${options.fileDir}/.mount`, options.mountType);
                } catch (e) {
                    log.debug(`file ".mount" cannot created: ${e}`);
                }
                callback && callback(null, stdout);
            }
        });
    } else if (options.mountType === 'Expert') {
        log.debug(`expert-mount command: "${options.expertMount}"`);
        child_process.exec(options.expertMount, (error, stdout, stderr) => {
            if (error) {
                callback && callback(error);
            } else {
                log.debug('expert-mount successfully completed');
                try {
                    fs.writeFileSync(`${options.fileDir}/.mount`, options.mountType);
                } catch (e) {
                    log.debug(`file ".mount" cannot created: ${e}`);
                }
                callback && callback(null, stdout);
            }
        });
    }
}

function umount(options, log, callback) {
    if (!options.mount) {
        return callback && callback('NO mount path specified!');
    }
    if (fs.existsSync(`${options.fileDir}/.mount`)) {
        let child_process = require('node:child_process');

        child_process.exec(`mount | grep -o "${backupDir}"`, (error, stdout, stderr) => {
            if (stdout.includes(backupDir)) {
                child_process.exec(`${options.sudo ? 'sudo umount' : 'umount'} ${backupDir}`, (error, stdout, stderr) => {
                    if (error) {
                        log.debug('device is busy... wait 2 Minutes!!');
                        setTimeout(function () {
                            child_process.exec(`${options.sudo ? 'sudo umount' : 'umount'} -l ${backupDir}`, (error, stdout, stderr) => {
                                if (error) {
                                    log.error(stderr);
                                    callback && callback(error)
                                } else {
                                    log.debug('umount successfully completed');
                                    try {
                                        fs.existsSync(`${options.fileDir}/.mount`) && fs.unlinkSync(`${options.fileDir}/.mount`);
                                    } catch (e) {
                                        log.debug(`file ".mount" cannot deleted: ${e}`);
                                    }
                                    callback && callback(null, stdout);
                                }
                            });
                        }, 120000);
                    } else {
                        log.debug('umount successfully completed');
                        try {
                            fs.existsSync(`${options.fileDir}/.mount`) && fs.unlinkSync(`${options.fileDir}/.mount`);
                        } catch (e) {
                            log.debug(`file ".mount" cannot deleted: ${e}`);
                        }
                        callback && callback(null, stdout);
                    }
                });
            } else {
                log.debug('mount inactive, umount not started ...');
                try {
                    fs.existsSync(`${options.fileDir}/.mount`) && fs.unlinkSync(`${options.fileDir}/.mount`);
                } catch (e) {
                    log.debug(`file ".mount" cannot deleted: ${e}`);
                }
                callback && callback(null);
            }
        });
    }
}

module.exports = {
    list,
    getFile,
};
