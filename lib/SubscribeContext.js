var Readable = require('stream').Readable

var clone            = require('clone')
var deepFreeze       = require('deep-freeze')
var disguiseThenable = require('disguise').disguiseThenable
var EventSource      = require('eventsource')
var inherits         = require('util').inherits
var request          = require('request-promise')
var thenableUtils    = require('thenable-utils')

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
    port: 80,
    protocol: 'http:'
  },
  headers:
  {
    'Accept'      : 'application/json',
    'Content-Type': 'application/json'
  },
  json: true
}
deepFreeze(REQUEST_OPTIONS)



/**
 * Connect to the ContextBroker using the SubscribeContext API
 *
 * Request and manage a subscription to the ContextBroker and receive the
 * updates using a Server Send Events server.
 *
 * @class
 *
 * @param {Object} [options]
 */
function SubscribeContext(options)
{
  if(!(this instanceof SubscribeContext)) return new SubscribeContext(options)

  var self = this

  options = options || {}

  options.objectMode = true
  SubscribeContext.super_.call(this, options)


  var requestOptions = clone(REQUEST_OPTIONS)

  requestOptions.uri.hostname              = options.hostname
  requestOptions.headers['Fiware-Service'] = options.fiwareService


  // Validate options
  var entities = options.entities
  if(!entities)        throw '`entities` must be an Array'
  if(!entities.length) throw '`entities` array must not be empty'

  entities.forEach(setAsPattern)

  var requestData =
  {
    duration:   options.duration,
    entities:   entities,
    reference:  options.reference,
    throttling: options.throttling
  }

  // Add attributes to the request only if they are defined
  var attributes = options.attributes
  if(attributes && attributes.length) requestData.attributes = attributes

  // Set the condition values from the attributes if they are not defined
  var condValues = options.condValues
  if(condValues == null) condValues = attributes

  requestData.notifyConditions =
  [
    {
      type: 'ONCHANGE',
      condValues: condValues
    }
  ]


  Object.defineProperties(this,
  {
    subscriptionId:
    {
      configurable: true,
      enumerable: true
    },
    throttling:
    {
      configurable: true,
      enumerable: true
    }
  })


  //
  // Connect to the ContextBroker and the notifications server
  //

  function onError(error)
  {
    console.trace(error)
    self.close()
  }

  var eventSource = new EventSource(options.reference)

  eventSource.addEventListener('open', function()
  {
//    this.removeEventListener('error', onError)
    this.removeListener('error', onError)

    requestOptions.uri.path = '/NGSI10/subscribeContext'
    requestOptions.body = requestData

    request(requestOptions)
    .then(function(body)
    {
      var subscribeResponse = body.subscribeResponse

      for(var key in subscribeResponse)
        subscribeResponse[key] =
        {
          configurable: true,
          enumerable: true,
          value: subscribeResponse[key]
        }

      Object.defineProperties(self, subscribeResponse)

      self.emit('subscriptionId')
    })
    .catch(onError)
  })
  eventSource.addEventListener('error', onError)
  eventSource.addEventListener('message', function(message)
  {
    var response = JSON.parse(message.data, reviver)

    var errorCode = response.errorCode
    if(errorCode)
    {
      self.close()

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
        this.close()

        var error = new Error(statusCode.reasonPhrase)
            error.code = code
            error.contextElement = contextElement

        return this.emit('error', error)
      }

      this.push(contextElement)
    },
    self)
  })


  /**
   *
   */
  function onCloseRequest(result)
  {
    eventSource.close()

    Object.defineProperty(self, 'subscriptionId', {value: null})

    self.emit('close')

    return result
  }


  /**
   *
   */
  function updateResponse(body)
  {
    var subscribeResponse = body.subscribeResponse

    // We already have it
    delete subscribeResponse.subscriptionId

    // Update the properties
    for(var key in subscribeResponse)
      subscribeResponse[key] = {value: subscribeResponse[key]}

    Object.defineProperties(self, subscribeResponse)
  }


  /**
   *
   */
  this.update = function(data)
  {
    data.subscriptionId = this.subscriptionId

    return this
    .then(function()
    {
      requestOptions.uri.path = '/NGSI10/updateContextSubscription'
      requestOptions.body = data

      return request(requestOptions)
    })
    .then(updateResponse)
  }

  /**
   *
   */
  this.close = function()
  {
    var data = {subscriptionId: this.subscriptionId}

    return this.then(function()
    {
      requestOptions.uri.path = '/NGSI10/unsubscribeContext'
      requestOptions.body = data

      return request(requestOptions).then(onCloseRequest, onCloseRequest)
    },
    Promise.resolve)
  }
}
inherits(SubscribeContext, Readable)


//
// Readable interface
//

/**
 * This is needed due to `Readable` API, but we don't use it
 *
 * @private
 */
SubscribeContext.prototype._read = function(){}


//
// Thenable interface
//

/**
 *
 */
SubscribeContext.prototype.then = function(onFulfilled, onRejected)
{
  var self = this

  var promise = new Promise(function(resolve, reject)
  {
    var success = thenableUtils.success(resolve, reject, onFulfilled, self)
    var failure = thenableUtils.failure(reject, onRejected, self)

    if(self.subscriptionId === null) return failure()
    if(self.subscriptionId === undefined)
      return self.once('subscriptionId', success)

    success(self.subscriptionId)
  })

  return disguiseThenable(promise, this)
}

/**
 *
 */
SubscribeContext.prototype.catch = thenableUtils.catch


module.exports = SubscribeContext
