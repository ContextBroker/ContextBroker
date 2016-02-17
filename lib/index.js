var Duplex = require('stream').Duplex

var disguiseThenable = require('disguise').disguiseThenable
var inherits         = require('inherits')
var request          = require('request-promise')
var thenableUtils    = require('thenable-utils')
var WebhookPost      = require('webhook-post')

var reviver = require('./reviver')


const SERVER = 'example.com'


function processContextResponse(contextResponse)
{
  var contextElement = contextResponse.contextElement
  var statusCode     = contextResponse.statusCode

  // Remove useless `contextElement.isPattern`, it's always `false`
  delete contextElement.isPattern

  // errorCode?
  var code = statusCode.code
  if(code != 200)
  {
    var error = new Error(statusCode.reasonPhrase)
        error.code = code
        error.contextElement = contextElement

    return this.emit('error', error)
  }

  // If internal queue is full, stop emitting `data` events
  return this.push(contextElement)
}

/**
 * Allow to use RegExp as entity IDs
 *
 * @param {Object} entity
 */
function setAsPattern(entity)
{
  if(entity.id instanceof RegExp) entity.isPattern = true

  return entity
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
    subscribeResponse[key] =
    {
      value: subscribeResponse[key],
      configurable: true
    }

  Object.defineProperties(this, subscribeResponse)
}


/**
 * Connection to the ContextBroker
 *
 * Send data to the ContextBroker and allow to receive updates by polling or
 * using a webhook (both locally or using a Server Send Events server)
 *
 * @class
 *
 * @param {string} fiwareService
 * @param {Array.<string>} entities
 * @param {Object} [options]
 * @param {string} [options.hostname]
 * @param {Array.<string>} [options.attributes]
 * @param {Object} [options.subscription]
 * @param {moment.duration} [options.subscription.duration]
 * @param {moment.duration} [options.subscription.throttling]
 * @param {Array.<string>} [options.subscription.condValues]
 * @param {string|Object} [options.subscription.webhook]
 *
 * @emits {ContextBroker#data} data
 */
function ContextBroker(fiwareService, entities, options)
{
  // Allow to define arguments as a literal object
  if(fiwareService.constructor.name === 'Object')
  {
    entities = fiwareService.entities
    options  = fiwareService.options

    fiwareService = fiwareService.fiwareService
  }

  // Validate entities
  if(!entities.length) throw '`entities` array must not be empty'


  if(!(this instanceof ContextBroker))
    return new ContextBroker(fiwareService, entities, options)

  var self = this

  options = options || {}

  options.objectMode = true
  ContextBroker.super_.call(this, options)

  var end = this.push.bind(this, null)


  // Create common request options
  var requestOptions =
  {
    method: 'POST',
    uri:
    {
      hostname: options.hostname || SERVER,
      port: 80,          // Are these needed?
      protocol: 'http:'  //
    },
    headers:
    {
      'Accept'        : 'application/json',
      'Fiware-Service': fiwareService
    },
    json: true,
    jsonReviver: reviver
  }

  // Create common request data
  var requestData = {entities: entities.map(setAsPattern)}

  // Add attributes to the request only if they are defined
  var attributes = options.attributes
  if(attributes && attributes.length) requestData.attributes = attributes

  requestOptions.body = requestData


  //
  // Subscription
  //

  var subscription = options.subscription
  if(subscription)
  {
    var duration = subscription.duration
    if(duration) requestData.duration = duration

    var throttling = subscription.throttling
    if(throttling) requestData.throttling = throttling

    // Set the condition values from the attributes if they are not defined
    var condValues = subscription.condValues || attributes

    requestData.notifyConditions =
    [
      {
        type: 'ONCHANGE',
        condValues: condValues
      }
    ]


    //
    // Webhook
    //

    var webhook = subscription.webhook
    if(webhook)
    {
      // Create webhook
      webhook = WebhookPost(webhook, options)
      .on('open', function(url)
      {
        requestData.reference = url

        requestOptions.uri.path = '/NGSI10/subscribeContext'
        requestOptions.body = requestData

        request(requestOptions)
        .then(updateProperties.bind(self))
        .then(self.emit.bind(self, 'subscriptionId'))
        .catch(function(error)
        {
          self.emit('error', error)

          webhook = null
          end()
        })
      })
      .on('data', function(data)
      {
        var response = JSON.parse(data, reviver)

        var errorCode = response.errorCode
        if(errorCode)
        {
          var error = new Error(errorCode.reasonPhrase)
              error.code = errorCode.code

          return this.emit('error', error)
        }

        response.contextResponses.forEach(processContextResponse, self)
      })
      .on('error', this.emit.bind(this, 'error'))
      .on('end', unsubscribe)


      /**
       *
       */
      function unsubscribe()
      {
        if(webhook)
        {
          webhook = null

          requestOptions.uri.path = '/NGSI10/unsubscribeContext'
          requestOptions.body = {subscriptionId: this.subscriptionId}

          Object.defineProperty(self, 'subscriptionId',
          {
            value: null,
            configurable: true
          })

          return request(requestOptions)
        }
      }
    }
  }


  //
  // Polling and not-flowing mode
  //

  var polling
  var inFlight

  /**
   * Process a Telegram `Update` object and check if it should do more requests
   *
   * @param {Boolean} fetchMoreDate
   * @param {Object} update
   *
   * @return Boolean - more `Update` objects can be fetch
   */
  function processResponse_reduce(fetchMoreDate, contextResponse)
  {
    return processContextResponse.call(self, contextResponse) && fetchMoreDate
  }

  /**
   * Process the data response from the Context Broker
   *
   * @param {string} body
   */
  function processResponse(response)
  {
    inFlight = false

    var errorCode = response.errorCode
    if(errorCode)
    {
      var error = new Error(errorCode.reasonPhrase)
          error.code = errorCode.code

      return this.emit('error', error)
    }

    if(response.contextResponses.reduce(processResponse_reduce, true)
    && subscription)
      setTimeout(self._read, 1000)
  }

  /**
   * Emit an error when requesting updates failed and free `inFlight` flag
   *
   * @param {Error} error
   */
  function onError(error)
  {
    inFlight = false

    self.emit('error', error)
  }


  /**
   * Request more data. This will not work when using a webhook
   *
   * @private
   */
  this._read = function()
  {
    var state = self._readableState
    var limit = state.highWaterMark - state.length

    if(inFlight || state.ended || !limit
    || polling === null || webhook !== undefined)
      return

    inFlight = true

    requestOptions.uri.path = '/NGSI10/queryContext'

    polling = request(requestOptions)
    .then(processResponse)
    .catch(onError)

    // [ToDo] Implement subscription polling
  }


  //
  // Duplex API
  //

  /**
   * Write data on the Context Broker
   *
   * @param {Object} chunk
   * @param {*} _ - ignored
   * @param {Function} done
   *
   * @private
   */
  this._write = function(chunk, _, done)
  {
    done()
  }


  //
  // Public API
  //

  /**
   *
   */
  this.update = function(data)
  {
    return this
    .then(function()
    {
      if(!webhook) return Promise.reject(new Error('No active connection'))

      data.subscriptionId = this.subscriptionId

      requestOptions.uri.path = '/NGSI10/updateContextSubscription'
      requestOptions.body = data

      return request(requestOptions)
    })
    .then(updateProperties)
  }

  /**
   * Close the connection and stop emitting more data updates
   */
  this.close = function()
  {
    // return this
    // .then(function()
    // {
      if(webhook === null) return

      if(webhook)
      {
        var close = webhook.close.bind(webhook)

        return unsubscribe().then(close, close)
      }

      if(polling)
      {
        var result = polling.then(end, end)
        polling = null

        return result
      }
//    })
  }
}
inherits(ContextBroker, Duplex)


//
// Thenable interface
//

/**
 *
 */
ContextBroker.prototype.then = function(onFulfilled, onRejected)
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
ContextBroker.prototype.catch = thenableUtils.catch


module.exports = ContextBroker
