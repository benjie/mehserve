# mehserve

A simple port-sharing proxy for development on multiple local domains, supports
websockets.

## Inspiration

Inspired by basecamp's pow.cx server, we wanted something that also supported
websockets. Pow's codebase is significantly out of date so it was easier to
start fresh.

## Features

- Quick (near instant) startup
- Built in DNS server to redirect *.meh, *.dev to 127.0.0.1 (requires
  additional configuration for your system to use this server)
- Proxies regular HTTP requests and websocket connections based on the `Host`
  HTTP header
- Extremely lean
- Easy to configure
- Subdomain configuration is updated on a per-request basis - no need to
  restart server
- supports [xip.io](http://xip.io/) domains

## Status

This is a work in progress. It does not have pretty errors, and it's a bit
frustrating to configure, especially if you've previously had basecamp's pow
installed.

## Getting Started

Mehserve itself should run on Linux and OS X, but to have .meh / .dev domains
resolve to localhost and to have it run on port 80 you need to do a little
additional configuration.

We've currently only instructed you how to do this on OS X and Ubuntu; pull
requests welcome.

### Installing

```bash
npm install -g mehserve
mehserve install
```

follow the instructions to set up port forwarding and DNS resolution.

### Running

To run the server:

`mehserve run`

(we don't currently daemonize the server, pull requests welcome)

### Configuring subdomains

#### Port forwarding

To set up a subdomain, simply run

`mehserve mysite 1337`

This'll tell mehserve to proxy all HTTP requests for `mysite.dev`, `mysite.meh`
and `mysite.*.*.*.*.xip.io` to `localhost:1337`

#### Static files

Alternatively, to serve static files:

`mehserve staticsite /path/to/public`

This'll tell mehserve to serve static content from `/path/to/public/` to anyone
requesting `http://staticsite.dev/`

#### DNS resolution fails whilst offline

This is an issue with discoveryd (it also affects Pow - see
https://github.com/basecamp/pow/issues/471) - should be fixed by
updating to OS X 10.10.4

## TODO

- Tests
- Daemonize
- Linux instructions
