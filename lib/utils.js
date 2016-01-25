var reviver = require('./reviver')


/**
 *
 */
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
    this.pause()

    var error = new Error(statusCode.reasonPhrase)
        error.code = code
        error.contextElement = contextElement

    return this.emit('error', error)
  }

  // If internal queue is full, stop emitting `data` events
  if(!this.push(contextElement)) this.pause()
}


/**
 *
 */
function processResponse(body)
{
  var response = JSON.parse(body, reviver)

  var errorCode = response.errorCode
  if(errorCode)
  {
    this.pause()

    var error = new Error(errorCode.reasonPhrase)
        error.code = errorCode.code

    return this.emit('error', error)
  }

  response.contextResponses.forEach(processContextResponse, this)
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


exports.processResponse = processResponse
exports.setAsPattern    = setAsPattern
