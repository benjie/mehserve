async = require 'async'
express = require 'express'
fs = require 'fs'
request = require 'request'

CONFIG_DIR="#{process.env.HOME}/.mehserve"
PORT = process.env.PORT ? 8080
SUFFIXES=[".localhost:#{PORT}"]

readConfig = (req, res, next) ->
  async.waterfall [
    # Determine host from header
    (done) ->
      host = req.headers.host
      for suffix in SUFFIXES
        endOfHost = host.substr(host.length - suffix.length)
        if endOfHost.toLowerCase() is suffix.toLowerCase()
          host = host.substr(0, host.length - suffix.length)
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

  ], (err, config) ->
    return next err if err
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

forward = (req, res, next) ->
  config = req.config
  port = config.port
  headers = {}

  for key, value of req.headers when value?
    headers[key] = value

  headers['X-Forwarded-For'] = req.connection.address().address ? "-"

  proxy = request
    method: req.method
    url: forwardUrl = "http://localhost:#{port}#{req.url}"
    headers: headers
    jar: false
    followRedirect: false

  req.pipe proxy
  proxy.pipe res

  proxy.on 'error', (err) ->
    res.status(500).send "ERROR #{err?.message}"

  req.resume()

server = express()
server.use readConfig
server.use handle
httpServer = server.listen PORT, ->
  port = httpServer.address().port
