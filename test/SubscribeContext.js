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


var http  = require('http')
var parse = require('url').parse

QUnit.module('SubscribeContext',
{
  beforeEach: function(assert)
  {
    // Clean modules cache (for fixtures)
    // http://stackoverflow.com/questions/23685930/clearing-require-cache#comment53920334_23686122
    Object.keys(require.cache).forEach(function(key)
    {
      delete require.cache[key]
    })

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

  server.post('/NGSI10/subscribeContext').reply(200, function(uri, requestBody)
  {
    var requestOptions = parse(requestBody.reference)
        requestOptions.method = 'POST'

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

QUnit.test('Subscribe & receive data without notifications server', function(assert)
{
  assert.expect(1)

  var self = this
  var done = assert.async()

  var fixtures = require('./fixtures/subscribeContext1')

  server.post('/NGSI10/subscribeContext').reply(200, function(uri, requestBody)
  {
    var requestOptions = parse(requestBody.reference)
        requestOptions.method = 'POST'

    var requestData = JSON.stringify(fixtures.notification_server)

    http.request(requestOptions).end(requestData)

    return fixtures.response
  })
  .post('/NGSI10/unsubscribeContext').reply(200, fixtures.unsubscribe_response)


  // Connect to servers
  var request = fixtures.request
  request.hostname = SERVER
  request.fiwareService = FIWARE_SERVICE

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


  const throttling = 'PT10S'

  // Connect to servers
  var request = fixtures.request
  request.hostname = SERVER
  request.fiwareService = FIWARE_SERVICE
  request.reference = 'http://localhost:'+this.proxyPort+'/accumulate'

  this.subscribeContext = SubscribeContext(request)
  .update({throttling: throttling})
  .then(function()
  {
    assert.strictEqual(this.throttling, throttling)
  })
  .close()
  .then(function()
  {
    assert.strictEqual(this.subscriptionId, null)
  })
  .then(done, done)
})
