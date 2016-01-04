var Readable = require('stream').Readable
var request  = require('http').request

var inherits = require('inherits')

var reviver = require('./reviver')


/**
 * Common options for all the requests
 */
const requestOptions =
{
  method: 'POST',
  path: '/NGSI10/queryContext',
  headers:
  {
    'Accept'       : 'application/json',
    'Content-Type' : 'application/json'
  }
}


/**
 * Process the data response from the Context Broker
 *
 * @param {http.ClientRequest} res
 */
function requestCallback(res)
{
  var self = this

  var body = ''

  res.on('data', function(chunk)
  {
    body += chunk
  })
  res.on('end', function()
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

    self.inFlight = false

    // No errors and there's space on the buffer, request more updated data
    if(fetchMoreData) self._read()
  })
}


/**
 * Allow to use RegExp as entity IDs
 *
 * @param {Object} entity
 */
function setAsPattern(entity)
{
  if(entity.id instanceof RegExp) entity.isPattern = true
}


/**
 * @class
 *
 * @param {Object} [options]
 */
function QueryContext(options)
{
  if(!(this instanceof QueryContext)) return new QueryContext(options)

  options = options || {}

  options.objectMode = true
  QueryContext.super_.call(this, options)


  // Validate options
  var entities = options.entities
  if(!entities) throw "'entities' must be an Array"
  if(!entities.length) throw "'entities' array must not be empty"

  entities.forEach(setAsPattern)

  var requestData = {entities: entities}

  // Add attributes to the request only if they are defined
  var attributes = options.attributes
  if(attributes && attributes.length) requestData.attributes = attributes

  requestData = JSON.stringify(requestData)

  var rc = requestCallback.bind(this)


  var req

  /**
   * Request for more data from the Context Broker
   *
   * @private
   */
  this._read = function()
  {
    if(this._readableState.ended || this.inFlight) return

    this.inFlight = true

    requestOptions.hostname                  = options.hostname
    requestOptions.headers['Fiware-Service'] = options.fiwareService

    req = request(requestOptions, rc).end(requestData)
  }

  /**
   * Close the connection and stop emitting more data updates
   *
   * @private
   */
  this.close = function()
  {
    if(req)
    {
      req.abort()
      req = null
    }

    this.push(null)
  }
}
inherits(QueryContext, Readable)


module.exports = QueryContext
