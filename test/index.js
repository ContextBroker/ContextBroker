['SubscribeContext', 'QueryContext'].forEach(function(name)
{
  describe(name, function()
  {
    require('./'+name)
  })
})
