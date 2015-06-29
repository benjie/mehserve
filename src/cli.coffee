fs = require 'fs'

CONFIG_DIR="#{process.env.HOME}/.mehserve"

args = process.argv[2..]

if args[0] is "install"
  console.log """
    Run:

      sudo cp #{__dirname}/meh.resolver /etc/resolver/meh
      sudo cp #{__dirname}/meh.firewall.plist /Library/LaunchDaemons/meh.firewall.plist
      sudo launchctl load -w /Library/LaunchDaemons/meh.firewall.plist
    """
else if args[0] is "run"
  require './index'
else if args.length is 2
  configName = args[0]
  path = "#{CONFIG_DIR}/#{configName}"
  fs.writeFileSync(path, args[1])
else
  console.log """
    Usage:

      mehserve install
      mehserve run
      mehserve [subdomain] [destination]

    Destination can be a path or a port number.
    """
