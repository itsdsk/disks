const ipc = require('node-ipc');

ipc.config.id = 'a-unique-process-name2';
ipc.config.retry = 1500;

ipc.connectTo(
    'dplayeripc',
    function(){
        ipc.of.dplayeripc.on(
            'connect',
            function(){
                ipc.log('## connected to world ##'.rainbow, ipc.config.delay);
                ipc.of.dplayeripc.emit(
                    'message',  //any event or message type your server listens for
                    "https://crocus-skull.glitch.me/"
                )
            }
        );
        ipc.of.dplayeripc.on(
            'disconnect',
            function(){
                ipc.log('disconnected from world'.notice);
            }
        );
        ipc.of.dplayeripc.on(
            'message',  //any event or message type your server listens for
            function(data){
                ipc.log('got a message from world : '.debug, data);
            }
        );
    }
);

//ipc.connectTo('dplayeripc', () => {
//  ipc.of.dplayeripc.on('connect', () => {
//    ipc.of.dplayeripc.emit('set-uri', "https://crocus-skull.glitch.me/");
//  });
//});