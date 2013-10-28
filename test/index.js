var isNodejs = (typeof module === 'object' && module.exports);

if (isNodejs) {
    var Rohrpost = require('../index.js');
    var chai = require('chai');
    var connectionUrl = 'https://localhost:3000/connect';
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

describe('Rohrpost', function() {
    var rohrpost;
    var assert = chai.assert;

    function cleanLogger() {
        rohrpost.log.debug = function() {};
        rohrpost.log.info = function() {};
        rohrpost.log.error = function() {};
        rohrpost.log.warn = function() {};
    }

    beforeEach(function() {
        rohrpost = new Rohrpost({"connectionUrl": connectionUrl});
        cleanLogger();
    });

    afterEach(function() {
        rohrpost.close();
    })

    it('can publish and receive simple ping message after connect', function(done) {
        rohrpost.on('open', function() {
            rohrpost.publish('anonym.ping', {"foo": "bar"});
        });
        rohrpost.on('anonym.pong', function(data) {
            assert.deepEqual(data, {'foo': 'bar'});
            done();
        })
    });

    it('can publish and receive simple ping message before connect', function(done) {
        rohrpost = new Rohrpost({"connectionUrl": connectionUrl});
        cleanLogger();
        rohrpost.publish('anonym.ping', {"foo": "bar"});
        rohrpost.on('anonym.pong', function(data) {
            assert.deepEqual(data, {'foo': 'bar'});
            done();
        })
    });

    it('allows null to be send and received', function(done) {
        rohrpost.publish('anonym.ping', null);
        rohrpost.on('anonym.pong', function(data) {
            assert.deepEqual(data, null);
            done();
        })
    });

    it('can not send to topics that this connection is not whitelisted for', function(done) {
        rohrpost.publish('members.ping', {"foo": "bar"});
        rohrpost.on('members.pong', assert.fail);
        rohrpost.on('open', done);
    });

    it('can get whitelisted for topics if the backend allows us to do so', function(done) {
        rohrpost.on('members.welcome', function() {
            rohrpost.once('members.pong', function() {
                done()
            });
            rohrpost.publish('members.ping', {});
        });
        rohrpost.publish('anonym.members.login', {"username": "foo", "password": "bar"});
    });

    it('works for topics that are internally handled as http requests', function(done) {
        rohrpost.on('anonym.http.pong', function(data) {
            assert.deepEqual(data, {"foo": "bar"});
            done();
        });
        rohrpost.publish('anonym.http.ping', {"foo": "bar"});
    });

    it('allows whitelists to be changed via http endpoint', function(done) {
        rohrpost.on('members.welcome', function() {
            rohrpost.once('members.pong', function() {
                done()
            });
            rohrpost.publish('members.ping', {});
        });
        rohrpost.publish('anonym.http.login', {"foo": "bar"});
    });

    it('allows topics to be removed from whitelists', function(done) {
        rohrpost.on('members.welcome', function() {
            rohrpost.publish('members.http.logout', {});
            rohrpost.once('anonym.members.logout.success', function() {
                rohrpost.on('members.pong', assert.fail);
                rohrpost.publish('members.ping', {});
                done();
            });
        });
        rohrpost.publish('anonym.http.login', {});
    });
});