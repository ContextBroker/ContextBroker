var assert = require('assert')
var http   = require('http')
var parse  = require('url').parse

var nock     = require('nock')
var post2sse = require('post2sse')

var SubscribeContext = require('..').SubscribeContext

nock.disableNetConnect()
nock.enableNetConnect('localhost')


const SERVER = 'example.com'
const FIWARE_SERVICE = 'MyService'


var server = nock('http://'+SERVER)


var proxy
var proxyPort
var subscribeContext

beforeEach(function(done)
{
  // Clean modules cache (for fixtures)
  // http://stackoverflow.com/questions/23685930/clearing-require-cache#comment53920334_23686122
  Object.keys(require.cache).forEach(function(key)
  {
    delete require.cache[key]
  })

  proxy = http.createServer(post2sse()).listen(0, function()
  {
    proxyPort = this.address().port
    done()
  })
})

afterEach(function()
{
  if(!nock.isDone())
    console.error('pending mocks: %j', nock.pendingMocks())

  nock.cleanAll()

  subscribeContext.close()

  proxy.close()
})


it('Subscribe & receive data', function(done)
{
//  assert.expect(1)

  var self = this

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

  request.webhook = 'http://localhost:'+proxyPort+'/accumulate'

  subscribeContext = SubscribeContext(request)
  .once('data', function(data)
  {
    var expected = fixtures.notification[0]

    assert.deepEqual(data, expected)

    this.close()
    done()
  })
  .on('error', done)
})

it('Subscribe & receive data without notifications server', function(done)
{
//  assert.expect(1)

  var self = this

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

  request.webhook = {hostname: 'localhost'}

  subscribeContext = SubscribeContext(request)
  .once('data', function(data)
  {
    var expected = fixtures.notification[0]

    assert.deepEqual(data, expected)

    this.close()
    done()
  })
  .on('error', done)
})

it('Update & close', function(done)
{
//  assert.expect(2)

  var self = this

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

  request.webhook = 'http://localhost:'+proxyPort+'/accumulate'

  subscribeContext = SubscribeContext(request)
  .on('error', function(error)
  {
    console.trace(error)
  })
  .update({throttling: throttling})
  .then(function()
  {
    console.log('this.throttling:',this.throttling)
    assert.strictEqual(this.throttling, throttling)
  },
  function(error)
  {
    console.error('error:',error)
  })
  .close()
  .then(function()
  {
    assert.strictEqual(this.subscriptionId, null)
  })
  .then(done, done)
})
