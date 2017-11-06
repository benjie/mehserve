const async = require("async");
const express = require("express");
const httpProxy = require("http-proxy");
const { version } = require("./package");
const http = require("http");
const https = require("https");
const fs = require("fs-extra");
const tls = require("tls");

const CONFIG_DIR = `${process.env.HOME}/.mehserve`;
const HTML_DIR = `${__dirname}/html`;
const PORT = process.env.PORT ? process.env.PORT : 12439;
const SSL_PORT = process.env.SSL_PORT ? process.env.SSL_PORT : 12443;
const DNS_PORT = process.env.DNS_PORT ? process.env.DNS_PORT : 15353;
const SUFFIXES = [/\.dev$/i, /\.meh$/i, /(\.[0-9]+){2,4}\.xip\.io$/i];
// Maximum number of attempts with exponential back-off
let EXPONENTIAL_MAXIMUM_ATTEMPTS = 25;
// Maximum delay between exponential back-off attempts
const EXPONENTIAL_MAXIMUM_DELAY = 2500;

let useExponentialBackoff = false;
for (let arg of process.argv.slice(2)) {
  const matches = arg.match(/^--([a-z-]+)(?:=(.*))?$/);
  if (matches) {
    if (matches[1] === "exponential-backoff") {
      useExponentialBackoff = true;
      EXPONENTIAL_MAXIMUM_ATTEMPTS =
        parseInt(matches[2]) || EXPONENTIAL_MAXIMUM_ATTEMPTS;
      console.log(
        `Exponential backoff enabled, with ${EXPONENTIAL_MAXIMUM_ATTEMPTS} attempts`
      );
    }
  }
}

const renderTemplate = function(template, templateVariables) {
  if (templateVariables == null) {
    templateVariables = {};
  }
  return template.replace(
    /\{\{([a-zA-Z0-9_-]+)\}\}/g,
    (_, varName) =>
      templateVariables[varName] != null ? templateVariables[varName] : ""
  );
};

const handleError = (req, res, _next) =>
  function(error) {
    let title = null;
    let message = null;
    let code = null;
    switch (error.code) {
      case "ECONNREFUSED":
        code = 502;
        title = "Bad Gateway";
        message = `Looks like you forgot to run server on port ${error.port}!`;
        break;
      default:
        code = 500;
        title = "Internal Server Error";
        message = error.message || "Something bad happened!";
    }

    res.statusCode = code;
    const content = renderTemplate(
      fs.readFileSync(`${HTML_DIR}/error.html`, "utf8"),
      {
        code,
        title,
        message,
        version,
        details: error.stack,
      }
    );
    res.setHeader("Content-Type", "text/html; charset=UTF-8");
    res.setHeader("Content-Length", content.length);
    res.end(content);
  };

const readConfig = (req, res, next) =>
  async.waterfall(
    [
      // Determine host from header
      function(done) {
        const hostHeader = req.headers.host || "localhost";
        let host = hostHeader.split(":", 1)[0];
        for (let suffixRegexp of SUFFIXES) {
          if (suffixRegexp.test(host)) {
            host = host.replace(suffixRegexp, "");
            break;
          }
        }
        done(null, host);
      },

      // Determine which config to use
      function(host, done) {
        const split = host.split(".");
        const options = [];
        for (let i = 0, end = split.length; i < end; i++) {
          options.push(split.slice(split.length - i - 1).join("."));
        }
        options.push("default");
        const exists = (option, done) =>
          fs.exists(`${CONFIG_DIR}/${option}`, done);
        async.detectSeries(options, exists, function(configName) {
          if (configName) {
            done(null, configName);
            return;
          }
          const err = new Error("Configuration not found");
          err.code = 500;
          done(err);
        });
      },

      // Get stats
      (configName, done) =>
        fs.stat(`${CONFIG_DIR}/${configName}`, (err, stats) =>
          done(err, configName, stats)
        ),
      // Interpret stats
      function(configName, stats, done) {
        let config;
        if (stats.isDirectory()) {
          config = {
            type: "static",
            path: `${CONFIG_DIR}/${configName}`,
          };
        } else {
          const contents = fs.readFileSync(
            `${CONFIG_DIR}/${configName}`,
            "utf8"
          );
          if (contents[0] === "{") {
            config = JSON.parse(contents);
          } else {
            const lines = contents.split("\n");
            if (lines[0].match(/^[0-9]+$/)) {
              config = {
                type: "port",
                port: parseInt(lines[0], 10),
              };
            } else if (lines[0].match(/^\//)) {
              config = {
                type: "static",
                path: `${lines[0]}`,
              };
            } else {
              config = {};
            }
          }
        }
        done(null, config);
      },
    ],
    function(error, config) {
      if (error) {
        handleError(req, res, next)(error);
        return;
      }
      req.config = config;
      next();
    }
  );

const handle = function(req, res, next) {
  if (req.config.type === "port") {
    forward(req, res, next);
  } else if (req.config.type === "static") {
    serve(req, res, next);
  } else {
    const err = new Error("Config not understood");
    err.code = 500;
    err.meta = req.config;
    next(err);
  }
};

const staticMiddlewares = {};
var serve = function(req, res, next) {
  const { config } = req;
  const { path } = config;
  if (staticMiddlewares[path] == null) {
    staticMiddlewares[path] = express.static(path);
  }
  staticMiddlewares[path](req, res, next);
};

const proxy = httpProxy.createProxyServer({ host: "localhost", ws: true });

proxy.on("error", function(e) {
  console.error("http-proxy emitted an error:");
  console.error(e.stack);
});

var proxyWithExponentialBackoff = function(req, res, next, attempts) {
  if (attempts == null) {
    attempts = 0;
  }
  const { config } = req;
  const { port } = config;
  const cb = function(err) {
    if (!err) {
      next();
    } else if (
      req.method === "GET" &&
      attempts < EXPONENTIAL_MAXIMUM_ATTEMPTS
    ) {
      // To avoid memory leaks, we need to clear event listeners previously set
      // via the proxy code:
      // https://github.com/nodejitsu/node-http-proxy/blob/c979ba9f2cbb6988a210ca42bf59698545496723/lib/http-proxy/passes/web-incoming.js#L137-L143
      req.removeAllListeners("aborted");
      req.removeAllListeners("error");

      const nextDelay = Math.min(
        EXPONENTIAL_MAXIMUM_DELAY,
        Math.ceil(1 + Math.random() * Math.pow(attempts, 2) * 10)
      );

      setTimeout(
        () => proxyWithExponentialBackoff(req, res, next, attempts + 1),
        nextDelay
      );
    } else {
      handleError(req, res, next)(err);
    }
  };

  proxy.web(req, res, { target: { port } }, cb);
};

var forward = (req, res, next) => {
  proxyWithExponentialBackoff(
    req,
    res,
    next,
    useExponentialBackoff ? 0 : EXPONENTIAL_MAXIMUM_ATTEMPTS
  );
};

const upgrade = (req, socket, head) =>
  readConfig(req, null, function(err) {
    if (err) {
      socket.close();
      return;
    }
    const { config } = req;
    const { port } = config;
    proxy.ws(req, socket, head, { target: { port } });
  });

const secureContextContainerCache = {};
const MAX_SSL_CACHE_AGE_IN_MILLISECONDS = 1000 * 30;

async function createSecureContext(servername) {
  const [key, cert] = await Promise.all([
    fs.readFile(`${CONFIG_DIR}/${servername}.ssl.key`, "utf8"),
    fs.readFile(`${CONFIG_DIR}/${servername}.ssl.crt`, "utf8"),
  ]);
  const context = tls.createSecureContext({
    key,
    cert,
  });
  secureContextContainerCache[servername] = {
    context,
    createdAt: Date.now(),
  };
  return context;
}

async function getSecureContext(servername) {
  const contextContainer = secureContextContainerCache[servername];
  const isValid = contextContainer =>
    contextContainer.createdAt > Date.now() - MAX_SSL_CACHE_AGE_IN_MILLISECONDS;
  if (contextContainer && isValid(contextContainer)) {
    return contextContainer.context;
  }
  if (contextContainer) {
    // Give ourselves a minute to create a new context, let old requests continue in the mean time.
    contextContainer.createdAt = Date.now() + 60 * 1000;
    createSecureContext(servername).then(null, e => {
      console.error(`Could not generate secure context for '${servername}'`);
      console.error(e);
    });
    return contextContainer.context;
  } else {
    return createSecureContext(servername);
  }
}

const server = express();
server.use(readConfig);
server.use(handle);

var httpServer = http.createServer(server);
httpServer.listen(PORT, function() {
  const { port } = httpServer.address();
  console.log(`mehserve v${version} listening on port ${port}`);
});
var httpsServer = https.createServer(
  {
    async SNICallback(servername, cb) {
      let ctx, err;
      try {
        ctx = await getSecureContext(servername);
      } catch (e) {
        console.error(
          `Could not generate secure context for server '${servername}': ${e.message}`
        );
        err = e;
      } finally {
        cb(err, ctx);
      }
    },
  },
  server
);
httpsServer.listen(SSL_PORT, function() {
  const { port } = httpsServer.address();
  console.log(`mehserve v${version} (SSL) listening on port ${port}`);
});

httpServer.on("upgrade", upgrade);
httpsServer.on("upgrade", upgrade);

const dnsServer = require("./dnsserver");
dnsServer.serve(DNS_PORT);
