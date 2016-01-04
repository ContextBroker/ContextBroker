var Readable = require('stream').Readable
var request  = require('http').request

var concat   = require('concat-stream')
var inherits = require('util').inherits

var thenableUtils = require('thenable-utils')


const requestOptions =
{
  method: 'POST',
  headers:
  {
    'Accept'       : 'application/json',
    'Content-Type' : 'application/json'
  }
}


/**
 *
 */
function gotSubscribeContext(body)
{
  var subscriptionId = JSON.parse(body).subscribeResponse.subscriptionId

  Object.defineProperty(this, 'subscriptionId', {value: subscriptionId})

  this.emit('subscriptionId', subscriptionId)
}

/**
 *
 */
function gotUpdateContextSubscription(body)
{
  var subscribeResponse = JSON.parse(body).subscribeResponse

  delete subscribeResponse.subscriptionId

  for(var key in subscribeResponse)
    subscribeResponse[key] = {value: subscribeResponse[key]}

  Object.defineProperties(this, subscribeResponse)
}

/**
 *
 */
function gotUnsubscribeContext()
{
  Object.defineProperty(this, 'subscriptionId', {value: null})
}


/**
 *
 */
function sendRequest(requestOptions, data, callback)
{
  var self = this

  request(requestOptions, function(res)
  {
    res.pipe(concat({encoding: 'string'}, callback.bind(self)))
  })
  .end(JSON.stringify(data))
}


/**
 *
 */
function SubscribeContext(options)
{
  if(!(this instanceof ContextBroker)) return new ContextBroker(options)

  options = options || {}
  options.objectMode = true

  ContextBroker.super_.call(this, options)


  requestOptions.hostname                  = options.hostname
  requestOptions.headers['Fiware-Service'] = options.fiwareService


  var condValues = options.condValues
  if(condValues == null) condValues = options.attributes

  var data =
  {
    entities:   options.entities,
    attributes: options.attributes,
    reference:  options.reference,
    duration:   options.duration,
    notifyConditions:
    [
      {
        type: 'ONCHANGE',
        condValues: condValues
      }
    ],
    throttling: options.throttling
  }

  requestOptions.path = '/NGSI10/subscribeContext'
  sendRequest(requestOptions, data, gotSubscribeContext)
}
inherits(SubscribeContext, Readable)


/**
 *
 */
SubscribeContext.prototype.update = function(data)
{
  data.subscriptionId = this.subscriptionId

  var promise = new Promise(function(resolve, reject)
  {
    requestOptions.path = '/NGSI10/updateContextSubscription'
    sendRequest(requestOptions, data, resolve)
  })
  .then(gotUpdateContextSubscription)

  return disguise(promise, this)
}

/**
 *
 */
SubscribeContext.prototype.close = function()
{
  var data = {subscriptionId: this.subscriptionId}

  var promise = new Promise(function(resolve, reject)
  {
    requestOptions.path = '/NGSI10/unsubscribeContext'
    sendRequest(requestOptions, data, resolve)
  })
  .then(gotUnsubscribeContext)

  return disguise(promise, this)
}

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
      self.once('subscriptionId', success)

    success(self.subscriptionId)
  })

  return disguise(promise, this)
}

/**
 *
 */
SubscribeContext.prototype.catch = function(onRejected)
{
  return this.then(null, onRejected)
}


module.exports = SubscribeContext
