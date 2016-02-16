var assert = require('assert')

var nock = require('nock')

var QueryContext = require('..').QueryContext

nock.disableNetConnect()


const SERVER = 'example.com'
const FIWARE_SERVICE = 'MyService'


var server = nock('http://'+SERVER)


afterEach(nock.cleanAll)

it('Get context', function(done)
{
//  assert.expect(1)

  var fixtures = require('./fixtures/queryContext1')

  var response = fixtures.response_server
  server.post('/NGSI10/queryContext').reply(200, response)

  QueryContext(
  {
    hostname: SERVER,
    fiwareService: FIWARE_SERVICE,
    entities: fixtures.request.entities
  })
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

  QueryContext(
  {
    hostname: SERVER,
    fiwareService: FIWARE_SERVICE,
    entities: fixtures.request.entities
  })
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

  QueryContext(
  {
    hostname: SERVER,
    fiwareService: FIWARE_SERVICE,
    entities: fixtures.request.entities
  })
  .once('data', function(data)
  {
    var expected = fixtures.response[0]

    assert.deepEqual(data, expected)

    this.once('data', function(data)
    {
      var expected = fixtures.response[1]

      assert.deepEqual(data, expected)

      this.close()
      done()
    })
  })
  .on('error', done)
})

it('Get attribute from several contexts using pattern', function(done)
{
//  assert.expect(2)

  var fixtures = require('./fixtures/queryContext3')

  var response = fixtures.response_server
  server.post('/NGSI10/queryContext').reply(200, response)

  QueryContext(
  {
    hostname: SERVER,
    fiwareService: FIWARE_SERVICE,
    entities: fixtures.request_RegExp.entities
  })
  .once('data', function(data)
  {
    var expected = fixtures.response[0]

    assert.deepEqual(data, expected)

    this.once('data', function(data)
    {
      var expected = fixtures.response[1]

      assert.deepEqual(data, expected)

      this.close()
      done()
    })
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

  QueryContext(
  {
    hostname: SERVER,
    fiwareService: FIWARE_SERVICE,
    entities: [entity]
  })
  .once('data', function(data)
  {
    var expected = fixtures.response[0]

    assert.deepEqual(data, expected)

    this.once('data', function(data)
    {
      var expected = fixtures.response[1]

      assert.deepEqual(data, expected)

      this.close()
      done()
    })
  })
  .on('error', done)
})

it('Non existing entity', function(done)
{
//  assert.expect(1)

  var fixtures = require('./fixtures/queryContext4')

  var response = fixtures.response_server
  server.post('/NGSI10/queryContext').reply(200, response)

  QueryContext(
  {
    hostname: SERVER,
    fiwareService: FIWARE_SERVICE,
    entities: fixtures.request.entities
  })
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

  QueryContext(
  {
    hostname: SERVER,
    fiwareService: FIWARE_SERVICE,
    entities: fixtures.request_attribute.entities
  })
  .on('error', function(error)
  {
    assert.notEqual(error, undefined)

    done()
  })
  .resume()
})
