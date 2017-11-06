const fs = require("fs");
const os = require("os");
const { createSSLCertificateFor } = require("./ssl");

const CONFIG_DIR = `${process.env.HOME}/.mehserve`;

try {
  fs.mkdirSync(CONFIG_DIR);
} catch (error) {
  // It probably already exists; ignore.
}

const args = process.argv.slice(2);

if (args[0] === "install") {
  switch (os.platform()) {
    case "darwin":
      console.log(`\
We've detected you're running OS X. To get things up and running we need to set up the .meh and .dev DNS entries and a port forwarding firewall rule so mehserve takes over ports 80 and 443 without requiring root privileges.

Please note that you will be responsible for undoing these changes should you wish to uninstall mehserve, and due to these changes you may get delays resolving DNS queries when mehserve is not running.

  sudo mkdir -p /etc/resolver
  sudo cp ${__dirname}/meh.resolver /etc/resolver/meh
  sudo cp ${__dirname}/meh.resolver /etc/resolver/dev
  sudo cp ${__dirname}/meh.firewall.plist /Library/LaunchDaemons/meh.firewall.plist
  sudo launchctl load -w /Library/LaunchDaemons/meh.firewall.plist

We recommend running mehserve all the time using daemon manager. And if you follow the steps bellow you don't need to run \`mehserve run\` or using other daemon manager like \`pm2\`.

  cp ${__dirname}/meh.mehserve.plist ~/Library/LaunchAgents/meh.mehserve.plist
  launchctl load ~/Library/LaunchAgents/meh.mehserve.plist\
`);
      break;
    case "linux":
      console.log(`\
We've detected you're running Linux. The following instructions are specifically for Ubuntu (15.10) but you should be able to adjust them to your OS.

We're using dnsmasq to resolve .dev and .meh domains to localhost (127.0.0.1), and iptables to redirect ports 12439 and 12443 locally to ports 80 and 443 so we don't need to run with root privileges.

Please note that you will be responsible for undoing these changes should you wish to uninstall mehserve. We recommend running mehserve all the time using something like \`pm2\`.

  sudo apt-get install dnsmasq
  echo -e "local=/dev/\\naddress=/dev/127.0.0.1" | sudo tee /etc/dnsmasq.d/dev-tld
  echo -e "local=/meh/\\naddress=/meh/127.0.0.1" | sudo tee /etc/dnsmasq.d/meh-tld
  sudo service dnsmasq restart
  sudo iptables -t nat -A OUTPUT -o lo -p tcp --dport 80 -j REDIRECT --to-port 12439
  sudo iptables -t nat -A OUTPUT -o lo -p tcp --dport 443 -j REDIRECT --to-port 12443
  sudo iptables-save\
`);
      break;
    default:
      console.log(`\
mehserve is only tested on OS X and Ubuntu Linux, but you should be able to make it work on your platform by adding all your local .dev/.meh hostnames to your /etc/hosts (or equivalent) file, and redirecting port 12439 to port 80.\
`);
  }

  console.log(`\

Please note that you can change the default HTTP port 12439, HTTPS port 12443, and DNS port 15353 by providing PORT, SSL_PORT and DNS_PORT environment variables, in which case you will also need to modify resolver and firewall files accordingly.\
`);
} else if (args[0] === "run") {
  require("./index");
} else if (args[0] === "ssl") {
  createSSLCertificateFor(args[1]).then(null, e => {
    console.error(e);
    process.exit(1);
  });
} else if ((args.length === 3 && args[0] === "add") || args.length === 2) {
  const configName = args[args.length - 2];
  const path = `${CONFIG_DIR}/${configName}`;
  fs.writeFileSync(path, args[args.length - 1]);
} else {
  console.log(`\
Usage:

  mehserve install

    Outputs instructions to install mehserve.


  mehserve run [--exponential-backoff=25]

    Runs mehserve's HTTP, HTTPS and DNS servers.
    (With --exponential-backoff, in the event that your server goes down mehserve will queue your request and retry a few times rather than just outputting an error message.)
    It's advised that you run mehserve at all times using something like pm2, e.g. with \`pm2 start mehserve -- run && pm2 dump\`


  mehserve ssl <subdomain>

    Provisions a self-signed SSL certificate for <subdomain> (using \`openssl\`) and prompts you to install it.


  mehserve add <subdomain> <destination>

    Tells mehserve to respond to request for <subdomain> by:
    - if <destination> is a number then proxying to that port number
    - if <destination> is a path then by serving that folder as static content

\
`);
}
