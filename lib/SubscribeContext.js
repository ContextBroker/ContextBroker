var createServer = require('http').createServer
var Readable     = require('stream').Readable

var clone            = require('clone')
var deepFreeze       = require('deep-freeze')
var disguiseThenable = require('disguise').disguiseThenable
var EventSource      = require('eventsource')
var inherits         = require('util').inherits
var request          = require('request-promise')
var thenableUtils    = require('thenable-utils')

var utils = require('./utils')

var processResponse = utils.processResponse
var setAsPattern    = utils.setAsPattern


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

  var requestData = {entities: entities}

  // Add attributes to the request only if they are defined
  var attributes = options.attributes
  if(attributes && attributes.length) requestData.attributes = attributes

  var duration = options.duration
  if(duration) requestData.duration = duration

  var throttling = options.throttling
  if(throttling) requestData.throttling = throttling

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

  function requestSubscribe(reference)
  {
    requestData.reference = reference

    requestOptions.uri.path = '/NGSI10/subscribeContext'
    requestOptions.body = requestData

    request(requestOptions)
    .then(updateProperties)
    .then(self.emit.bind(self, 'subscriptionId'))
    .catch(onError)
  }

  var reference = options.reference

  // We have a reference URL to the notifications server, use it
  if(reference)
  {
    var eventSource = new EventSource(reference)

    eventSource.addEventListener('open', function()
    {
  //    this.removeEventListener('error', onError)
      this.removeListener('error', onError)

      requestSubscribe(reference)
    })
    eventSource.addEventListener('error', onError)
    eventSource.addEventListener('message', function(message)
    {
      processResponse.call(self, message.data)
    })
  }

  // We don't have a reference URL to the notifications server, create a local
  // web server and listen to the POST from the Context Broker
  else
  {
    var port     = options.port     || 0
    var hostname = options.hostname || '0.0.0.0'

    var server = createServer(function(req, res)
    {
      req.pipe(concat(function(body)
      {
        res.end()
        processResponse(body.toString())
      }))
    })
    .listen(port, hostname, function()
    {
      var address = this.address()

      requestSubscribe('http://'+address.address+':'+address.port)
    })
  }


  /**
   *
   */
  function onCloseRequest(result)
  {
    Object.defineProperty(self, 'subscriptionId', {value: null})

    if(server)
      server.close(self.emit.bind(self, 'close'))
    else
    {
      eventSource.close()
      self.emit('close')
    }

    return result
  }


  /**
   * Update the properties
   *
   * @param {Object} body
   */
  function updateProperties(body)
  {
    var subscribeResponse = body.subscribeResponse

    for(var key in subscribeResponse)
      subscribeResponse[key] = {value: subscribeResponse[key]}

    Object.defineProperties(self, subscribeResponse)
  }


  /**
   *
   */
  this.update = function(data)
  {
    return this
    .then(function()
    {
      data.subscriptionId = this.subscriptionId

      requestOptions.uri.path = '/NGSI10/updateContextSubscription'
      requestOptions.body = data

      return request(requestOptions)
    })
    .then(updateProperties)
  }

  /**
   *
   */
  this.close = function()
  {
    return this.then(function()
    {
      var data = {subscriptionId: this.subscriptionId}

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
 * More data requested, re-start sending `data` events
 *
 * @private
 */
SubscribeContext.prototype._read = function()
{
  this.resume()
}


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
