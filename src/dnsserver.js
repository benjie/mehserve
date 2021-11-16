const dns = require("native-dns");

const server = dns.createServer();

server.on("request", function(req, res) {
  if (req.question[0].name.match(/\.(meh|dev|localhost)/)) {
    res.answer.push(
      dns.A({
        name: req.question[0].name,
        address: "127.0.0.1",
        ttl: 600,
      })
    );
    res.answer.push(
      dns.AAAA({
        name: req.question[0].name,
        address: "::1",
        ttl: 600,
      })
    );
    res.send();
  }
});

module.exports = server;
