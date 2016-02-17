var assert = require('assert')
var http   = require('http')
var parse  = require('url').parse

var nock     = require('nock')
var post2sse = require('post2sse')

var ContextBroker = require('..')

nock.disableNetConnect()
nock.enableNetConnect('localhost')


const SERVER = 'example.com'
const FIWARE_SERVICE = 'MyService'


var server = nock('http://'+SERVER)


afterEach(nock.cleanAll)


describe('query', function()
{
  it('Get context', function(done)
  {
  //  assert.expect(1)

    var fixtures = require('./fixtures/queryContext1')

    var response = fixtures.response_server
    server.post('/NGSI10/queryContext').reply(200, response)

    var request = fixtures.request
    request.fiwareService = FIWARE_SERVICE

    ContextBroker(request)
    .once('data', function(data)
    {
      var expected = fixtures.response[0]

      assert.deepEqual(data, expected)

      this.close()
      done()
    })
    .on('error', done)
  })

  it('Get attribute', function(done)
  {
  //  assert.expect(1)

    var fixtures = require('./fixtures/queryContext2')

    var response = fixtures.response_server
    server.post('/NGSI10/queryContext').reply(200, response)

    var request = fixtures.request
    request.fiwareService = FIWARE_SERVICE

    ContextBroker(request)
    .once('data', function(data)
    {
      var expected = fixtures.response[0]

      assert.deepEqual(data, expected)

      this.close()
      done()
    })
    .on('error', done)
  })

  // [ToDo] test with real patter (they can't be included in the JSON)
  it('Get attribute from several contexts', function(done)
  {
  //  assert.expect(2)

    var fixtures = require('./fixtures/queryContext3')

    var response = fixtures.response_server
    server.post('/NGSI10/queryContext').reply(200, response)

    var request = fixtures.request
    request.fiwareService = FIWARE_SERVICE

    ContextBroker(request)
    .once('data', function(data)
    {
      var expected = fixtures.response[0]

      assert.deepEqual(data, expected)

      this.once('data', function(data)
      {
        var expected = fixtures.response[1]

        assert.deepEqual(data, expected)

        done()
      })
      .close()
    })
    .on('error', done)
  })

  it('Get attribute from several contexts using pattern', function(done)
  {
  //  assert.expect(2)

    var fixtures = require('./fixtures/queryContext3')

    var response = fixtures.response_server
    server.post('/NGSI10/queryContext').reply(200, response)

    var request = fixtures.request
    request.fiwareService = FIWARE_SERVICE

    ContextBroker(request)
    .once('data', function(data)
    {
      var expected = fixtures.response[0]

      assert.deepEqual(data, expected)

      this.once('data', function(data)
      {
        var expected = fixtures.response[1]

        assert.deepEqual(data, expected)

        done()
      })
      .close()
    })
    .on('error', done)
  })

  it('Get attribute from several contexts using RegExp', function(done)
  {
  //  assert.expect(2)

    var fixtures = require('./fixtures/queryContext3')

    var response = fixtures.response_server
    server.post('/NGSI10/queryContext').reply(200, response)

    var entity = fixtures.request_RegExp.entities[0]

    entity.id = RegExp('/'+entity.id+'/')
    delete entity.isPattern

    var request = fixtures.request
    request.fiwareService = FIWARE_SERVICE

    ContextBroker(request)
    .once('data', function(data)
    {
      var expected = fixtures.response[0]

      assert.deepEqual(data, expected)

      this.once('data', function(data)
      {
        var expected = fixtures.response[1]

        assert.deepEqual(data, expected)

        done()
      })
      .close()
    })
    .on('error', done)
  })

  it('Non existing entity', function(done)
  {
  //  assert.expect(1)

    var fixtures = require('./fixtures/queryContext4')

    var response = fixtures.response_server
    server.post('/NGSI10/queryContext').reply(200, response)

    var request = fixtures.request
    request.fiwareService = FIWARE_SERVICE

    ContextBroker(request)
    .on('error', function(error)
    {
      assert.notEqual(error, undefined)

      done()
    })
    .resume()
  })

  it('Non existing attribute', function(done)
  {
  //  assert.expect(1)

    var fixtures = require('./fixtures/queryContext4')

    var response = fixtures.response_server
    server.post('/NGSI10/queryContext').reply(200, response)

    var request = fixtures.request
    request.fiwareService = FIWARE_SERVICE

    ContextBroker(request)
    .on('error', function(error)
    {
      assert.notEqual(error, undefined)

      done()
    })
    .resume()
  })
})


describe('subscription', function()
{
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

    proxy.close()
  })


  it('Subscribe & receive data', function(done)
  {
  //  assert.expect(1)

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
    request.fiwareService = FIWARE_SERVICE
    request.options.subscription.webhook = 'http://localhost:'+proxyPort+'/accumulate'

    ContextBroker(request)
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
    request.fiwareService = FIWARE_SERVICE
    request.options.subscription.webhook = {hostname: 'localhost'}

    ContextBroker(request)
    .once('data', function(data)
    {
      var expected = fixtures.notification[0]

      assert.deepEqual(data, expected)

      this.close()
      done()
    })
    .on('error', done)
  })

  xit('Update & close', function(done)
  {
  //  assert.expect(2)

    var fixtures = require('./fixtures/subscribeContext2')

    server
    .post('/NGSI10/subscribeContext')         .reply(200, fixtures.response)
    .post('/NGSI10/updateContextSubscription').reply(200, fixtures.update_response)
    .post('/NGSI10/unsubscribeContext')       .reply(200, fixtures.unsubscribe_response)


    const throttling = 'PT10S'

    // Connect to servers
    var request = fixtures.request
    request.fiwareService = FIWARE_SERVICE
    request.options.subscription.webhook = 'http://localhost:'+proxyPort+'/accumulate'

    ContextBroker(request)
    .update({throttling: throttling})
    .then(function()
    {
      console.log('this.throttling:',this, this.constructor.name)
      assert.strictEqual(this.throttling, throttling)
    },
    done)
    .close()
    .then(function()
    {
      assert.strictEqual(this.subscriptionId, null)
    })
    .then(done, done)
  })
})
