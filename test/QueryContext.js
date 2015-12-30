#!/usr/bin/env node

if (typeof QUnit === 'undefined')
{
  QUnit = require('qunit-cli')
  QUnit.load()
}

var nock = require('nock')

var QueryContext = require('../lib/QueryContext')


const SERVER = 'example.com'
const FIWARE_SERVICE = 'MyService'


nock.disableNetConnect()

var server = nock('http://'+SERVER)


QUnit.module('QueryContext',
{
  afterEach: function()
  {
    nock.cleanAll()
  }
})


QUnit.test('Get context', function(assert)
{
  assert.expect(1)

  var done = assert.async()

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

QUnit.test('Get attribute', function(assert)
{
  assert.expect(1)

  var done = assert.async()

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
QUnit.test('Get attribute from several contexts', function(assert)
{
  assert.expect(2)

  var done = assert.async()

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

QUnit.test('Get attribute from several contexts using pattern', function(assert)
{
  assert.expect(2)

  var done = assert.async()

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

QUnit.test('Get attribute from several contexts using RegExp', function(assert)
{
  assert.expect(2)

  var done = assert.async()

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

QUnit.test('Non existing entity', function(assert)
{
  assert.expect(1)

  var done = assert.async()

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

QUnit.test('Non existing attribute', function(assert)
{
  assert.expect(1)

  var done = assert.async()

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
