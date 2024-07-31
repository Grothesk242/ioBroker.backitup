'use strict';

const getDate = require('../tools').getDate;
const path = require('node:path');
const fs = require('node:fs');

async function command(options, log, callback) {
	if (options.mySqlMulti) {
		for (let i = 0; i < options.mySqlEvents.length; i++) {
			options.port = options.mySqlEvents[i].port ? options.mySqlEvents[i].port : '';
			options.host = options.mySqlEvents[i].host ? options.mySqlEvents[i].host : '';
			options.user = options.mySqlEvents[i].user ? options.mySqlEvents[i].user : '';
			options.pass = options.mySqlEvents[i].pass ? options.mySqlEvents[i].pass : '';
			options.exe = options.mySqlEvents[i].exe ? options.mySqlEvents[i].exe : '';
			options.dbName = options.mySqlEvents[i].dbName ? options.mySqlEvents[i].dbName : '';
			options.nameSuffix = options.mySqlEvents[i].nameSuffix ? options.mySqlEvents[i].nameSuffix : '';

			log.debug(`MySql-Backup for ${options.nameSuffix} is started ...`);
			await startBackup(options, log, callback);
			log.debug(`MySql-Backup for ${options.nameSuffix} is finish`);
		}
		options.context.done.push('mysql');
		options.context.types.push('mysql');
		return callback && callback(null);
	} else if (!options.mySqlMulti) {
		log.debug('MySql-Backup started ...');
		await startBackup(options, log, callback);
		log.debug('MySql-Backup for is finish');
		options.context.done.push('mysql');
		options.context.types.push('mysql');
		return callback && callback(null);
	}
}

async function startBackup(options, log, callback) {
	return new Promise(async (resolve) => {
		let nameSuffix;
		if (options.hostType === 'Slave' && !options.mySqlMulti) {
			nameSuffix = options.slaveSuffix ? options.slaveSuffix : '';
		} else {
			nameSuffix = options.nameSuffix ? options.nameSuffix : '';
		}
		const fileName = path.join(options.backupDir, `mysql_${getDate()}${nameSuffix ? `_${nameSuffix}` : ''}_backupiobroker.tar.gz`);
		const fileNameMysql = path.join(options.backupDir, `mysql_${getDate()}_backupiobroker.sql`);

		options.context.fileNames = options.context.fileNames || [];
		options.context.fileNames.push(fileName);

		if ((!options.pass.startsWith(`"`) || !options.pass.endsWith(`"`)) &&
			(!options.pass.startsWith(`'`) || options.pass.endsWith(`'`))
		) {
			options.pass = `"${options.pass}"`;
		}

		const child_process = require('node:child_process');

		child_process.exec(`${options.exe ? options.exe : 'mysqldump'}  -u ${options.user} -p${options.pass} ${options.dbName} -h ${options.host} -P ${options.port}${options.mysqlQuick ? ' --quick' : ''}${options.mysqlSingleTransaction ? ' --single-transaction' : ''} > ${fileNameMysql}`, {maxBuffer: 10 * 1024 * 1024}, async (error, stdout, stderr) => {
			if (error) {
				let errLog = '' + error;
				try {
					const formatPass = options.pass.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
					errLog = errLog.replace(new RegExp(formatPass, 'g'), "****");
				} catch (e) {
					// ignore
				}
				options.context.errors.mysql = errLog.toString();
				callback && callback(errLog, stderr);
				callback = null;
				resolve();
			} else {
				let timer = setInterval(async () => {
					if (fs.existsSync(fileName)) {
						const stats = fs.statSync(fileName);
						const fileSize = Math.floor(stats.size / (1024 * 1024));
						log.debug(`Packed ${fileSize}MB so far...`);
					}
				}, 10000);

				const compress = require('../targz').compress;

				compress({
					src: fileNameMysql,
					dest: fileName,
					tar: {
						map: header => {
							header.name = fileNameMysql.split('/').pop();
							return header;
						}
					}
				}, async (err, stdout, stderr) => {
					clearInterval(timer);

					if (err) {
						options.context.errors.mysql = err.toString();
						if (callback) {
							callback(err, stderr);
							callback = null;
						}
						resolve();
					} else {
						if (fileNameMysql) {
							try {
								fs.unlinkSync(fileNameMysql);
								log.debug('MySql File deleted!');
							} catch (e) {
								log.warn(`MySql File cannot deleted: ${e}`);
							}
						}
						resolve();
					}
				});
			}
		});
	});
}

module.exports = {
	command,
	ignoreErrors: true,
};
