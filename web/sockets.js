const net = require('net');
const EventEmitter = require('events');

var exports = module.exports = {};

var connectFlag = true;
process.argv.forEach(function (val, index, array) {
    if (val == '--connect' || val == '-c') {
        connectFlag = true;
        console.log(`Connecting to backend and renderer`);
    } else if (val == '--no-connect' || val == '-n') {
        connectFlag = false;
        console.log(`Not connecting to backend and renderer`);
    }
});

// unix socket class
exports.DomainClient = class DomainClient {
    constructor(name) {
        // 
        this.name = name;
        //
        this.socketname = `/tmp/${this.name}.sock`;
        //
        this.connected = false;
        this.socket = null;
        this.event = new EventEmitter();
        this.connectInterval = null;
        //
        this.messageQueue = [];
        this.writeTimeoutID = 0;
        //
        console.log(`Constructing client ${this.name} with path ${this.socketname}`);
    }

    startConnecting() {
        if (connectFlag) {
            clearInterval(this.connectInterval);
            this.connectInterval = setInterval(this.connectToSocket.bind(this), 2500);
        }
    }

    write(msg) {
        if (this.socket) {
            this.messageQueue.push(msg);
            if (!this.writeTimeoutID) {
                this.writeTimeoutID = setTimeout(this.writeOut.bind(this), 0);
            }
        } else {
            if (connectFlag) {
                console.log(`Error sending msg to ${this.name}: socket is null`);
            }
        }
    }

    writeOut() {
        let message = this.messageQueue.shift();
        this.socket.write(message);
        if (this.messageQueue.length) {
            this.writeTimeoutID = setTimeout(this.writeOut.bind(this), 100);
        } else {
            this.writeTimeoutID = null;
        }
    }

    connectToSocket() {
        console.log(`Connecting to ${this.name}`);
        this.socket = net.createConnection(this.socketname)
            .on('connect', () => {
                this.connected = true;
                clearInterval(this.connectInterval);
                console.log(`Connected to ${this.name}`);
                this.event.emit('connect');
            })
            .on('data', (data) => {
                console.log(`Received data from ${this.name}`);
                this.event.emit('data', data);
            })
            .on('end', () => {
                console.log(`${this.name} ended communiction`);
                this.connected = false;
                this.socket.end();
                this.startConnecting();
            })
            .on('close', () => {
                console.log(`${this.name} communiction closed`);
            })
            .on('error', (data) => {
                console.log(`Error communicating with ${this.name}: ${data}`);
                this.connected = false;
                this.socket.end();
                this.startConnecting();
            });
    }
};

// unix socket server class
exports.DomainServer = class DomainServer {
    constructor(name) {
        // 
        this.name = name;
        //
        this.socketname = `/tmp/${this.name}.sock`;
        //
        this.connected = false;
        this.socket = null;
        this.socket_stream = null;
        this.event = new EventEmitter();
        this.connectInterval = null;
        //
        if (connectFlag) {
            console.log(`Constructing server ${this.name} with path ${this.socketname}`);
            this.createSocket.call(this);
        }
    }

    write(msg, callback) {
        if (this.connected) {
            if (this.socket_stream != null) {
                if (!this.socket_stream.write(msg)) {
                    // console.log(`Error writing out of socket: all or part of the data was queued in memory`);
                    // wait for data to clear from memory
                    this.socket_stream.once('drain', () => {
                        // console.log(`Info: Socket buffer free`);
                        if (callback) callback();
                    });
                } else {
                    // console.log(`Info: Server finished writing to socket`);
                    if (callback) callback();
                }
            } else {
                console.log(`Error sending msg to ${this.name}: stream is null`);
                if (callback) callback();
            }
        } else {
            if (connectFlag) {
                console.log(`Error sending msg to ${this.name}: socket disconnected`);
            }
            if (callback) callback();
        }
    }

    createSocket() {
        this.prepareServer.call(this, () => {
            console.log(`Creating server ${this.name} with path ${this.socketname}`);
            // create server
            this.socket = net.createServer(function (stream) {
                stream.on('error', function (err) {
                    console.log(`socket server error in stream: ${err}`);
                });
                stream.on('end', function () {
                    console.log('socket server Client disconnected.');
                });
                /*stream.on('data', function (msg) {
                    // parse buffer
                    msg = JSON.parse(msg.toString());
            
                    console.log('socket server Client:', JSON.stringify(msg));
                });*/
            })
            .listen(this.socketname)
            .on('connection', (stream) => {
                console.log(`Client connected to server ${this.socketname}`);
                this.connected = true;
                this.socket_stream = stream;
            })
            .on('error', err => {
                console.log(`${this.socketname} Server error: ${err}`);
            });
        });
    }

    prepareServer(callback) {
        const SOCKETFILE = this.socketname;
        // check for leftover socket file / failed cleanup
        require('fs').stat(SOCKETFILE, function (err, stats) {
            if (err) {
              // ready to start server, no leftover socket found
              callback();
            } else {
                // remove leftover socket file
                require('fs').unlink(SOCKETFILE, function (err) {
                    if (err) {
                        console.log("ERROR REMOVING LEFTOVER SOCKET FILE");
                    }
                    // ready to start server
                    callback();
                });
            }
        });
    }
};