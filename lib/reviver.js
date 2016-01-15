var duration = require('moment').duration


/* https://github.com/moment/moment/blob/develop/src/lib/duration/create.js */
const isoRegex = /^(-)?P(?:(?:([0-9,.]*)Y)?(?:([0-9,.]*)M)?(?:([0-9,.]*)D)?(?:T(?:([0-9,.]*)H)?(?:([0-9,.]*)M)?(?:([0-9,.]*)S)?)?|([0-9,.]*)W)$/


// Add a JSON representation for RegExp objects
if(RegExp.prototype.toJSON === undefined)
   RegExp.prototype.toJSON = RegExp.prototype.toString


/**
 * Check if an object is a number or represent one of them
 *
 * @param {*} value
 *
 * @return {Boolean}
 */
function isNumber(value)
{
  return !isNaN(value)
}

/**
 * Create Javascript objects from the string fields on a JSON object
 *
 * Promote the string fields to Javascript objects when the server returns a
 * JSON with only strings on its values. The current promotions are {Boolean},
 * {Number}, {RegExp} and {duration}.
 *
 * @param {string} key
 *  key of the JSON object, ignored
 * @param {*} value
 *  value to be converted in a Javascript object
 */
function reviver(key, value)
{
  if(typeof value === 'string')
  {
    // Boolean
    if(value === 'false') return false
    if(value === 'true')  return true

    // Number
    if(isNumber(value)) return parseFloat(value)

    // RegExp
    var length = value.length
    if(length > 1
    && '/' === value[0]
    && '/' === value[length-1])
      return RegExp(value)

    // ISO8601 duration
    if(value.match(isoRegex)) return duration(value)
  }

  return value
}


module.exports  = reviver
