var Readable = require('stream').Readable
var request  = require('http').request

var clone      = require('clone')
var deepFreeze = require('deep-freeze')
var inherits   = require('inherits')
var request    = require('request-promise')

var reviver      = require('./reviver')
var setAsPattern = require('./utils').setAsPattern


/**
 * Common options for all the requests
 */
const REQUEST_OPTIONS =
{
  method: 'POST',
  uri:
  {
    pathname: '/NGSI10/queryContext',
    port: 80,
    protocol: 'http:'
  },
  headers:
  {
    'Accept'      : 'application/json',
    'Content-Type': 'application/json'
  }
}
deepFreeze(REQUEST_OPTIONS)


/**
 * Connect to the ContextBroker using the QueryContext API
 *
 * Fetch the updates from the ContextBroker using polling.
 *
 * @class
 *
 * @param {Object} [options]
 */
function QueryContext(options)
{
  if(!(this instanceof QueryContext)) return new QueryContext(options)

  var self = this

  options = options || {}

  options.objectMode = true
  QueryContext.super_.call(this, options)


  var requestOptions = clone(REQUEST_OPTIONS)

  requestOptions.uri.hostname              = options.hostname
  requestOptions.headers['Fiware-Service'] = options.fiwareService


  // Validate options
  var entities = options.entities
  if(!entities)        throw '`entities` must be an Array'
  if(!entities.length) throw '`entities` array must not be empty'

  entities.forEach(setAsPattern)

  var requestData = {entities: entities}

  // Add attributes to the request only if they are defined
  var attributes = options.attributes
  if(attributes && attributes.length) requestData.attributes = attributes

  requestOptions.body = JSON.stringify(requestData)


  var inFlight
  var req


  /**
   * Process the data response from the Context Broker
   *
   * @param {string} body
   */
  function gotContextResponses(body)
  {
    var fetchMoreData = true

    var response = JSON.parse(body, reviver)

    var errorCode = response.errorCode
    if(errorCode)
    {
      fetchMoreData = false

      var error = new Error(errorCode.reasonPhrase)
          error.code = errorCode.code

      return self.emit('error', error)
    }

    response.contextResponses.forEach(function(contextResponse)
    {
      var contextElement = contextResponse.contextElement
      var statusCode     = contextResponse.statusCode

      // Remove useless `contextElement.isPattern`, it's always `false`
      delete contextElement.isPattern

      // errorCode?
      var code = statusCode.code
      if(code != 200)
      {
        fetchMoreData = false

        var error = new Error(statusCode.reasonPhrase)
            error.code = code
            error.contextElement = contextElement

        return this.emit('error', error)
      }

      fetchMoreData = this.push(contextElement) && fetchMoreData
    },
    self)

    inFlight = false

    // No errors and there's space on the buffer, request more updated data
    if(fetchMoreData) self._read()
  }


  /**
   * Request for more data from the Context Broker
   *
   * @private
   */
  this._read = function()
  {
    if(this._readableState.ended || inFlight) return

    inFlight = true

    req = request(requestOptions)
    .then(gotContextResponses)
    .catch()
  }

  /**
   * Close the connection and stop emitting more data updates
   */
  this.close = function()
  {
    if(req)
    {
//      req.abort()
      req = null
    }

    this.push(null)
  }
}
inherits(QueryContext, Readable)


module.exports = QueryContext
