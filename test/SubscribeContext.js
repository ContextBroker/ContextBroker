#!/usr/bin/env node

if(typeof QUnit === 'undefined')
{
  QUnit = require('qunit-cli')
  QUnit.load()

  nock = require('nock')

  contextBroker = require('..')
}
nock.disableNetConnect()

var SubscribeContext = contextBroker.SubscribeContext


const SERVER = 'example.com'
const FIWARE_SERVICE = 'MyService'


var server = nock('http://'+SERVER)


QUnit.module('SubscribeContext',
{
  afterEach: function()
  {
    nock.cleanAll()
  }
})


QUnit.test('Subscribe, update & close', function(assert)
{
  assert.expect(3)

  var done = assert.async()

  var fixtures = require('./fixtures/subscribeContext1')

  var request = fixtures.request
  request.hostname = SERVER
  request.fiwareService = FIWARE_SERVICE

  var response = fixtures.response_server
  server.post('/NGSI10/subscribeContext').reply(200, response)
  .reply(200, fixtures.notification_server)
//  .post('/NGSI10/updateContextSubscription').reply(200, response)
//  .post('/NGSI10/unsubscribeContext').reply(200, response)
console.log('contextBroker',contextBroker)
  SubscribeContext(request)
  .once('data', function(data)
  {
    var expected = fixtures.notification[0]

    assert.deepEqual(data, expected)

    this.update({"throttling": "PT10S"})
    .then(function()
    {
      assert.strictEqual(this.throttling, 'PT10S')
    })
    .close()
    .then(function()
    {
      assert.strictEqual(this.subscriptionId, null)
    })
    .then(done)
    .catch(done)
  })
  .on('error', done)
})
