fs = require 'fs'

CONFIG_DIR="#{process.env.HOME}/.mehserve"

args = process.argv[2..]

if args.length is 2
  configName = args[0]
  path = "#{CONFIG_DIR}/#{configName}"
  fs.writeFileSync(path, args[1])
else
  console.log """
    Usage: mehserve [subdomain] [destination]

    Destination can be a path or a port number.
    """
