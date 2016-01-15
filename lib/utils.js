/**
 * Allow to use RegExp as entity IDs
 *
 * @param {Object} entity
 */
function setAsPattern(entity)
{
  if(entity.id instanceof RegExp) entity.isPattern = true
}


exports.setAsPattern = setAsPattern
