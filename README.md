# mehserve 🤷‍♂️

<span class="badge-patreon"><a href="https://patreon.com/benjie" title="Support Benjie's OSS development on Patreon"><img src="https://img.shields.io/badge/donate-via%20Patreon-orange.svg" alt="Patreon donate button" /></a></span>
[![Package on npm](https://img.shields.io/npm/v/mehserve.svg?style=flat)](https://www.npmjs.com/package/mehserve)
[![Follow](https://img.shields.io/badge/twitter-@Benjie-blue.svg)](https://twitter.com/Benjie)
![MIT license](https://img.shields.io/npm/l/mehserve.svg)

**¯\\\_(ツ)\_/¯ serve**: a simple port-sharing proxy for development on multiple local domains,
supports websockets (e.g. for webpack hot module replacement), SSL
termination, and queuing requests whilst development server restarts so you
don't get the annoying connection refused messages.

E.g. imagine you have Create React App running on port 3000, a Node.js server
running on port 3030, and a Rails API running on port 3060, you can use
mehserve to make these available as `https://client.meh`, `https://server.meh`
and `https://api.meh` respectively. (Commands to enable this would be:
`mehserve add client 3000; mehserve add server 3030; mehserve add api 3060;`
followed by `mehserve ssl client.meh` commands for each domain to walk you
through enabling SSL.)

**NOTE**: since Google registered the `.dev` TLD in 2015 and then forced
certificate pinning on it in 2017 you can no longer use `*.dev` domains
without a lot of work. Fortunately mehserve supports `*.meh` domains which
was originally a joke... Hopefully no-one registers the `.meh` TLD!

## Features ✨

- Quick (near instant) startup
- Built in DNS server to redirect _.meh, _.dev to 127.0.0.1 (requires
  additional configuration for your system to use this server)
- Proxies regular HTTP requests and websocket connections based on the `Host`
  HTTP header
- Easy to configure
- Subdomain configuration is updated on a per-request basis - no need to
  restart server
- supports [xip.io](http://xip.io/) domains
- SSL termination (using SNI to support multiple domains on one port)
- Self-signed SSL certificate generation and help installing
- `mehserve run --exponential-backoff` will automatically re-attempt requests
  when your development server restarts (e.g. due to file changes) saving
  you from receiving the error page in the intervening seconds (ALPHA)

## Status ✅

I've been using this for a few years now, it's been very smooth for me. I
work on a lot of different projects in parallel. YMMV. This is NOT for
production usage, it's only intended for use on your own development machine!

## Getting Started 🚀

Mehserve itself should run on Linux and OS X, but to have .meh / .dev domains
resolve to localhost and to have it run on port 80 you need to do a little
additional configuration.

We've currently only instructed you how to do this on OS X and Ubuntu; pull
requests welcome.

### Installing 💾

```bash
npm install -g mehserve
mehserve install
```

follow the instructions to set up port forwarding and DNS resolution.

### Running 🏃‍♀️

To run the server:

`mehserve run`

We don't currently daemonize the server, pull requests to add this
functionality would be welcome. In the mean time we recommend you [set up
`pm2`](http://pm2.keymetrics.io/docs/usage/quick-start/) and then tell it to
run mehserve with:

`pm2 run /path/to/mehserve -- run --exponential-backoff && pm2 dump`

### Configuring subdomains ⚙️

#### Port forwarding ↪️

To set up a subdomain, simply run

`mehserve add mysite 1337`

This'll tell mehserve to proxy all HTTP requests for `mysite.dev`, `mysite.meh`
and `mysite.*.*.*.*.xip.io` to `localhost:1337`

#### Static files 📄

Alternatively, to serve static files:

`mehserve add staticsite /path/to/public`

This'll tell mehserve to serve static content from `/path/to/public/` to anyone
requesting `http://staticsite.meh/`

#### SSL certificates 🔐

If you want a local domain to be served with SSL you must generate a
certificate for it:

`mehserve ssl staticsite`

Then follow the instructions.

#### DNS resolution fails whilst offline 🌎

This is an issue with discoveryd (it also affects Pow - see
https://github.com/basecamp/pow/issues/471) - should be fixed by
updating to OS X 10.10.4

## TODO 😅

Pull requests welcome!

- Tests
- Daemonize
- Scripts directory organzation
  ```
  mehserve
  └── extras
      ├── macos-launchd
      ├── supervisord
      ├── systemd
      └── systemv
  ```
- Homebrew (`node` formula dependency) [Homebrew CONTRIBUTING](https://github.com/caskroom/homebrew-cask/blob/master/CONTRIBUTING.md)

### Removing old .dev TLD

As .dev is now a valid TLD we no longer use it as the domain extension. If you have installed an older version of mehserve you can remove local resolving of the .dev domain by running `sudo rm /etc/resolver/dev` from a terminal.
