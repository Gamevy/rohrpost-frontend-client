(function() {
    var isNodejs = (typeof module === 'object' && module.exports);

    function Rohrpost(options) {
        var that = this;

        var connectionUrl = options.connectionUrl;

        // Simple exponential backoff for reconnects
        var backoffIntervalInitial = 500;
        var backoffIntervalStop = 60000;
        var backoffInterval = 0;

        var closing = false;
        that.open = false;
        var openEventHasBeenEmitted = false;

        // Create a random sessionId
        var sessionId = Math.random().toString(36).substr(2);

        var socketConnection;

        // This will be used whilst a reconnect or similar is going on.
        // Should be empty most of the time
        var messageQueue = [];

        /*******************
         * Public interface
         *******************/

        /**
         * This method sends a payload to a specific topic. Should this socket
         * not be allowed to send to this topic the message will be silently
         * dropped.
         */
        that.publish = function(topic, data) {
            var payload = {
                'topic': topic,
                'data': data
            };
            if (that.open) {
                send(payload);
            } else {
                messageQueue.push(payload);
            }
        };

        that.close = function() {
            closing = true;
            socketConnection.close();
        }

        that.log = {
            info: createDefaultLogger('info'),
            debug: createDefaultLogger('debug'),
            warn: createDefaultLogger('warn'),
            error: console.error
        }

        /*******************
         * Private methods
         *******************/

        /**
         * This function connects to the server. To do so it first does a
         * request to figure out which host/port to connect to and
         * then tries to connect via SockJS. Should something go wrong,
         * try again.
         */
        function connect() {
            makeRequest(connectionUrl, function(err, connectionUrl) {
                if (err) {
                    if (err.status == 404 || err.status == 0) {
                        reconnectAfterError();
                    } else {
                        console.error('uncaught error', err);
                    }
                    return;
                }

                if (!connectionUrl) {
                    throw "Couldn't get connection URL from " + connectionUrl;
                }

                function onOpen() {
                    socketConnection.send(sessionId);
                    backoffInterval = 0; // Reset backoff interval
                }

                if (isNodejs) {
                    var wsUrl = connectionUrl.replace(/^http/, 'ws') + '/websocket';
                    var Websocket = require('ws');
                    socketConnection = new Websocket(wsUrl);
                    socketConnection.on('open', onOpen);
                    socketConnection.on('close', onClose);
                    socketConnection.on('message', onMessage);
                    socketConnection.on('error', onError);
                    that.log.debug("Connect to websocket via " + wsUrl);
                } else {
                    socketConnection = new SockJS(connectionUrl);
                    socketConnection.onopen = onOpen
                    socketConnection.onmessage = onMessage;
                    socketConnection.onclose = onClose;
                    that.log.debug("Connect to sockjs via " + connectionUrl);
                }
            });
        }

        /**
         * This method should be called after an unexpected disconnect of
         * in case of an unsuccessful ajax request. Uses exponential backoff
         * to avoid flooding the server with reconnect requests
         */
        function reconnectAfterError() {
            if (backoffInterval < backoffIntervalStop) {
                // try and avoid the thundering herd
                var timeout = Math.random() * backoffInterval;
                setTimeout(function() {
                    if (backoffInterval == 0) {
                        backoffInterval = backoffIntervalInitial;
                    } else {
                        backoffInterval *= 2;
                    }
                    connect();
                }, timeout);
                that.log.info('Connection lost. Attempting to reconnect in %d ms', timeout);
            } else {
                that.log.warn('Couldn\'t reconnect. Giving up');
            }
        }

        /**
         * This should be called after a connection to the server has been
         * (re-)established to send all messages that have been queued in
         * the meantime.
         */
        function flushMessageQueue() {
            while(messageQueue.length > 0) {
                send(messageQueue.pop());
            }
        }

        /**
         * Close events are a bit more complicated, since some of them
         * are expected (e.g. we know how to handle them) but others are
         * unexptected. We should always attempt to handle close events
         * as gracefully as possible, without disturbing user experience
         * unnecessarily.
         */
        function onClose(e) {
            that.open = false;

            if (closing) {
                that.log.debug('Closed connection');
                return;
            }
            if (e.code == 100) {
                // The client is asked to reconnect.
                connect();
            } else if (!e.wasClean) {
                // Something bad happened
                reconnectAfterError();
            } else {
                // If we end up here we should analyse the error and write a
                // custom handler for it.
                that.log.error('Unhandled close event', e);
            }
        }

        /**
         * This gets called when we receive a raw message from the socket.
         * We need to unwrap and emit it.
         */
        function onMessage(message) {
            var data;
            if (isNodejs) {
                data = message;
            } else {
                data = message.data;
            }
            if (!that.open) {
                if (data == 'ok:' + sessionId) {
                    that.open = true;
                    flushMessageQueue();

                    // only emit 'open' once
                    if (!openEventHasBeenEmitted) {
                        openEventHasBeenEmitted = true;
                        that.emit('open');
                    }
                } else {
                    that.log.warn('error', 'Handshake was not successful (' + data + ' != ok:' + sessionId + ')');
                }
            } else {
                try {
                    var payload = JSON.parse(data);
                    that.log.debug('[Received message]', payload);
                    that.emit(payload.topic, payload.data);
                } catch (err) {
                    that.log.error(err, data);
                }
            }

        }

        function onError(error) {
            that.log.error(error);
            that.open = false;
            reconnectAfterError();
        }

        /**
         * This is helper function that sends a raw json object over the
         * wire.
         */

        function send(rawObject) {
            that.log.debug('[Send message]', rawObject);
            socketConnection.send(JSON.stringify(rawObject));
        }

        /**
         * This function is used to fill the this.log object above
         */
        function createDefaultLogger(level) {
            return function() {
                var args = Array.prototype.slice.call(arguments);
                args.unshift('[' + level + ']');

		if (console.log.apply) {
			return console.log.apply(console, args);
		}

                console.log(args);
            };
        }

        /***************
         * Constructor
         ***************/
        connect();
    }

    /**
     * We need some sort of EventEmitter. In case of Nodejs we can
     * use the build-in one, for the browser we need to use a custom
     * one.
     */
    if (isNodejs) {
        EventEmitter = require('events').EventEmitter;
    } else {
        /*!
         * EventEmitter v4.2.3 - git.io/ee
         * Oliver Caldwell
         * MIT license
         * @preserve
         */
        !function(){"use strict";function t(){}function r(t,n){for(var e=t.length;e--;)if(t[e].listener===n)return e;return-1}function n(e){return function(){return this[e].apply(this,arguments)}}var e=t.prototype;e.getListeners=function(n){var r,e,t=this._getEvents();if("object"==typeof n){r={};for(e in t)t.hasOwnProperty(e)&&n.test(e)&&(r[e]=t[e])}else r=t[n]||(t[n]=[]);return r},e.flattenListeners=function(t){var e,n=[];for(e=0;e<t.length;e+=1)n.push(t[e].listener);return n},e.getListenersAsObject=function(n){var e,t=this.getListeners(n);return t instanceof Array&&(e={},e[n]=t),e||t},e.addListener=function(i,e){var t,n=this.getListenersAsObject(i),s="object"==typeof e;for(t in n)n.hasOwnProperty(t)&&-1===r(n[t],e)&&n[t].push(s?e:{listener:e,once:!1});return this},e.on=n("addListener"),e.addOnceListener=function(e,t){return this.addListener(e,{listener:t,once:!0})},e.once=n("addOnceListener"),e.defineEvent=function(e){return this.getListeners(e),this},e.defineEvents=function(t){for(var e=0;e<t.length;e+=1)this.defineEvent(t[e]);return this},e.removeListener=function(i,s){var n,e,t=this.getListenersAsObject(i);for(e in t)t.hasOwnProperty(e)&&(n=r(t[e],s),-1!==n&&t[e].splice(n,1));return this},e.off=n("removeListener"),e.addListeners=function(e,t){return this.manipulateListeners(!1,e,t)},e.removeListeners=function(e,t){return this.manipulateListeners(!0,e,t)},e.manipulateListeners=function(r,t,i){var e,n,s=r?this.removeListener:this.addListener,o=r?this.removeListeners:this.addListeners;if("object"!=typeof t||t instanceof RegExp)for(e=i.length;e--;)s.call(this,t,i[e]);else for(e in t)t.hasOwnProperty(e)&&(n=t[e])&&("function"==typeof n?s.call(this,e,n):o.call(this,e,n));return this},e.removeEvent=function(n){var e,r=typeof n,t=this._getEvents();if("string"===r)delete t[n];else if("object"===r)for(e in t)t.hasOwnProperty(e)&&n.test(e)&&delete t[e];else delete this._events;return this},e.emitEvent=function(r,o){var e,i,t,s,n=this.getListenersAsObject(r);for(t in n)if(n.hasOwnProperty(t))for(i=n[t].length;i--;)e=n[t][i],e.once===!0&&this.removeListener(r,e.listener),s=e.listener.apply(this,o||[]),s===this._getOnceReturnValue()&&this.removeListener(r,e.listener);return this},e.trigger=n("emitEvent"),e.emit=function(e){var t=Array.prototype.slice.call(arguments,1);return this.emitEvent(e,t)},e.setOnceReturnValue=function(e){return this._onceReturnValue=e,this},e._getOnceReturnValue=function(){return this.hasOwnProperty("_onceReturnValue")?this._onceReturnValue:!0},e._getEvents=function(){return this._events||(this._events={})},"function"==typeof define&&define.amd?define(function(){return t}):"object"==typeof module&&module.exports?module.exports=t:this.EventEmitter=t}.call(this);
    }

    /**
     * We also need to make one HTTP(s) request.
     */
    var makeRequest = null;
    if (isNodejs) {
        var request = require('request');
        makeRequest = function(url, callback) {
            request(url, function (err, response, body) {
                if (!err && response.statusCode == 200) {
                    callback(null, body)
                } else {
                    callback(err);
                }
            });
        }
    } else {
        makeRequest = function(url, callback){
            var xmlhttp;
            // compatible with IE7+, Firefox, Chrome, Opera, Safari
            xmlhttp = new XMLHttpRequest();
            xmlhttp.onreadystatechange = function(){
                if (xmlhttp.readyState == 4) {
                    if (xmlhttp.status == 200){
                        callback(null, xmlhttp.responseText);
                    } else {
                        callback(xmlhttp);
                    }
                }
            }
            xmlhttp.open("GET", url, true);
            xmlhttp.send();
        }
    }

    // Extend object
    if (isNodejs) {
        require('util').inherits(Rohrpost, EventEmitter);
    } else {
        Rohrpost.prototype = new EventEmitter();
        Rohrpost.prototype.constructor = Rohrpost;
    }

    // Expose the class either via AMD, CommonJS or the global object
    if (isNodejs){
        module.exports = Rohrpost;
    }
    else {
        this.Rohrpost = Rohrpost;
    }

})(this);
