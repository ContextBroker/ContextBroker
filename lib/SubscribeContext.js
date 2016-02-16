var createServer = require('http').createServer
var Readable     = require('stream').Readable

var clone            = require('clone')
var deepFreeze       = require('deep-freeze')
var disguiseThenable = require('disguise').disguiseThenable
var inherits         = require('inherits')
var request          = require('request-promise')
var thenableUtils    = require('thenable-utils')
var WebhookPost      = require('webhook-post')

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
 * @param {Object} [options.webhook]
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

  var end = this.push.bind(this, null)


  //
  // Webhook
  //

  var webhook = options.webhook

  // Create webhook
  webhook = WebhookPost(webhook, options)
  .on('open', function(url)
  {
    requestData.reference = url

    requestOptions.uri.path = '/NGSI10/subscribeContext'
    requestOptions.body = requestData

    request(requestOptions)
    .then(updateProperties)
    .then(self.emit.bind(self, 'subscriptionId'))
    .catch(function(error)
    {
      self.emit('error', error)

      webhook = null
      end()
    })
  })
  .on('data', processResponse.bind(this))
  .on('error', this.emit.bind(this, 'error'))
  .on('end', closeWebhook)


  /**
   *
   */
  function closeWebhook(result)
  {
    if(!webhook) return result

    webhook.close()
    webhook = null

    Object.defineProperty(self, 'subscriptionId', {value: null})

    var data = {subscriptionId: this.subscriptionId}

    requestOptions.uri.path = '/NGSI10/unsubscribeContext'
    requestOptions.body = data

    return request(requestOptions).then(Promise.resolve(result))
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
      if(!webhook) return Promise.reject('No active connection')

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
  this.close = this.then.bind(this, closeWebhook, Promise.resolve)
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
