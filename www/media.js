const Handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(':memory:');

db.serialize(function () {
    // create tables for primitive types (disk and channel)
    db.run("CREATE TABLE disks (directory TEXT PRIMARY KEY, title TEXT, description TEXT, image BLOB)");
    db.run("CREATE TABLE channels (name TEXT PRIMARY KEY)");
    // create tables for relational types (files and connections)
    db.run("CREATE TABLE files (disk_directory TEXT NOT NULL, filename TEXT NOT NULL, data TEXT NOT NULL," +
        "FOREIGN KEY(disk_directory) REFERENCES disks(directory)," +
        "UNIQUE(disk_directory, filename))");
    db.run("CREATE TABLE connections (disk_directory TEXT NOT NULL, channel_name TEXT NOT NULL," +
        "FOREIGN KEY(disk_directory) REFERENCES disks(directory)," +
        "FOREIGN KEY(channel_name) REFERENCES channels(name)," +
        "UNIQUE(disk_directory, channel_name))");
    // add test data
    db.run("INSERT INTO channels (name) VALUES ('channel2')");
    db.run("INSERT INTO channels (name) VALUES ('channel3')");
});

// compile media
var template;
fs.readFile(path.join(__dirname, "public", "template.hbs"), function (err, data) {
    if (err) throw err;
    template = Handlebars.compile(data.toString());
});
var channelTemplate;
fs.readFile(path.join(__dirname, "public", "channel.hbs"), function (err, data) {
    if (err) throw err;
    channelTemplate = Handlebars.compile(data.toString());
});

var mediaDir = path.join(__dirname, 'disks');

module.exports = {
    // build local database in memory
    scanMedia: function () {
        // read media directory
        fs.readdir(mediaDir, function (err, files) {
            files.forEach(file => {
                var itemPath = path.join(mediaDir, file);
                fs.stat(itemPath, function (err, stats) {
                    if (err) console.log("err: " + err);
                    // check if subpath is a directory
                    if (stats.isDirectory()) {
                        // load media metadata
                        var meta = require(path.join(itemPath, 'demo.json'));
                        if (meta) {
                            // add to database
                            addMediaToDatabase(file, meta);
                        }
                    }
                });
            });
        });
    },
    createDisk: function (channelName) {
        // path of new disk
        var randomName = "disk_" + Math.random().toString(36).substring(2, 8);
        var newDirectory = path.join(mediaDir, randomName);
        // make directory
        fs.mkdir(newDirectory, function (err) {
            if (err) console.log(err)
            else {
                var pathToDefault = path.join(mediaDir, '.default');
                // get default metadata
                var meta = require(path.join(pathToDefault, 'demo.json'));
                // set channel
                meta.demo.channels.push(channelName);
                // save metadata to disk
                fs.writeFile(path.join(newDirectory, 'demo.json'), JSON.stringify(meta, null, 4), function (err) {
                    if (err) console.log(err);
                    // copy default files
                    fs.copyFile(path.join(pathToDefault, 'index.html'), path.join(newDirectory, 'index.html'), (err) => {
                        if (err) console.log(err);
                        fs.copyFile(path.join(pathToDefault, 'style.css'), path.join(newDirectory, 'style.css'), (err) => {
                            if (err) console.log(err);
                            fs.copyFile(path.join(pathToDefault, 'sketch.js'), path.join(newDirectory, 'sketch.js'), (err) => {
                                if (err) console.log(err);
                                // add to database
                                addMediaToDatabase(randomName, meta);
                            });
                        });
                    });
                });
            }
        });
    },
    listDatabase: function () {
        // log entries
        db.each("SELECT * FROM disks", function (err, row) {
            console.log("DISK: " + row.directory + " " + row.title + " " + row.description);
        });
        db.each("SELECT rowid AS id, disk_directory, filename FROM files", function (err, row) {
            console.log("FILE: " + row.disk_directory + " " + row.filename + " " + row.id);
        });
        db.each("SELECT * FROM channels", function (err, row) {
            console.log("CHANNEL: " + row.name);
        });
        db.each("SELECT * FROM connections", function (err, row) {
            console.log("CONNECTION: " + row.disk_directory + " " + row.channel_name);
        });

    },
    mediaObjectToHtml: function (item) {
        return template(item);
    },
    createChannel: function (msg) {
        var createQuery = "INSERT INTO channels (name) VALUES (?)";
        db.run(createQuery, [msg]);
    },
    updateFile: function (msg) {
        // update file in database
        var updateQuery = "UPDATE files SET data = ? WHERE rowid = ?";
        db.run(updateQuery, [msg.text, msg.fileID]);
        // get path of file on disk
        var filepath = path.join(mediaDir, msg.directory, msg.filename);
        // update file on disk
        fs.writeFile(filepath, msg.text, function (err) {
            if (err) console.log(err);
        });
    },
    deleteConnection: function (msg) {
        // delete connection in database
        var sql = "DELETE FROM connections WHERE disk_directory = ? AND channel_name = ?";
        db.run(sql, msg);
        // get path and load json
        var metaPath = path.join(mediaDir, msg[0], 'demo.json');
        var meta = require(metaPath);
        // get index of channel in array
        var index = meta.demo.channels.indexOf(msg[1]);
        if (index > -1) {
            // delete if exists
            meta.demo.channels.splice(index, 1);
        }
        // save json to disk
        fs.writeFile(metaPath, JSON.stringify(meta, null, 4), function (err) {
            if (err) console.log(err);
        });
    },
    createConnection: function (msg) {
        // create connection in database
        var sql = "INSERT INTO connections (disk_directory, channel_name) VALUES (?, ?)";
        db.run(sql, msg);
        // get path and load json
        var metaPath = path.join(mediaDir, msg[0], 'demo.json');
        var meta = require(metaPath);
        // get index of channel in array
        var index = meta.demo.channels.indexOf(msg[1]);
        if (index == -1) {
            // add if channel isnt connected
            meta.demo.channels.push(msg[1]);
        }
        // save json to disk
        fs.writeFile(metaPath, JSON.stringify(meta, null, 4), function (err) {
            if (err) console.log(err);
        });
    },
    playLocalMedia: function (name) {
        var filePath = path.join(mediaDir, name);
        console.log('playing local media: ' + filePath);
        // TODO: reimplement IPC to send filepath to renderer
    },
    loadFeed: function (io) {
        // get list of distinct disks in connections
        var selectQuery = "SELECT * FROM connections GROUP BY disk_directory";
        db.all(selectQuery, function (err, rows) {
            // group into channels
            var grouped = {};
            for (var i = 0; i < rows.length; i++) {
                if (grouped[rows[i].channel_name] == undefined) {
                    grouped[rows[i].channel_name] = [];
                }
                grouped[rows[i].channel_name].push(rows[i]);
            }
            // for each channel
            for (var key in grouped) {
                // skip loop of property is from prototype
                if (!grouped.hasOwnProperty(key)) continue;
                // 
                var obj = grouped[key];
                let disk_directories = obj.map(a => a.disk_directory);
                serveChannelAndDisks(key, disk_directories, function (element) {
                    io.emit('load', element);
                });
                // serveChannel(key, function (element) {
                //     serveDiskArray(["item1", "item2"], function (elements) {
                //         element += elements;
                //         io.emit('load', element);
                //     });
                //     //io.emit('load', element);
                // });
                // count number of disks in channel
                // var countQuery = "SELECT channel_name, count(*) AS count FROM connections WHERE channel_name = ?";
                // db.get(countQuery, [key], (err, count) => {
                //     console.log("channel has: " + JSON.stringify(count));
                //     var obj = grouped[count.channel_name];
                //     console.log("key: " + count.channel_name);
                //     console.log("obj: " + JSON.stringify(obj));
                //     io.emit('load', channelTemplate(count));
                //     obj.forEach(function (objj) {
                //         serveDisk(io, objj.disk_directory);
                //     });
                // });
                // var obj = grouped[key];
                // console.log("key: " + key);
                // console.log("obj: " + JSON.stringify(obj));
                // console.log(JSON.stringify(grouped[obj], null, 2));
            }
            //console.log(JSON.stringify(grouped[0], null, 2));
        });
    },
    serveOne: function (io, key) {
        // fetch entry requested in [key] arg from disks table
        var sql = "SELECT directory, title, description, image FROM disks WHERE directory = ?";
        db.get(sql, [key], (err, itemrow) => {
            itemrow.files = new Array();
            // fetch corresponding entries in files table
            db.all("SELECT rowid AS id, disk_directory, filename, data FROM files WHERE disk_directory = ?", [key], function (err, filerows) {
                filerows.forEach(function (filerow) {
                    // add each file to object
                    itemrow.files.push(filerow);
                });
                // add arrays to hold channels
                itemrow.connectedChannels = new Array();
                itemrow.unconnectedChannels = new Array();
                // get channels
                var getChannelsQuery = "SELECT channels.name, connections.disk_directory FROM channels LEFT JOIN connections " +
                    "ON channels.name = connections.channel_name " +
                    "AND connections.disk_directory = ?";
                db.all(getChannelsQuery, [key], function (err, chanrows) {
                    // loop through channels
                    chanrows.forEach(function (chanrow) {
                        // check if channel is connected
                        if (chanrow.disk_directory) {
                            itemrow.connectedChannels.push(chanrow);
                        } else {
                            itemrow.unconnectedChannels.push(chanrow);
                        }
                    });
                    // compile media object into HTML and send to client websocket
                    var element = template(itemrow);
                    io.emit('load', element);
                });
            });
        });
    }
};

function serveChannelAndDisks(channel_name, disk_directories, callback) {
    var element = "";
    serveChannel(channel_name, function (channel_element) {
        element += channel_element;
        serveDiskArray(disk_directories, function (disk_elements) {
            element += disk_elements;
            callback(element);
        });
    });
}

function serveDiskArray(titles, callback) {

    var object = "";

    function repeat(title) {
        serveDisk(title, function (element) {
            object += element;
            if (titles.length) {
                repeat(titles.pop());
            } else {
                callback(object);
            }

        });
    }
    repeat(titles.pop());
}

function serveChannel(channel_name, callback) {
    // count number of disks in channel
    var countQuery = "SELECT channel_name, count(*) AS count FROM connections WHERE channel_name = ?";
    db.get(countQuery, [channel_name], (err, count) => {
        var element = channelTemplate(count);
        callback(element);
    });
}

function serveDisk(key, callback) {
    // fetch entry requested in [key] arg from disks table
    var sql = "SELECT directory, title, description, image FROM disks WHERE directory = ?";
    console.log("hre: " + key);
    db.get(sql, [key], (err, itemrow) => {
        itemrow.files = new Array();
        // fetch corresponding entries in files table
        db.all("SELECT rowid AS id, disk_directory, filename, data FROM files WHERE disk_directory = ?", [key], function (err, filerows) {
            filerows.forEach(function (filerow) {
                // add each file to object
                itemrow.files.push(filerow);
            });
            // add arrays to hold channels
            itemrow.connectedChannels = new Array();
            itemrow.unconnectedChannels = new Array();
            // get channels
            var getChannelsQuery = "SELECT channels.name, connections.disk_directory FROM channels LEFT JOIN connections " +
                "ON channels.name = connections.channel_name " +
                "AND connections.disk_directory = ?";
            db.all(getChannelsQuery, [key], function (err, chanrows) {
                // loop through channels
                chanrows.forEach(function (chanrow) {
                    // check if channel is connected
                    if (chanrow.disk_directory) {
                        itemrow.connectedChannels.push(chanrow);
                    } else {
                        itemrow.unconnectedChannels.push(chanrow);
                    }
                });
                // compile media object into HTML and send to client websocket
                var element = template(itemrow);
                callback(element);
            });
        });
    });
}

function addMediaToDatabase(directory, meta) {
    // add metadata to disks table in database
    var insertQuery = "INSERT INTO disks (directory, title, description) VALUES (?, ?, ?)";
    db.run(insertQuery, [directory, meta.demo.title, meta.demo.description], function () {
        var itemPath = path.join(mediaDir, directory);
        if (meta.demo.image && meta.demo.image.length > 0) {
            // add image to disks database TODO: check if files exist
            var imagePath = path.join(itemPath, meta.demo.image);
            fs.readFile(imagePath, function (err, buf) {
                if (err) throw err;
                var decodedImage = "data:image/jpeg;base64," + buf.toString('base64');
                var addImgQuery = "UPDATE disks SET image = ? WHERE directory = ?";
                db.run(addImgQuery, [decodedImage, directory]);
            });
        }
        // add files to database
        var addFileQuery = "INSERT INTO files (disk_directory, filename, data) VALUES (?, ?, ?)";
        meta.demo.files.forEach(filename => {
            var filepath = path.join(itemPath, filename);
            fs.readFile(filepath, 'utf8', function (err, buf) {
                if (err) throw err;
                db.run(addFileQuery, [directory, filename, buf]);
            });
        });
        // add channels to database
        var addChannelQuery = "INSERT INTO channels (name) VALUES (?)";
        var addConnectQuery = "INSERT INTO connections (disk_directory, channel_name) VALUES (?, ?)";
        meta.demo.channels.forEach(channelName => {
            // add name to channels table
            db.run(addChannelQuery, [channelName], function () {
                // add pair to connections table
                db.run(addConnectQuery, [directory, channelName]);
            });
        });
    });

}