fs = require 'fs'
os = require 'os'

CONFIG_DIR="#{process.env.HOME}/.mehserve"

args = process.argv[2..]

if args[0] is "install"
  # coffeelint: disable=max_line_length
  switch os.platform()
    when "darwin"
      console.log """
        We've detected you're running OS X. To get things up and running we need to set up the .meh and .dev DNS entries and a port forwarding firewall rule so mehserve takes over port 80 without requiring root privileges.

        Please note that you will be responsible for undoing these changes should you wish to uninstall mehserve, and due to these changes you may get delays resolving DNS queries when mehserve is not running - we recommend running mehserve all the time using something like `pm2`.

          sudo mkdir -p /etc/resolver
          sudo cp #{__dirname}/meh.resolver /etc/resolver/meh
          sudo cp #{__dirname}/meh.resolver /etc/resolver/dev
          sudo cp #{__dirname}/meh.firewall.plist /Library/LaunchDaemons/meh.firewall.plist
          sudo launchctl load -w /Library/LaunchDaemons/meh.firewall.plist
        """
    when "linux"
      console.log """
        We've detected you're running Linux. The following instructions are specifically for Ubuntu (15.10) but you should be able to adjust them to your OS.

        We're using dnsmasq to resolve .dev and .meh domains to localhost (127.0.0.1), and iptables to redirect port 12439 locally to port 80 so we don't need to run with root privileges.

        Please note that you will be responsible for undoing these changes should you wish to uninstall mehserve. We recommend running mehserve all the time using something like `pm2`.

          sudo apt-get install dnsmasq
          echo -e "local=/dev/\\naddress=/dev/127.0.0.1" | sudo tee /etc/dnsmasq.d/dev-tld
          echo -e "local=/meh/\\naddress=/meh/127.0.0.1" | sudo tee /etc/dnsmasq.d/meh-tld
          sudo service dnsmasq restart
          sudo iptables -t nat -A OUTPUT -o lo -p tcp --dport 80 -j REDIRECT --to-port 12439
          sudo iptables-save
        """
    else
      console.log """
        mehserve is only tested on OS X and Ubuntu Linux, but you should be able to make it work on your platform by adding all your local .dev/.meh hostnames to your /etc/hosts (or equivalent) file, and redirecting port 12439 to port 80.
        """

  console.log """

        Please note that you can change the default HTTP port 12439, and DNS port 15353 by providing PORT and DNS_PORT environment varialbes, in which case you will also need to modify resolver and firewall files accordingly.
        """
  # coffeelint: enable=max_line_length
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
