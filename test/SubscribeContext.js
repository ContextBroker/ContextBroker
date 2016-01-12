#!/usr/bin/env node

if(typeof QUnit === 'undefined')
{
  QUnit = require('qunit-cli')
  QUnit.load()

  nock     = require('nock')
  post2sse = require('post2sse')

  contextBroker = require('..')
}
nock.disableNetConnect()
nock.enableNetConnect('localhost')

var SubscribeContext = contextBroker.SubscribeContext


const SERVER = 'example.com'
const FIWARE_SERVICE = 'MyService'


var server = nock('http://'+SERVER)


var http = require('http')
QUnit.module('SubscribeContext',
{
  beforeEach: function(assert)
  {
    var self = this
    var done = assert.async()

    this.proxy = http.createServer(post2sse()).listen(0, function()
    {
      self.proxyPort = this.address().port
      done()
    })
  },

  afterEach: function()
  {
    if(!nock.isDone())
      console.error('pending mocks: %j', nock.pendingMocks())

    nock.cleanAll()

    this.subscribeContext.close()

    this.proxy.close()
  }
})


QUnit.test('Subscribe & receive data', function(assert)
{
  assert.expect(1)

  var self = this
  var done = assert.async()

  var fixtures = require('./fixtures/subscribeContext1')

  server.post('/NGSI10/subscribeContext').reply(200, function()
  {
    var requestOptions =
    {
      method: 'POST',
      port: self.proxyPort,
      path: '/accumulate'
    }

    var requestData = JSON.stringify(fixtures.notification_server)

    http.request(requestOptions).end(requestData)

    return fixtures.response
  })
  .post('/NGSI10/unsubscribeContext').reply(200, fixtures.unsubscribe_response)


  // Connect to servers
  var request = fixtures.request
  request.hostname = SERVER
  request.fiwareService = FIWARE_SERVICE
  request.reference = 'http://localhost:'+this.proxyPort+'/accumulate'

  this.subscribeContext = SubscribeContext(request)
  .once('data', function(data)
  {
    var expected = fixtures.notification[0]

    assert.deepEqual(data, expected)

    done()
  })
  .on('error', function(error)
  {
    console.trace(error)
    done()
  })
})

QUnit.test('Update & close', function(assert)
{
  assert.expect(2)

  var self = this
  var done = assert.async()

  var fixtures = require('./fixtures/subscribeContext2')

  server
  .post('/NGSI10/subscribeContext')         .reply(200, fixtures.response)
  .post('/NGSI10/updateContextSubscription').reply(200, fixtures.update_response)
  .post('/NGSI10/unsubscribeContext')       .reply(200, fixtures.unsubscribe_response)


  // Connect to servers
  var request = fixtures.request
  request.hostname = SERVER
  request.fiwareService = FIWARE_SERVICE
  request.reference = 'http://localhost:'+this.proxyPort+'/accumulate'

  var subscribeContext = SubscribeContext(request)
  this.subscribeContext = subscribeContext

  subscribeContext.then(function()
  {
    return this.update({throttling: 'PT10S'})
    .then(function()
    {
      assert.strictEqual(subscribeContext.throttling, 'PT10S')

      return subscribeContext.close()
      .then(function()
      {
        assert.strictEqual(subscribeContext.subscriptionId, null)

        done()
      })
    })
  })
  .catch(function(error)
  {
    console.error(error)
    done()
  })
})
