async = require 'async'
express = require 'express'
fs = require 'fs'
httpProxy = require 'http-proxy'
{version} = require('./package')

CONFIG_DIR="#{process.env.HOME}/.mehserve"
HTML_DIR="#{__dirname}/html"
PORT = process.env.PORT ? 12439
DNS_PORT = process.env.DNS_PORT ? 15353
SUFFIXES=[/\.dev$/i, /\.meh$/i, /(\.[0-9]+){2,4}\.xip\.io$/i]
# Maximum number of attempts with exponential back-off
EXPONENTIAL_MAXIMUM_ATTEMPTS = 25
# Maximum delay between exponential back-off attempts
EXPONENTIAL_MAXIMUM_DELAY = 2500

useExponentialBackoff = false
for arg in process.argv.slice(2)
  matches = arg.match(/^--([a-z-]+)(?:=(.*))?$/)
  if matches
    if matches[1] == 'exponential-backoff'
      useExponentialBackoff = true
      EXPONENTIAL_MAXIMUM_ATTEMPTS = parseInt(matches[2]) || EXPONENTIAL_MAXIMUM_ATTEMPTS
      console.log("Exponential backoff enabled, with #{EXPONENTIAL_MAXIMUM_ATTEMPTS} attempts")

renderTemplate = (template, templateVariables = {}) ->
  template.replace /\{\{([a-zA-Z0-9_-]+)\}\}/g, (_, varName) ->
      templateVariables[varName] ? ""

handleError = (req, res, next) ->
  (error) ->
    title = null
    message = null
    code = null
    switch error.code
      when 'ECONNREFUSED'
        code = 502
        title = 'Bad Gateway'
        message = "Looks like you forgot to run server on port #{error.port}!"
      else
        code = 500
        title = 'Internal Server Error'
        message = error.message || "Something bad happened!"

    res.statusCode = code
    content = renderTemplate(fs.readFileSync("#{HTML_DIR}/error.html", 'utf8'), {
      code: code,
      title: title,
      message: message,
      version: version,
      details: error.stack
    })
    res.setHeader('Content-Type', 'text/html; charset=UTF-8')
    res.setHeader('Content-Length', content.length)
    res.end(content)

readConfig = (req, res, next) ->
  async.waterfall [
    # Determine host from header
    (done) ->
      hostHeader = req.headers.host || "localhost"
      host = hostHeader.split(':', 1)[0]
      for suffixRegexp in SUFFIXES
        if suffixRegexp.test(host)
          host = host.replace(suffixRegexp, "")
          break
      done null, host

    # Determine which config to use
    (host, done) ->
      split = host.split(".")
      options = []
      for i in [0...split.length]
        options.push split[split.length - i - 1..].join(".")
      options.push "default"
      exists = (option, done) ->
        fs.exists "#{CONFIG_DIR}/#{option}", done
      async.detectSeries options, exists, (configName) ->
        return done null, configName if configName
        err = new Error "Configuration not found"
        err.code = 500
        done err

    # Get stats
    (configName, done) ->
      fs.stat "#{CONFIG_DIR}/#{configName}", (err, stats) ->
        done(err, configName, stats)

    # Interpret stats
    (configName, stats, done) ->
      if stats.isDirectory()
        config =
          type: 'static'
          path: "#{CONFIG_DIR}/#{configName}"
      else
        contents = fs.readFileSync("#{CONFIG_DIR}/#{configName}", 'utf8')
        if contents[0] is "{"
          config = JSON.parse(contents)
        else
          lines = contents.split("\n")
          if lines[0].match(/^[0-9]+$/)
            config =
              type: 'port'
              port: parseInt(lines[0], 10)
          else if lines[0].match(/^\//)
            config =
              type: 'static'
              path: "#{lines[0]}"
          else
            config = {}
      done null, config

  ], (error, config) ->
    if error
      return handleError(req, res, next)(error)
    req.config = config
    next()

handle = (req, res, next) ->
  if req.config.type is 'port'
    forward(req, res, next)
  else if req.config.type is 'static'
    serve(req, res, next)
  else
    err = new Error "Config not understood"
    err.code = 500
    err.meta = req.config
    next err

staticMiddlewares = {}
serve = (req, res, next) ->
  config = req.config
  path = config.path
  staticMiddlewares[path] ?= express.static(path)
  staticMiddlewares[path](req, res, next)


proxy = httpProxy.createProxyServer {host: "localhost", ws: true}

proxy.on 'error', (e) ->
  console.error "http-proxy emitted an error:"
  console.error e.stack

proxyWithExponentialBackoff = (req, res, next, attempts = 0) ->
  config = req.config
  port = config.port
  cb = (err) ->
    if !err
      return next()
    if req.method == 'GET' and attempts < EXPONENTIAL_MAXIMUM_ATTEMPTS
      # To avoid memory leaks, we need to clear event listeners previously set
      # via the proxy code:
      # https://github.com/nodejitsu/node-http-proxy/blob/c979ba9f2cbb6988a210ca42bf59698545496723/lib/http-proxy/passes/web-incoming.js#L137-L143
      req.removeAllListeners('aborted')
      req.removeAllListeners('error')

      nextDelay = Math.min(
        EXPONENTIAL_MAXIMUM_DELAY,
        Math.ceil(1 + Math.random() * Math.pow(attempts, 2) * 10)
      )

      setTimeout(
        (-> proxyWithExponentialBackoff(req, res, next, attempts + 1)),
        nextDelay
      )
    else
      handleError(req, res, next)(err)

  proxy.web req, res, {target: {port: port}}, cb

forward = (req, res, next) ->
  proxyWithExponentialBackoff(req, res, next, if useExponentialBackoff then 0 else EXPONENTIAL_MAXIMUM_ATTEMPTS)

upgrade = (req, socket, head) ->
  readConfig req, null, (err) ->
    return socket.close() if err
    config = req.config
    port = config.port
    proxy.ws req, socket, head, {target: {port: port}}


server = express()
server.use readConfig
server.use handle

httpServer = server.listen PORT, ->
  port = httpServer.address().port
  console.log "mehserve v#{version} listening on port #{port}"

httpServer.on 'upgrade', upgrade

dnsServer = require './dnsserver'
dnsServer.serve DNS_PORT
